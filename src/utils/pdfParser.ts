import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure worker using Vite's ?url import for reliable bundling
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

interface ParsedRow {
  date: string;
  description: string;
  amount: string;
  type: 'cargo' | 'abono';
}

// Spanish month abbreviations
const MONTH_MAP: Record<string, string> = {
  'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04',
  'may': '05', 'jun': '06', 'jul': '07', 'ago': '08',
  'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12',
};

/**
 * Extract text items with position info from a PDF
 */
async function extractTextItems(file: File): Promise<{ items: TextItem[]; fullText: string; pages: TextItem[][] }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  const allItems: TextItem[] = [];
  const pages: TextItem[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageItems: TextItem[] = [];

    for (const item of textContent.items as any[]) {
      if (item.str && item.str.trim()) {
        const x = item.transform[4];
        const y = viewport.height - item.transform[5]; // flip Y
        pageItems.push({ str: item.str.trim(), x, y, width: item.width });
        fullText += item.str + ' ';
      }
    }
    fullText += '\n';
    allItems.push(...pageItems);
    pages.push(pageItems);
  }

  return { items: allItems, fullText, pages };
}

/**
 * Group text items into rows based on Y position
 */
function groupIntoRows(items: TextItem[], tolerance = 5): TextItem[][] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= tolerance) {
      currentRow.push(sorted[i]);
    } else {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
      currentRow = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  currentRow.sort((a, b) => a.x - b.x);
  rows.push(currentRow);

  return rows;
}

/**
 * Detect bank format from full text
 */
type BankFormat = 'bbva_debit' | 'bbva_credit' | 'banregio' | 'unknown';

function detectFormat(fullText: string): BankFormat {
  const t = fullText.toLowerCase();
  if (t.includes('hey banco') || t.includes('banregio') || t.includes('cuenta hey smart')) {
    return 'banregio';
  }
  if (t.includes('bbva') && (t.includes('tarjeta') || t.includes('tdc') || t.includes('crédito') || t.includes('credito') || t.includes('tarjeta oro'))) {
    return 'bbva_credit';
  }
  if (t.includes('bbva') && (t.includes('libretón') || t.includes('libreton') || t.includes('cuenta digital'))) {
    return 'bbva_debit';
  }
  if (t.includes('bbva')) {
    return 'bbva_debit'; // default BBVA
  }
  return 'unknown';
}

/**
 * Parse amount string to clean number string
 */
function cleanAmount(val: string): string {
  return val.replace(/[$,\s+]/g, '').trim();
}

/**
 * Parse BBVA debit format
 * Dates like "22/AGO", amounts in CARGOS/ABONOS columns
 */
