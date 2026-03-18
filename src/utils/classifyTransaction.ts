import { CATEGORIES, TransactionCategory, TransactionType, BANKS } from '@/types/transaction';

export function classifyTransaction(
  description: string,
  amount: number,
  existingBanks: string[]
): { category: TransactionCategory; isOwnTransfer: boolean } {
  const descLower = description.toLowerCase();
  const type: TransactionType = amount >= 0 ? 'ingreso' : 'egreso';
  
  // Check for own bank transfers
  const isTransfer = descLower.includes('spei') || 
                     descLower.includes('transferencia') || 
                     descLower.includes('traspaso');
  
  if (isTransfer) {
    // Check if transfer mentions any of user's banks
    const mentionedBank = [...BANKS, ...existingBanks].find(bank => 
      descLower.includes(bank.toLowerCase())
    );
    
    if (mentionedBank && existingBanks.some(b => b.toLowerCase() === mentionedBank.toLowerCase())) {
      return { category: 'transferencia_propia', isOwnTransfer: true };
    }
  }
  
  // Try to match category by keywords
  for (const [categoryKey, config] of Object.entries(CATEGORIES)) {
    if (categoryKey === 'sin_clasificar' || categoryKey === 'transferencia_propia') continue;
    
    const matchesType = config.type === 'both' || config.type === type;
    if (!matchesType) continue;
    
    const matchesKeyword = config.keywords.some(keyword => 
      descLower.includes(keyword.toLowerCase())
    );
    
    if (matchesKeyword) {
      return { category: categoryKey as TransactionCategory, isOwnTransfer: false };
    }
  }
  
  return { category: 'sin_clasificar', isOwnTransfer: false };
}

export function parseAmount(value: string): number {
  // Remove currency symbols and commas, handle negative formats
  let cleaned = value.replace(/[$,]/g, '').trim();
  
  // Handle parentheses for negative numbers
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }
  
  return parseFloat(cleaned) || 0;
}

export function parseDate(value: string): Date {
  // Try DD/MM/YYYY
  const ddmmyyyy = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
  }

  // Try YYYY-MM-DD
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  }

  // Try DD-MM-YYYY
  const ddmmyyyy2 = value.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (ddmmyyyy2) {
    return new Date(parseInt(ddmmyyyy2[3]), parseInt(ddmmyyyy2[2]) - 1, parseInt(ddmmyyyy2[1]));
  }

  // Try DD/MM/YY
  const ddmmyy = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (ddmmyy) {
    const yr = parseInt(ddmmyy[3]) + 2000;
    return new Date(yr, parseInt(ddmmyy[2]) - 1, parseInt(ddmmyy[1]));
  }

  // Fallback: return current date to avoid Invalid Date crashes
  const fallback = new Date(value);
  if (isNaN(fallback.getTime())) {
    console.warn(`[parseDate] Could not parse date: "${value}", using current date`);
    return new Date();
  }
  return fallback;
}
