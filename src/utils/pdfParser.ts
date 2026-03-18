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

interface PageColumnContext {
  cargosX: number | null;
  abonosX: number | null;
}

const MONTH_MAP: Record<string, string> = {
  ene: '01',
  feb: '02',
  mar: '03',
  abr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dic: '12',
};

const BBVA_DEBIT_DATE_PATTERN = /^\d{1,2}\/[A-Za-zÁÉÍÓÚáéíóú]{3}$/;
const BBVA_CREDIT_DATE_PATTERN = /(\d{1,2})-([a-záéíóú]{3})-(\d{4})/i;
const SIMPLE_AMOUNT_PATTERN = /^\$?[\d,]+\.\d{2}$/;

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

    for (const item of textContent.items as Array<{ str?: string; transform: number[]; width: number }>) {
      if (item.str && item.str.trim()) {
        const x = item.transform[4];
        const y = viewport.height - item.transform[5];
        pageItems.push({ str: item.str.trim(), x, y, width: item.width });
        fullText += `${item.str} `;
      }
    }

    fullText += '\n';
    allItems.push(...pageItems);
    pages.push(pageItems);
  }

  return { items: allItems, fullText, pages };
}

function groupIntoRows(items: TextItem[], tolerance = 7): TextItem[][] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const grouped: Array<{ y: number; items: TextItem[] }> = [];

  for (const item of sorted) {
    const lastGroup = grouped[grouped.length - 1];

    if (lastGroup && Math.abs(item.y - lastGroup.y) <= tolerance) {
      lastGroup.items.push(item);
      lastGroup.y = (lastGroup.y * (lastGroup.items.length - 1) + item.y) / lastGroup.items.length;
    } else {
      grouped.push({ y: item.y, items: [item] });
    }
  }

  const merged: Array<{ y: number; items: TextItem[] }> = [];
  for (const group of grouped) {
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(group.y - previous.y) <= tolerance) {
      previous.items.push(...group.items);
      previous.y = (previous.y + group.y) / 2;
    } else {
      merged.push({ ...group, items: [...group.items] });
    }
  }

  return merged.map(group => group.items.sort((a, b) => a.x - b.x));
}

type BankFormat = 'bbva_debit' | 'bbva_credit' | 'banregio' | 'unknown';