function parseBBVADebit(pages: TextItem[][], fullText: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  
  // Extract year from period text like "DEL 15/08/2024 AL 14/09/2024"
  const yearMatch = fullText.match(/(?:AL|al)\s+\d{1,2}\/\d{1,2}\/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

  // Date pattern: DD/MMM (Spanish 3-letter month)
  const datePattern = /^(\d{1,2})\/([A-Za-zÁÉÍÓÚáéíóú]{3})$/;
  // Amount pattern
  const amountPattern = /^[\d,]+\.\d{2}$/;

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);
    
    // Find the header row to detect CARGOS and ABONOS column X positions
    let cargosX = -1;
    let abonosX = -1;
    
    for (const row of rows) {
      for (const item of row) {
        const t = item.str.toUpperCase().trim();
        if (t === 'CARGOS') cargosX = item.x;
        if (t === 'ABONOS') abonosX = item.x;
      }
      if (cargosX > 0 && abonosX > 0) break;
    }
    
    // If we couldn't find headers, use a large tolerance fallback
    const hasCols = cargosX > 0 && abonosX > 0;
    const colMidpoint = hasCols ? (cargosX + abonosX) / 2 : 0;
    
    for (const row of rows) {
      const texts = row.map(item => item.str);
      
      // Look for date at the beginning
      let dateStr = '';
      let foundDateIdx = -1;
      
      for (let i = 0; i < texts.length; i++) {
        const match = texts[i].match(datePattern);
        if (match) {
          const day = match[1].padStart(2, '0');
          const monthAbbr = match[2].toLowerCase();
          const month = MONTH_MAP[monthAbbr];
          if (month) {
            dateStr = `${day}/${month}/${year}`;
            foundDateIdx = i;
            break;
          }
        }
      }
      
      if (!dateStr || foundDateIdx < 0) continue;
      
      // Skip rows that look like dates only (two dates side by side = FECHA OPER)
      // We need at least a description
      
      // Find amounts in the row with their X positions
      const amounts: { value: string; x: number; idx: number }[] = [];
      for (let i = foundDateIdx + 1; i < texts.length; i++) {
        const cleaned = texts[i].replace(/[$,]/g, '');
        if (amountPattern.test(texts[i]) || /^[\d]+\.\d{2}$/.test(cleaned)) {
          amounts.push({ value: texts[i], x: row[i].x, idx: i });
        }
      }
      
      if (amounts.length === 0) continue;
      
      // Build description: text between second date occurrence and first amount
      // BBVA debit has: FECHA | OPER | LIQ(=date) | DESCRIPCION | ... | CARGOS | ABONOS | ...
      const descParts: string[] = [];
      let dateCount = 0;
      for (let i = foundDateIdx; i < amounts[0].idx; i++) {
        if (datePattern.test(texts[i])) {
          dateCount++;
          continue;
        }
        // Skip reference-like strings (long numbers, "Referencia", etc.)
        if (/^\d{10,}$/.test(texts[i])) continue;
        descParts.push(texts[i]);
      }
      const description = descParts.join(' ').trim();
      
      if (description.length < 2) continue;
      
      // Determine cargo vs abono using column X positions
      let isCargo = true;
      
      if (hasCols) {
        // Use the first amount's X position relative to column headers
        const firstAmountX = amounts[0].x;
        // If the amount is closer to ABONOS column, it's an abono
        const distToCargos = Math.abs(firstAmountX - cargosX);
        const distToAbonos = Math.abs(firstAmountX - abonosX);
        isCargo = distToCargos <= distToAbonos;
      } else {
        // Fallback to keyword matching
        const descLower = description.toLowerCase();
        const isAbono = descLower.includes('recibido') || 
                        descLower.includes('abono') || 
                        descLower.includes('pago cuenta de tercero') ||
                        descLower.includes('devuelto');
        isCargo = !isAbono;
      }
      
      const amount = cleanAmount(amounts[0].value);
      
      results.push({
        date: dateStr,
        description,
        amount: isCargo ? `-${amount}` : amount,
        type: isCargo ? 'cargo' : 'abono',
      });
    }
  }

  return results;
}

/**
 * Parse BBVA credit card format
 * Dates like "07-may-2025", amounts with +/- $
 */
