import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

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

type BankFormat = 'bbva_debit' | 'bbva_credit' | 'banregio' | 'unknown';
type BBVADebitMode = 'detailed' | 'simple';

const MONTH_MAP: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04',
  may: '05', jun: '06', jul: '07', ago: '08',
  sep: '09', oct: '10', nov: '11', dic: '12',
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isAmountToken(value: string): boolean {
  const cleaned = value.replace(/[\s$,+-]/g, '');
  return /^\d[\d,]*\.\d{2}$/.test(cleaned);
}

function isBBVADateToken(value: string): boolean {
  return /^(\d{1,2})\/([A-Za-zÁÉÍÓÚáéíóú]{3})$/.test(value.trim());
}

function parseBBVADateToken(value: string, year: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/([A-Za-zÁÉÍÓÚáéíóú]{3})$/);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = MONTH_MAP[normalizeText(match[2])];
  if (!month) return null;

  return `${day}/${month}/${year}`;
}

function cleanAmount(val: string): string {
  return val.replace(/[$,\s+]/g, '').trim();
}

function inferDebitType(description: string): 'cargo' | 'abono' {
  const text = normalizeText(description);

  const abonoKeywords = [
    'recibido',
    'deposito',
    'abono',
    'devuelto',
    'devolucion',
    'intereses',
    'bonificacion',
    'rendimiento',
  ];

  if (abonoKeywords.some((keyword) => text.includes(keyword))) {
    return 'abono';
  }

  return 'cargo';
}

function isStatementBoundary(rowText: string): boolean {
  const text = normalizeText(rowText);
  return [
    'total de movimientos',
    'cuadro resumen',
    'glosario de abreviaturas',
    'bbva mexico',
    'informacion financiera',
    'comisiones',
  ].some((marker) => text.includes(marker));
}

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
        const y = viewport.height - item.transform[5];
        pageItems.push({ str: item.str.trim(), x, y, width: item.width });
      }
    }

    const rows = groupIntoRows(pageItems);
    fullText += rows.map((row) => row.map((item) => item.str).join(' ')).join('\n');
    fullText += '\n';

    allItems.push(...pageItems);
    pages.push(pageItems);
  }

  return { items: allItems, fullText, pages };
}