function detectFormat(fullText: string): BankFormat {
  const t = normalizeText(fullText);

  if (t.includes('bbva')) {
    const creditMarkers = [
      'tarjeta de credito',
      'fecha limite de pago',
      'pago minimo',
      'pago para no generar intereses',
      'linea de credito',
      'numero de tarjeta',
      'pago total para no generar intereses',
    ];

    const debitMarkers = [
      'libreton',
      'cuenta digital',
      'detalle de movimientos realizados',
      'movimientos',
      'saldo promedio',
      'depositos / abonos',
    ];

    if (creditMarkers.some(marker => t.includes(marker))) return 'bbva_credit';
    if (debitMarkers.some(marker => t.includes(marker))) return 'bbva_debit';
    return 'bbva_debit';
  }

  if (t.includes('hey banco') || t.includes('cuenta hey smart')) {
    return 'banregio';
  }

  if (t.includes('banregio')) {
    return 'banregio';
  }

  return 'unknown';
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanAmount(val: string): string {
  return val.replace(/[$,\s+]/g, '').trim();
}

function parseAmountNumber(val: string): number | null {
  const cleaned = cleanAmount(val);
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAmountToken(value: string): boolean {
  return SIMPLE_AMOUNT_PATTERN.test(value);
}

function parseBbvaDebitDate(value: string, year: string): string | null {
  const match = value.match(/^(\d{1,2})\/([A-Za-zÁÉÍÓÚáéíóú]{3})$/);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = MONTH_MAP[normalizeText(match[2]).slice(0, 3)];
  if (!month) return null;

  return `${day}/${month}/${year}`;
}

function isLikelyContinuation(texts: string[]): boolean {
  if (texts.length === 0) return false;

  const rowText = normalizeText(texts.join(' '));
  if (!rowText || rowText.length < 4) return false;

  const blockedStarts = [
    'bbva',
    'pagina',
    'total de movimientos',
    'cuadro resumen',
    'glosario',
    'fecha',
    'tipo',
    'descripcion',
    'importe',
    'saldo',
    'no. de cuenta',
    'no. de cliente',
    'otros cargos',
    'av. paseo',
  ];

  return !blockedStarts.some(prefix => rowText.startsWith(prefix));
}

function getPageColumnContext(rows: TextItem[][]): PageColumnContext {
  let cargosX: number | null = null;
  let abonosX: number | null = null;

  for (const row of rows) {
    for (const item of row) {
      const value = normalizeText(item.str);
      if (value === 'cargos') cargosX = item.x;
      if (value === 'abonos') abonosX = item.x;
    }

    if (cargosX !== null && abonosX !== null) break;
  }

  return { cargosX, abonosX };
}

function inferBbvaDebitType(params: {
  description: string;
  amount: number;
  amountX: number;
  balance: number | null;
  previousBalance: number | null;
  context: PageColumnContext;
}): 'cargo' | 'abono' {
  const { description, amount, amountX, balance, previousBalance, context } = params;

  if (context.cargosX !== null && context.abonosX !== null) {
    const distToCargos = Math.abs(amountX - context.cargosX);
    const distToAbonos = Math.abs(amountX - context.abonosX);
    return distToCargos <= distToAbonos ? 'cargo' : 'abono';
  }

  if (balance !== null) {
    if (previousBalance !== null) {
      if (Math.abs(previousBalance + amount - balance) < 0.02) return 'abono';
      if (Math.abs(previousBalance - amount - balance) < 0.02) return 'cargo';
    } else if (Math.abs(balance - amount) < 0.02) {
      return 'abono';
    }
  }

  const normalized = normalizeText(description);

  if (/(spei recibido|deposito|abono|interes|devuelto|devolucion|transferencia recibida)/.test(normalized)) {
    return 'abono';
  }

  if (/(spei enviado|retiro|compra|pago tarjeta|stm financial|comision|cargo|transferencia enviada)/.test(normalized)) {
    return 'cargo';
  }

  return 'cargo';
}

function parseBBVADebit(pages: TextItem[][], fullText: string): ParsedRow[] {
  const results: ParsedRow[] = [];
  const yearMatch = fullText.match(/(?:AL|al)\s+\d{1,2}\/\d{1,2}\/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);
    const context = getPageColumnContext(rows);
    let previousBalance: number | null = null;
    let lastParsedIndex: number | null = null;

    for (const row of rows) {
      const texts = row.map(item => item.str.trim()).filter(Boolean);
      if (texts.length === 0) continue;

      const dateIndex = texts.findIndex(text => BBVA_DEBIT_DATE_PATTERN.test(text));
      const amountEntries = texts
        .map((text, idx) => ({ text, idx, x: row[idx].x, value: parseAmountNumber(text) }))
        .filter(entry => isAmountToken(entry.text) && entry.value !== null) as Array<{
          text: string;
          idx: number;
          x: number;
          value: number;
        }>;

      if (dateIndex === -1) {
        if (lastParsedIndex !== null && amountEntries.length === 0 && isLikelyContinuation(texts)) {
          results[lastParsedIndex].description = `${results[lastParsedIndex].description} ${texts.join(' ')}`.trim();
        }
        continue;
      }

      const parsedDate = parseBbvaDebitDate(texts[dateIndex], year);
      if (!parsedDate || amountEntries.length === 0) continue;

      const firstAmount = amountEntries[0];
      const balance = amountEntries.length > 1 ? amountEntries[amountEntries.length - 1].value : null;
      const descriptionParts = texts
        .slice(dateIndex + 1, firstAmount.idx)
        .filter(text => !BBVA_DEBIT_DATE_PATTERN.test(text))
        .filter(text => !/^\d{10,}$/.test(text));

      const description = descriptionParts.join(' ').trim();
      if (description.length < 2) continue;

      const movementType = inferBbvaDebitType({
        description,
        amount: firstAmount.value,
        amountX: firstAmount.x,
        balance,
        previousBalance,
        context,
      });

      const amount = cleanAmount(firstAmount.text);
      results.push({
        date: parsedDate,
        description,
        amount: movementType === 'cargo' ? `-${amount}` : amount,
        type: movementType,
      });

      lastParsedIndex = results.length - 1;
      if (balance !== null) previousBalance = balance;
    }
  }

  return results;
}

function parseBBVACredit(pages: TextItem[][]): ParsedRow[] {
  const results: ParsedRow[] = [];
  const amountPattern = /([+-])\s*\$\s*([\d,]+\.\d{2})/;

  for (const pageItems of pages) {
    const rows = groupIntoRows(pageItems);

    for (const row of rows) {
      const rowText = row.map(item => item.str).join(' ');
      const dateMatch = rowText.match(BBVA_CREDIT_DATE_PATTERN);
      if (!dateMatch) continue;

      const month = MONTH_MAP[normalizeText(dateMatch[2]).slice(0, 3)];
      if (!month) continue;

      const date = `${dateMatch[1].padStart(2, '0')}/${month}/${dateMatch[3]}`;
      const amountMatch = rowText.match(amountPattern);
      if (!amountMatch) continue;

      const texts = row.map(item => item.str);
      const descriptionParts: string[] = [];
      let seenDates = 0;

      for (const text of texts) {
        if (BBVA_CREDIT_DATE_PATTERN.test(text)) {
          seenDates += 1;
          continue;
        }

        if (
          seenDates >= 2 &&
          !amountPattern.test(text) &&
          !/^[+-]$/.test(text) &&
          text !== '$' &&
          !SIMPLE_AMOUNT_PATTERN.test(text)
        ) {
          descriptionParts.push(text);
        }
      }

      const description = descriptionParts.join(' ').trim();
      if (description.length < 2) continue;

      const isCargo = amountMatch[1] === '+';
      results.push({
        date,
        description,
        amount: isCargo ? `-${cleanAmount(amountMatch[2])}` : cleanAmount(amountMatch[2]),
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
      enero: '01',
      febrero: '02',
      marzo: '03',
      abril: '04',
      mayo: '05',
      junio: '06',
      julio: '07',
      agosto: '08',
      septiembre: '09',
      octubre: '10',
      noviembre: '11',
      diciembre: '12',
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

      const amountEntries = texts
        .map((text, idx) => ({ text, idx, x: row[idx].x, value: parseAmountNumber(text) }))
        .filter(entry => isAmountToken(entry.text) && entry.value !== null) as Array<{
          text: string;
          idx: number;
          x: number;
          value: number;
        }>;

      if (amountEntries.length === 0) continue;

      const description = texts.slice(1, amountEntries[0].idx).join(' ').trim();
      if (description.length < 2) continue;

      const amountValue = cleanAmount(amountEntries[0].text);
      const normalized = normalizeText(description);
      const isAbono = /(abono|spei recibido|pago cap|pago intereses|devolucion)/.test(normalized);

      results.push({
        date: `${dayMatch[1].padStart(2, '0')}/${periodMonth}/${periodYear}`,
        description,
        amount: isAbono ? amountValue : `-${amountValue}`,
        type: isAbono ? 'abono' : 'cargo',
      });
    }
  }

  return results;
}

function parseFallback(fullText: string): ParsedRow[] {
  const lines = fullText.split('\n').filter(line => line.trim());
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
    if (description.length <= 2) continue;

    const cleanAmt = amount.replace(/[$,]/g, '');
    results.push({
      date: dateMatch[1],
      description,
      amount: cleanAmt,
      type: parseFloat(cleanAmt) >= 0 ? 'abono' : 'cargo',
    });
  }

  return results;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const { fullText } = await extractTextItems(file);
  return fullText;
}

export async function parsePdfFile(file: File): Promise<Array<{ date: string; description: string; amount: string }>> {
  const { pages, fullText } = await extractTextItems(file);
  const format = detectFormat(fullText);

  let parsed: ParsedRow[] = [];

  switch (format) {
    case 'bbva_debit':
      parsed = parseBBVADebit(pages, fullText);
      break;
    case 'bbva_credit':
      parsed = parseBBVACredit(pages);
      break;
    case 'banregio':
      parsed = parseBanregio(pages, fullText);
      break;
    default:
      parsed = parseFallback(fullText);
      break;
  }

  if (parsed.length === 0 && format !== 'unknown') {
    parsed = parseFallback(fullText);
  }

  return parsed.map(row => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
  }));
}

export function parsePdfTransactionLines(text: string): Array<{ date: string; description: string; amount: string }> {
  return parseFallback(text).map(row => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
  }));
}