function parseBBVACredit(pages: TextItem[][], fullText: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  
  // Match lines with date pattern DD-mmm-YYYY
  const datePattern = /(\d{1,2})-([a-záéíóú]{3})-(\d{4})/i;
  const amountPattern = /([+-])\s*\$\s*([\d,]+\.\d{2})/;

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);
    
    for (const row of rows) {
      const rowText = row.map(item => item.str).join(' ');
      
      const dateMatch = rowText.match(datePattern);
      if (!dateMatch) continue;
      
      const day = dateMatch[1].padStart(2, '0');
      const monthAbbr = dateMatch[2].toLowerCase();
      const month = MONTH_MAP[monthAbbr];
      if (!month) continue;
      const dateStr = `${day}/${month}/${dateMatch[3]}`;
      
      const amountMatch = rowText.match(amountPattern);
      if (!amountMatch) continue;
      
      const sign = amountMatch[1];
      const amountVal = amountMatch[2].replace(/,/g, '');
      
      // Extract description: text between the two date occurrences and before amount
      // Format: "fecha operacion | fecha cargo | descripcion | monto"
      const texts = row.map(item => item.str);
      const descParts: string[] = [];
      let dateCount = 0;
      let reachedDesc = false;
      
      for (const text of texts) {
        if (datePattern.test(text)) {
          dateCount++;
          if (dateCount >= 2) reachedDesc = true;
          continue;
        }
        if (reachedDesc && !amountPattern.test(text) && !text.match(/^[+-]$/) && !text.match(/^\$/) && !text.match(/^[\d,]+\.\d{2}$/)) {
          descParts.push(text);
        }
      }
      
      const description = descParts.join(' ').trim();
      if (description.length < 2) continue;
      
      // For credit cards: + = cargo (expense), - = payment/abono
      const isCargo = sign === '+';
      
      results.push({
        date: dateStr,
        description,
        amount: isCargo ? `-${amountVal}` : amountVal,
        type: isCargo ? 'cargo' : 'abono',
      });
    }
  }

  return results;
}

/**
 * Parse Banregio / Hey Banco format
 * Days only (09, 10...), period header gives month/year
 * Columns: DIA | CONCEPTO | CARGOS | ABONOS | SALDO
 */
function parseBanregio(pages: TextItem[][], fullText: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  
  // Extract period: "del 01 al 31 de ENERO 2025"
  const periodMatch = fullText.match(/del\s+\d+\s+al\s+\d+\s+de\s+([A-ZÁÉÍÓÚa-záéíóú]+)\s+(\d{4})/i);
  let periodMonth = '01';
  let periodYear = new Date().getFullYear().toString();
  
  if (periodMatch) {
    const monthName = periodMatch[1].toLowerCase();
    const monthNames: Record<string, string> = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
      'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
      'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
    };
    periodMonth = monthNames[monthName] || '01';
    periodYear = periodMatch[2];
  }

  const amountPattern = /^[\d,]+\.\d{2}$/;

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);
    
    for (const row of rows) {
      const texts = row.map(item => item.str);
      
      // First element should be the day (1-2 digits)
      if (texts.length < 3) continue;
      const dayMatch = texts[0].match(/^(\d{1,2})$/);
      if (!dayMatch) continue;
      
      const day = dayMatch[1].padStart(2, '0');
      const dateStr = `${day}/${periodMonth}/${periodYear}`;
      
      // Find amount columns by X position
      // Amounts are at the right side of the row
      const amountItems: { value: string; x: number; idx: number }[] = [];
      for (let i = 1; i < texts.length; i++) {
        if (amountPattern.test(texts[i])) {
          amountItems.push({ value: texts[i], x: row[i].x, idx: i });
        }
      }
      
      if (amountItems.length === 0) continue;
      
      // Description is everything between day and first amount
      const descParts: string[] = [];
      for (let i = 1; i < amountItems[0].idx; i++) {
        descParts.push(texts[i]);
      }
      const description = descParts.join(' ').trim();
      if (description.length < 2) continue;
      
      // Determine if cargo or abono based on column position
      // In Banregio format: CARGOS column is before ABONOS column
      // If there are 3 amounts, they're typically: cargo, abono, saldo (some may be empty)
      // If there are 2 amounts: either (cargo, saldo) or (abono, saldo)
      // We need X position to determine column
      
      // Simple heuristic: if description contains "Abono" or "Pago" keywords, it's an abono
      // Otherwise, use position-based logic
      const descLower = description.toLowerCase();
      
      let amount: string;
      let type: 'cargo' | 'abono';
      
      if (amountItems.length >= 3) {
        // cargo, abono, saldo - pick the non-saldo ones
        // The last amount is usually the saldo
        const cargoVal = cleanAmount(amountItems[0].value);
        const abonoVal = cleanAmount(amountItems[1].value);
        
        if (parseFloat(cargoVal) > 0 && amountItems[0].x < amountItems[1].x) {
          // First is cargo column
          amount = `-${cargoVal}`;
          type = 'cargo';
        } else {
          amount = abonoVal;
          type = 'abono';
        }
      } else if (amountItems.length === 2) {
        // One amount + saldo
        const val = cleanAmount(amountItems[0].value);
        
        // Use X position: cargo column is more to the left than abono
        // Also check keywords
        const isAbono = descLower.includes('abono') || 
                        descLower.includes('pago cap') || 
                        descLower.includes('pago intereses') ||
                        descLower.includes('spei recibido') ||
                        descLower.includes('abono por devolucion');
        
        // Check if the amount's X position suggests it's in the ABONOS column
        // Typically CARGOS column X < ABONOS column X
        // We'll rely on keywords + X position relative to the saldo column
        if (isAbono) {
          amount = val;
          type = 'abono';
        } else {
          amount = `-${val}`;
          type = 'cargo';
        }
      } else {
        // Single amount - determine by keywords
        const val = cleanAmount(amountItems[0].value);
        const isAbono = descLower.includes('abono') || descLower.includes('pago cap') || descLower.includes('pago intereses');
        amount = isAbono ? val : `-${val}`;
        type = isAbono ? 'abono' : 'cargo';
      }
      
      results.push({ date: dateStr, description, amount, type });
    }
  }

  return results;
}

