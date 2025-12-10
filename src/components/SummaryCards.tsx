import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react';
import { Transaction } from '@/types/transaction';
import { cn } from '@/lib/utils';

interface SummaryCardsProps {
  transactions: Transaction[];
}

export function SummaryCards({ transactions }: SummaryCardsProps) {
  const activeTransactions = transactions.filter(t => !t.isOwnTransfer);
  
  const ingresos = activeTransactions
    .filter(t => t.type === 'ingreso')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const egresos = activeTransactions
    .filter(t => t.type === 'egreso')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const balance = ingresos - egresos;
  
  const sinClasificar = transactions.filter(t => t.category === 'sin_clasificar').length;
  
  const ingresosCount = activeTransactions.filter(t => t.type === 'ingreso').length;
  const egresosCount = activeTransactions.filter(t => t.type === 'egreso').length;

  const cards = [
    {
      title: 'Ingresos Totales',
      value: ingresos,
      subtitle: `${ingresosCount} transacciones`,
      icon: TrendingUp,
      colorClass: 'text-primary',
      bgClass: 'bg-primary/20',
      glowClass: 'glow-income',
    },
    {
      title: 'Egresos Totales',
      value: egresos,
      subtitle: `${egresosCount} transacciones`,
      icon: TrendingDown,
      colorClass: 'text-destructive',
      bgClass: 'bg-destructive/20',
      glowClass: 'glow-expense',
    },
    {
      title: 'Balance',
      value: balance,
      subtitle: balance >= 0 ? 'Superávit' : 'Déficit',
      icon: Wallet,
      colorClass: balance >= 0 ? 'text-primary' : 'text-destructive',
      bgClass: balance >= 0 ? 'bg-primary/20' : 'bg-destructive/20',
      glowClass: balance >= 0 ? 'glow-income' : 'glow-expense',
    },
    {
      title: 'Sin Clasificar',
      value: sinClasificar,
      subtitle: 'transacciones pendientes',
      icon: AlertCircle,
      colorClass: 'text-warning',
      bgClass: 'bg-warning/20',
      isCount: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={cn(
            "relative p-5 rounded-xl bg-card border border-border",
            "transition-all duration-300 hover:border-primary/30",
            "animate-fade-in"
          )}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <p className={cn("text-2xl font-bold", card.colorClass)}>
                {card.isCount 
                  ? card.value 
                  : `$${card.value.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
                }
              </p>
              <p className="text-xs text-muted-foreground">{card.subtitle}</p>
            </div>
            <div className={cn("p-2.5 rounded-lg", card.bgClass)}>
              <card.icon className={cn("w-5 h-5", card.colorClass)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
