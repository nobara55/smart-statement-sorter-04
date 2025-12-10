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
  // Try common date formats
  const formats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // DD/MM/YYYY or MM/DD/YYYY
    /(\d{4})-(\d{2})-(\d{2})/,         // YYYY-MM-DD
    /(\d{1,2})-(\d{1,2})-(\d{4})/,     // DD-MM-YYYY
  ];
  
  for (const format of formats) {
    const match = value.match(format);
    if (match) {
      // Assume DD/MM/YYYY format (common in Spanish)
      if (format === formats[0]) {
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      }
      return new Date(value);
    }
  }
  
  return new Date(value);
}