/**
 * Fallback parser using simple regex (original approach)
 */
function parseFallback(fullText: string): ParsedRow[] {
  const lines = fullText.split('\n').filter(l => l.trim());
  const results: ParsedRow[] = [];

  const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
  const amountPattern = /(-?\$?[\d,]+\.\d{2})/g;

  for (const line of lines) {
    const dateMatch = line.match(datePattern);
    if (!dateMatch) continue;

    const amounts = line.match(amountPattern);
    if (!amounts || amounts.length === 0) continue;

    const amount = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
    const dateEnd = line.indexOf(dateMatch[1]) + dateMatch[1].length;
    const amountStart = line.indexOf(amount);
    const description = line.substring(dateEnd, amountStart).trim();

    if (description.length > 2) {
      const cleanAmt = amount.replace(/[$,]/g, '');
      results.push({
        date: dateMatch[1],
        description,
        amount: cleanAmt,
        type: parseFloat(cleanAmt) >= 0 ? 'abono' : 'cargo',
      });
    }
  }

  return results;
}

/**
 * Main entry: extract text from PDF file
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const { fullText } = await extractTextItems(file);
  return fullText;
}

/**
 * Main entry: parse PDF and return structured transactions
 */
export async function parsePdfFile(file: File): Promise<Array<{
  date: string;
  description: string;
  amount: string;
}>> {
  const { pages, fullText } = await extractTextItems(file);
  const format = detectFormat(fullText);
  
  console.log(`[PDF Parser] Detected format: ${format}`);
  
  let parsed: ParsedRow[] = [];
  
  switch (format) {
    case 'bbva_debit':
      parsed = parseBBVADebit(pages, fullText);
      break;
    case 'bbva_credit':
      parsed = parseBBVACredit(pages, fullText);
      break;
    case 'banregio':
      parsed = parseBanregio(pages, fullText);
      break;
    default:
      parsed = parseFallback(fullText);
      break;
  }

  // If specific parser found nothing, try fallback
  if (parsed.length === 0 && format !== 'unknown') {
    console.log('[PDF Parser] Specific parser found nothing, trying fallback');
    parsed = parseFallback(fullText);
  }

  return parsed.map(row => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
  }));
}

/**
 * Legacy function kept for backward compat
 */
export function parsePdfTransactionLines(text: string): Array<{
  date: string;
  description: string;
  amount: string;
}> {
  return parseFallback(text).map(row => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
  }));
}
