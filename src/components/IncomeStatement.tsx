import { FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { Transaction, CATEGORIES, TransactionCategory } from '@/types/transaction';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from 'recharts';

interface IncomeStatementProps {
  transactions: Transaction[];
}

export function IncomeStatement({ transactions }: IncomeStatementProps) {
  const activeTransactions = transactions.filter(t => !t.isOwnTransfer);
  
  // Group by category
  const categoryTotals = activeTransactions.reduce((acc, t) => {
    if (!acc[t.category]) {
      acc[t.category] = { ingreso: 0, egreso: 0 };
    }
    if (t.type === 'ingreso') {
      acc[t.category].ingreso += Math.abs(t.amount);
    } else {
      acc[t.category].egreso += Math.abs(t.amount);
    }
    return acc;
  }, {} as Record<string, { ingreso: number; egreso: number }>);

  // Prepare chart data
  const chartData = Object.entries(categoryTotals)
    .filter(([key]) => key !== 'sin_clasificar' && key !== 'transferencia_propia')
    .map(([key, values]) => ({
      name: CATEGORIES[key as TransactionCategory]?.label || key,
      value: values.ingreso > 0 ? values.ingreso : values.egreso,
      type: values.ingreso > 0 ? 'ingreso' : 'egreso',
      color: values.ingreso > 0 ? 'hsl(160, 84%, 39%)' : 'hsl(0, 84%, 60%)',
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Calculate totals
  const ingresos = Object.entries(categoryTotals).reduce((acc, [key, values]) => {
    if (key !== 'transferencia_propia') {
      acc += values.ingreso;
    }
    return acc;
  }, 0);

  const egresos = Object.entries(categoryTotals).reduce((acc, [key, values]) => {
    if (key !== 'transferencia_propia') {
      acc += values.egreso;
    }
    return acc;
  }, 0);

  const utilidadNeta = ingresos - egresos;

  // Income breakdown
  const incomeBreakdown = Object.entries(categoryTotals)
    .filter(([key, values]) => values.ingreso > 0 && key !== 'transferencia_propia')
    .map(([key, values]) => ({
      label: CATEGORIES[key as TransactionCategory]?.label || key,
      value: values.ingreso,
    }));

  // Expense breakdown
  const expenseBreakdown = Object.entries(categoryTotals)
    .filter(([key, values]) => values.egreso > 0 && key !== 'transferencia_propia')
    .map(([key, values]) => ({
      label: CATEGORIES[key as TransactionCategory]?.label || key,
      value: values.egreso,
    }));

  const currentMonth = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date());

  return (
    <div className="p-6 rounded-xl bg-card border border-border animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Estado de Resultados</h2>
        </div>
        <span className="text-sm text-muted-foreground capitalize">{currentMonth}</span>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="h-48 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis 
                type="number" 
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={80}
                tick={{ fill: 'hsl(210, 40%, 98%)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(222, 47%, 8%)',
                  border: '1px solid hsl(217, 33%, 17%)',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [`$${value.toLocaleString('es-MX')}`, '']}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Income Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">Ingresos</span>
        </div>
        <div className="space-y-1 pl-6">
          {incomeBreakdown.map((item) => (
            <div key={item.label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span>${item.value.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</span>
            </div>
          ))}
          {incomeBreakdown.length === 0 && (
            <span className="text-sm text-muted-foreground">Sin ingresos registrados</span>
          )}
        </div>
        <div className="flex justify-between mt-2 pt-2 border-t border-border pl-6">
          <span className="text-sm font-medium">Total Ingresos</span>
          <span className="text-sm font-semibold text-primary">
            ${ingresos.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Expense Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="w-4 h-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Egresos</span>
        </div>
        <div className="space-y-1 pl-6">
          {expenseBreakdown.map((item) => (
            <div key={item.label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span>${item.value.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</span>
            </div>
          ))}
          {expenseBreakdown.length === 0 && (
            <span className="text-sm text-muted-foreground">Sin egresos registrados</span>
          )}
        </div>
        <div className="flex justify-between mt-2 pt-2 border-t border-border pl-6">
          <span className="text-sm font-medium">Total Egresos</span>
          <span className="text-sm font-semibold text-destructive">
            ${egresos.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Net Income */}
      <div className={cn(
        "flex justify-between items-center p-3 rounded-lg mt-4",
        utilidadNeta >= 0 ? "bg-primary/10" : "bg-destructive/10"
      )}>
        <div className="flex items-center gap-2">
          <TrendingUp className={cn(
            "w-4 h-4",
            utilidadNeta >= 0 ? "text-primary" : "text-destructive"
          )} />
          <span className={cn(
            "text-sm font-medium",
            utilidadNeta >= 0 ? "text-primary" : "text-destructive"
          )}>
            Utilidad Neta
          </span>
        </div>
        <span className={cn(
          "text-lg font-bold",
          utilidadNeta >= 0 ? "text-primary" : "text-destructive"
        )}>
          ${utilidadNeta.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}
