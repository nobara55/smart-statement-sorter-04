import * as pdfjsLib from 'pdfjs-dist';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

export function parsePdfTransactionLines(text: string): Array<{
  date: string;
  description: string;
  amount: string;
}> {
  const lines = text.split('\n').filter(l => l.trim());
  const transactions: Array<{ date: string; description: string; amount: string }> = [];

  // Common date patterns in bank statements
  const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
  // Amount pattern: optional negative, digits with commas, decimal
  const amountPattern = /(-?\$?[\d,]+\.\d{2})/g;

  for (const line of lines) {
    const dateMatch = line.match(datePattern);
    if (!dateMatch) continue;

    const amounts = line.match(amountPattern);
    if (!amounts || amounts.length === 0) continue;

    // Last amount is usually the balance, second-to-last or first is the transaction amount
    const amount = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];

    // Extract description: text between date and first amount
    const dateEnd = line.indexOf(dateMatch[1]) + dateMatch[1].length;
    const amountStart = line.indexOf(amount);
    const description = line.substring(dateEnd, amountStart).trim();

    if (description.length > 2) {
      transactions.push({
        date: dateMatch[1],
        description,
        amount: amount.replace(/[$,]/g, ''),
      });
    }
  }

  return transactions;
}