function groupIntoRows(items: TextItem[], tolerance = 4): TextItem[][] {
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

function detectFormat(fullText: string): BankFormat {
  const text = normalizeText(fullText);
  const isBBVA = text.includes('bbva');
  const isBBVADebit =
    text.includes('libreton') ||
    text.includes('detalle de movimientos realizados') ||
    text.includes('cuenta digital');
  const isBBVACredit =
    text.includes('tu pago requerido este periodo') ||
    text.includes('fecha limite de pago') ||
    text.includes('resumen de cargos y abonos del periodo') ||
    text.includes('tarjeta oro bbva') ||
    text.includes('tarjeta de credito');

  if (isBBVA && isBBVADebit) return 'bbva_debit';
  if (isBBVA && isBBVACredit) return 'bbva_credit';

  if (text.includes('hey banco') || text.includes('cuenta hey smart')) {
    return 'banregio';
  }

  if (text.includes('banregio') && !isBBVA) {
    return 'banregio';
  }

  return 'unknown';
}

function parseDetailedBBVADebitRow(
  row: TextItem[],
  year: string,
  columnPositions: { cargosX: number; abonosX: number } | null
): ParsedRow | null {
  const dateIndexes = row
    .map((item, index) => (isBBVADateToken(item.str) ? index : -1))
    .filter((index) => index >= 0);

  if (dateIndexes.length === 0) return null;

  const date = parseBBVADateToken(row[dateIndexes[0]].str, year);
  if (!date) return null;

  const lastDateIndex = dateIndexes[dateIndexes.length - 1];
  const amountCandidates = row
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => index > lastDateIndex && isAmountToken(item.str));

  if (amountCandidates.length === 0) return null;

  const chosenAmount = columnPositions
    ? amountCandidates
        .map(({ item, index }) => ({
          value: item.str,
          x: item.x,
          index,
          distance: Math.min(
            Math.abs(item.x - columnPositions.cargosX),
            Math.abs(item.x - columnPositions.abonosX)
          ),
          type:
            Math.abs(item.x - columnPositions.cargosX) <= Math.abs(item.x - columnPositions.abonosX)
              ? ('cargo' as const)
              : ('abono' as const),
        }))
        .sort((a, b) => a.distance - b.distance)[0]
    : {
        value: amountCandidates[0].item.str,
        x: amountCandidates[0].item.x,
        index: amountCandidates[0].index,
        distance: 0,
        type: inferDebitType(row.map((item) => item.str).join(' ')),
      };

  const description = row
    .slice(lastDateIndex + 1, chosenAmount.index)
    .map((item) => item.str)
    .filter((text) => {
      const normalized = normalizeText(text);
      if (!text.trim()) return false;
      if (normalized.startsWith('referencia')) return false;
      if (/^\*+$/.test(text)) return false;
      if (/^\d{6,}$/.test(text.replace(/\s/g, ''))) return false;
      if (isAmountToken(text)) return false;
      return true;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description) return null;

  const amount = cleanAmount(chosenAmount.value);
  if (!amount) return null;

  return {
    date,
    description,
    amount: chosenAmount.type === 'cargo' ? `-${amount}` : amount,
    type: chosenAmount.type,
  };
}

function parseSimpleBBVADebitRow(row: TextItem[], year: string): ParsedRow | null {
  const dateIndex = row.findIndex((item) => isBBVADateToken(item.str));
  if (dateIndex < 0) return null;

  const date = parseBBVADateToken(row[dateIndex].str, year);
  if (!date) return null;

  const amountCandidates = row
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => index > dateIndex && isAmountToken(item.str));

  if (amountCandidates.length === 0) return null;

  const chosenAmount = amountCandidates[0];
  const description = row
    .slice(dateIndex + 1, chosenAmount.index)
    .map((item) => item.str)
    .filter((text) => {
      const normalized = normalizeText(text);
      if (!text.trim()) return false;
      if (normalized.startsWith('referencia')) return false;
      if (/^\*+$/.test(text)) return false;
      if (/^\d{6,}$/.test(text.replace(/\s/g, ''))) return false;
      if (isAmountToken(text)) return false;
      return true;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description) return null;

  const type = inferDebitType(description);
  const amount = cleanAmount(chosenAmount.item.str);
  if (!amount) return null;

  return {
    date,
    description,
    amount: type === 'cargo' ? `-${amount}` : amount,
    type,
  };
}

function parseBBVADebit(pages: TextItem[][], fullText: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  const seen = new Set<string>();
  const yearMatch = fullText.match(/(?:DEL|Del|del)\s+\d{1,2}\/\d{1,2}\/\d{4}\s+(?:AL|al)\s+\d{1,2}\/\d{1,2}\/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);
    let mode: BBVADebitMode | null = null;
    let columnPositions: { cargosX: number; abonosX: number } | null = null;

    for (const row of rows) {
      const rowText = row.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
      const normalized = normalizeText(rowText);

      if (!rowText) continue;

      if (
        normalized.includes('fecha') &&
        normalized.includes('descripcion') &&
        normalized.includes('cargos') &&
        normalized.includes('abonos')
      ) {
        mode = 'detailed';
        const cargosItem = row.find((item) => normalizeText(item.str) === 'cargos');
        const abonosItem = row.find((item) => normalizeText(item.str) === 'abonos');
        columnPositions = cargosItem && abonosItem ? { cargosX: cargosItem.x, abonosX: abonosItem.x } : null;
        continue;
      }

      if (normalized.includes('fecha') && normalized.includes('descripcion') && normalized.includes('monto')) {
        mode = 'simple';
        columnPositions = null;
        continue;
      }

      if (isStatementBoundary(rowText)) {
        mode = null;
        columnPositions = null;
        continue;
      }

      if (!mode) continue;

      const parsed =
        mode === 'detailed'
          ? parseDetailedBBVADebitRow(row, year, columnPositions)
          : parseSimpleBBVADebitRow(row, year);

      if (!parsed) continue;

      const key = `${parsed.date}|${parsed.description}|${parsed.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(parsed);
    }
  }

  return results;
}

function parseBBVACredit(pages: TextItem[][], fullText: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  const datePattern = /(\d{1,2})-([a-záéíóú]{3})-(\d{4})/i;
  const amountPattern = /([+-])\s*\$\s*([\d,]+\.\d{2})/;

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      const rowText = row.map(item => item.str).join(' ');
      const dateMatch = rowText.match(datePattern);
      if (!dateMatch) continue;

      const day = dateMatch[1].padStart(2, '0');
      const month = MONTH_MAP[normalizeText(dateMatch[2])];
      if (!month) continue;
      const dateStr = `${day}/${month}/${dateMatch[3]}`;

      const amountMatch = rowText.match(amountPattern);
      if (!amountMatch) continue;

      const sign = amountMatch[1];
      const amountVal = amountMatch[2].replace(/,/g, '');
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
        if (
          reachedDesc &&
          !amountPattern.test(text) &&
          !text.match(/^[+-]$/) &&
          !text.match(/^\$/) &&
          !text.match(/^[\d,]+\.\d{2}$/)
        ) {
          descParts.push(text);
        }
      }

      const description = descParts.join(' ').trim();
      if (description.length < 2) continue;

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

function parseBanregio(pages: TextItem[][], fullText: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  const periodMatch = fullText.match(/del\s+\d+\s+al\s+\d+\s+de\s+([A-ZÁÉÍÓÚa-záéíóú]+)\s+(\d{4})/i);
  let periodMonth = '01';
  let periodYear = new Date().getFullYear().toString();

  if (periodMatch) {
    const monthName = normalizeText(periodMatch[1]);
    const monthNames: Record<string, string> = {
      enero: '01', febrero: '02', marzo: '03', abril: '04',
      mayo: '05', junio: '06', julio: '07', agosto: '08',
      septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
    };
    periodMonth = monthNames[monthName] || '01';
    periodYear = periodMatch[2];
  }

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      const texts = row.map(item => item.str);
      if (texts.length < 3) continue;

      const dayMatch = texts[0].match(/^(\d{1,2})$/);
      if (!dayMatch) continue;

      const day = dayMatch[1].padStart(2, '0');
      const dateStr = `${day}/${periodMonth}/${periodYear}`;

      const amountItems = row
        .map((item, index) => ({ value: item.str, x: item.x, idx: index }))
        .filter(({ value, idx }) => idx > 0 && isAmountToken(value));

      if (amountItems.length === 0) continue;

      const description = texts
        .slice(1, amountItems[0].idx)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (description.length < 2) continue;

      const descLower = normalizeText(description);
      let amount: string;
      let type: 'cargo' | 'abono';

      if (amountItems.length >= 3) {
        const cargoVal = cleanAmount(amountItems[0].value);
        const abonoVal = cleanAmount(amountItems[1].value);
        if (parseFloat(cargoVal) > 0 && amountItems[0].x < amountItems[1].x) {
          amount = `-${cargoVal}`;
          type = 'cargo';
        } else {
          amount = abonoVal;
          type = 'abono';
        }
      } else if (amountItems.length === 2) {
        const val = cleanAmount(amountItems[0].value);
        const isAbono =
          descLower.includes('abono') ||
          descLower.includes('pago cap') ||
          descLower.includes('pago intereses') ||
          descLower.includes('spei recibido') ||
          descLower.includes('devolucion');

        if (isAbono) {
          amount = val;
          type = 'abono';
        } else {
          amount = `-${val}`;
          type = 'cargo';
        }
      } else {
        const val = cleanAmount(amountItems[0].value);
        const isAbono =
          descLower.includes('abono') ||
          descLower.includes('pago cap') ||
          descLower.includes('pago intereses');
        amount = isAbono ? val : `-${val}`;
        type = isAbono ? 'abono' : 'cargo';
      }

      results.push({ date: dateStr, description, amount, type });
    }
  }

  return results;
}

function parseFallback(fullText: string): ParsedRow[] {
  const lines = fullText.split('\n').map((line) => line.trim()).filter(Boolean);
  const results: ParsedRow[] = [];

  for (const line of lines) {
    const shortDateMatch = line.match(/^(\d{1,2}\/([A-Za-zÁÉÍÓÚáéíóú]{3}))\s+/);
    const numericDateMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    const amountMatches = [...line.matchAll(/\$?\s*([\d,]+\.\d{2})/g)];

    if (amountMatches.length === 0) continue;

    if (shortDateMatch) {
      const year = new Date().getFullYear().toString();
      const parsedDate = parseBBVADateToken(shortDateMatch[1], year);
      if (!parsedDate) continue;
      const amount = cleanAmount(amountMatches[0][1]);
      const description = line
        .replace(shortDateMatch[0], '')
        .replace(amountMatches[0][0], '')
        .replace(/Referencia.*$/i, '')
        .trim();

      if (!description) continue;
      const type = inferDebitType(description);
      results.push({
        date: parsedDate,
        description,
        amount: type === 'cargo' ? `-${amount}` : amount,
        type,
      });
      continue;
    }

    if (numericDateMatch) {
      const amount = cleanAmount(amountMatches[0][1]);
      const date = numericDateMatch[1];
      const dateEnd = line.indexOf(date) + date.length;
      const amountStart = line.indexOf(amountMatches[0][0]);
      const description = line.substring(dateEnd, amountStart).trim();
      if (!description) continue;
      results.push({
        date,
        description,
        amount,
        type: inferDebitType(description),
      });
    }
  }

  return results;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const { fullText } = await extractTextItems(file);
  return fullText;
}

export async function parsePdfFile(file: File): Promise<Array<{
  date: string;
  description: string;
  amount: string;
}>> {
  const { pages, fullText } = await extractTextItems(file);
  const format = detectFormat(fullText);

  console.log(`[PDF Parser] Detected format: ${format}`);
  console.log(`[PDF Parser] Total pages: ${pages.length}`);

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

  if (parsed.length === 0 && format !== 'unknown') {
    console.log('[PDF Parser] Specific parser found nothing, trying fallback');
    parsed = parseFallback(fullText);
  }

  console.log(`[PDF Parser] Parsed rows: ${parsed.length}`);

  return parsed.map((row) => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
  }));
}

export function parsePdfTransactionLines(text: string): Array<{
  date: string;
  description: string;
  amount: string;
}> {
  return parseFallback(text).map((row) => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
  }));
}
