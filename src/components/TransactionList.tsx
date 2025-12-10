import { useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, MoreHorizontal, ListFilter } from 'lucide-react';
import { Transaction, CATEGORIES, TransactionCategory } from '@/types/transaction';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TransactionListProps {
  transactions: Transaction[];
  onUpdateCategory: (id: string, category: TransactionCategory) => void;
}

export function TransactionList({ transactions, onUpdateCategory }: TransactionListProps) {
  const [filter, setFilter] = useState<string>('todas');
  
  const filteredTransactions = transactions.filter(t => {
    if (filter === 'todas') return !t.isOwnTransfer;
    if (filter === 'ingresos') return t.type === 'ingreso' && !t.isOwnTransfer;
    if (filter === 'egresos') return t.type === 'egreso' && !t.isOwnTransfer;
    if (filter === 'sin_clasificar') return t.category === 'sin_clasificar';
    if (filter === 'transferencias') return t.isOwnTransfer;
    return t.category === filter;
  });

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('es-MX', { 
      day: 'numeric', 
      month: 'short' 
    }).format(date);
  };

  const formatAmount = (amount: number, type: string) => {
    const prefix = type === 'ingreso' ? '+' : '-';
    return `${prefix}$${Math.abs(amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-6 rounded-xl bg-card border border-border animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListFilter className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Transacciones</h2>
        </div>
        
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="ingresos">Ingresos</SelectItem>
            <SelectItem value="egresos">Egresos</SelectItem>
            <SelectItem value="sin_clasificar">Sin Clasificar</SelectItem>
            <SelectItem value="transferencias">Transferencias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay transacciones para mostrar</p>
            <p className="text-sm">Carga un estado de cuenta para comenzar</p>
          </div>
        ) : (
          filteredTransactions.map((transaction, index) => (
            <div
              key={transaction.id}
              className={cn(
                "flex items-center gap-4 p-4 rounded-lg",
                "bg-secondary/30 border border-border",
                "transition-all duration-200 hover:bg-secondary/50",
                "animate-slide-in",
                transaction.isOwnTransfer && "opacity-60"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={cn(
                "p-2 rounded-full",
                transaction.type === 'ingreso' ? "bg-primary/20" : "bg-destructive/20"
              )}>
                {transaction.type === 'ingreso' ? (
                  <ArrowUpCircle className="w-5 h-5 text-primary" />
                ) : (
                  <ArrowDownCircle className="w-5 h-5 text-destructive" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{transaction.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(transaction.date)} • {transaction.bank}
                </p>
              </div>

              <Select
                value={transaction.category}
                onValueChange={(value) => onUpdateCategory(transaction.id, value as TransactionCategory)}
                disabled={transaction.isOwnTransfer}
              >
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([key, config]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className={cn(
                "text-sm font-semibold min-w-[100px] text-right",
                transaction.type === 'ingreso' ? "text-primary" : "text-destructive"
              )}>
                {formatAmount(transaction.amount, transaction.type)}
              </span>

              <button className="p-1 rounded hover:bg-secondary transition-colors">
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
