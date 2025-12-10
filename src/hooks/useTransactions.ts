import { useState, useCallback } from 'react';
import { Transaction, TransactionCategory, TransactionType } from '@/types/transaction';
import { classifyTransaction, parseAmount, parseDate } from '@/utils/classifyTransaction';
import { useToast } from '@/hooks/use-toast';

// Sample data for demo
const SAMPLE_TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    date: new Date(2024, 0, 4),
    description: 'Pago cliente ABC Corp',
    amount: 15000,
    type: 'ingreso',
    category: 'ventas',
    bank: 'BBVA',
    isOwnTransfer: false,
  },
  {
    id: '2',
    date: new Date(2024, 0, 7),
    description: 'Nómina empleados',
    amount: -8500,
    type: 'egreso',
    category: 'nomina',
    bank: 'BBVA',
    isOwnTransfer: false,
  },
  {
    id: '3',
    date: new Date(2024, 0, 9),
    description: 'Servicio de consultoría',
    amount: 5000,
    type: 'ingreso',
    category: 'servicios',
    bank: 'Santander',
    isOwnTransfer: false,
  },
  {
    id: '4',
    date: new Date(2024, 0, 11),
    description: 'Pago electricidad CFE',
    amount: -1200,
    type: 'egreso',
    category: 'servicios',
    bank: 'BBVA',
    isOwnTransfer: false,
  },
  {
    id: '5',
    date: new Date(2024, 0, 14),
    description: 'Renta oficina',
    amount: -4500,
    type: 'egreso',
    category: 'renta',
    bank: 'Santander',
    isOwnTransfer: false,
  },
  {
    id: '6',
    date: new Date(2024, 0, 16),
    description: 'Venta productos enero',
    amount: 22000,
    type: 'ingreso',
    category: 'ventas',
    bank: 'BBVA',
    isOwnTransfer: false,
  },
  {
    id: '7',
    date: new Date(2024, 0, 18),
    description: 'Compra Amazon - Suministros',
    amount: -3500,
    type: 'egreso',
    category: 'compras_online',
    bank: 'Santander',
    isOwnTransfer: false,
  },
  {
    id: '8',
    date: new Date(2024, 0, 20),
    description: 'Gasolina Pemex',
    amount: -1800,
    type: 'egreso',
    category: 'gasolina',
    bank: 'BBVA',
    isOwnTransfer: false,
  },
  {
    id: '9',
    date: new Date(2024, 0, 22),
    description: 'Intereses cuenta ahorro',
    amount: 350,
    type: 'ingreso',
    category: 'intereses',
    bank: 'BBVA',
    isOwnTransfer: false,
  },
  {
    id: '10',
    date: new Date(2024, 0, 25),
    description: 'Facebook Ads - Marketing',
    amount: -2500,
    type: 'egreso',
    category: 'marketing',
    bank: 'Santander',
    isOwnTransfer: false,
  },
];

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>(SAMPLE_TRANSACTIONS);
  const [userBanks, setUserBanks] = useState<string[]>(['BBVA', 'Santander']);
  const { toast } = useToast();

  const processCSV = useCallback((content: string): Transaction[] => {
    const lines = content.split('\n').filter(line => line.trim());
    const newTransactions: Transaction[] = [];
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      
      if (values.length >= 3) {
        const [dateStr, description, amountStr, bank = 'Desconocido'] = values;
        const amount = parseAmount(amountStr);
        const type: TransactionType = amount >= 0 ? 'ingreso' : 'egreso';
        
        const { category, isOwnTransfer } = classifyTransaction(description, amount, userBanks);
        
        newTransactions.push({
          id: `${Date.now()}-${i}`,
          date: parseDate(dateStr),
          description,
          amount,
          type,
          category,
          bank: bank || 'Desconocido',
          isOwnTransfer,
        });
      }
    }
    
    return newTransactions;
  }, [userBanks]);

  const processFile = useCallback(async (file: File) => {
    try {
      if (file.name.endsWith('.csv')) {
        const content = await file.text();
        const newTransactions = processCSV(content);
        
        if (newTransactions.length > 0) {
          setTransactions(prev => [...prev, ...newTransactions]);
          
          // Add any new banks
          const banks = [...new Set(newTransactions.map(t => t.bank))];
          setUserBanks(prev => [...new Set([...prev, ...banks])]);
          
          toast({
            title: 'Archivo procesado',
            description: `Se importaron ${newTransactions.length} transacciones`,
          });
        }
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // For Excel files, we would need a library like xlsx
        // For now, show a message
        toast({
          title: 'Formato Excel detectado',
          description: 'Por favor exporta tu archivo a CSV para procesarlo',
        });
      } else if (file.name.endsWith('.pdf')) {
        // PDF parsing would require a backend service
        toast({
          title: 'Formato PDF detectado',
          description: 'El procesamiento de PDF requiere configuración adicional',
        });
      }
    } catch (error) {
      toast({
        title: 'Error al procesar',
        description: 'No se pudo leer el archivo. Verifica el formato.',
        variant: 'destructive',
      });
    }
  }, [processCSV, toast]);

  const updateCategory = useCallback((id: string, category: TransactionCategory) => {
    setTransactions(prev => 
      prev.map(t => 
        t.id === id 
          ? { ...t, category, isOwnTransfer: category === 'transferencia_propia' }
          : t
      )
    );
  }, []);

  return {
    transactions,
    processFile,
    updateCategory,
    userBanks,
  };
}
