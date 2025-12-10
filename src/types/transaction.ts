export type TransactionCategory = 
  | 'viaticos'
  | 'gasolina'
  | 'compras_online'
  | 'alimentos'
  | 'diversion'
  | 'servicios'
  | 'nomina'
  | 'renta'
  | 'marketing'
  | 'proveedores'
  | 'ventas'
  | 'intereses'
  | 'transferencia_propia'
  | 'sin_clasificar';

export type TransactionType = 'ingreso' | 'egreso';

export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  bank: string;
  isOwnTransfer: boolean;
}

export interface CategoryConfig {
  label: string;
  color: string;
  keywords: string[];
  type: TransactionType | 'both';
}

export const CATEGORIES: Record<TransactionCategory, CategoryConfig> = {
  viaticos: {
    label: 'Viáticos',
    color: 'hsl(38, 92%, 50%)',
    keywords: ['hotel', 'hospedaje', 'avion', 'vuelo', 'uber', 'taxi', 'didi', 'viaje'],
    type: 'egreso',
  },
  gasolina: {
    label: 'Gasolina',
    color: 'hsl(280, 65%, 60%)',
    keywords: ['gasolina', 'combustible', 'pemex', 'gas', 'oxxo gas', 'bp'],
    type: 'egreso',
  },
  compras_online: {
    label: 'Compras Online',
    color: 'hsl(200, 80%, 50%)',
    keywords: ['amazon', 'mercadolibre', 'mercado libre', 'shopify', 'paypal', 'ebay', 'aliexpress'],
    type: 'egreso',
  },
  alimentos: {
    label: 'Alimentos',
    color: 'hsl(25, 95%, 53%)',
    keywords: ['restaurante', 'comida', 'uber eats', 'didi food', 'rappi', 'oxxo', 'supermercado', 'walmart', 'soriana'],
    type: 'egreso',
  },
  diversion: {
    label: 'Diversión',
    color: 'hsl(320, 70%, 55%)',
    keywords: ['cine', 'netflix', 'spotify', 'xbox', 'playstation', 'steam', 'entretenimiento'],
    type: 'egreso',
  },
  servicios: {
    label: 'Servicios',
    color: 'hsl(160, 84%, 39%)',
    keywords: ['luz', 'agua', 'telefono', 'internet', 'cfe', 'telmex', 'izzi', 'totalplay'],
    type: 'egreso',
  },
  nomina: {
    label: 'Nómina',
    color: 'hsl(0, 72%, 51%)',
    keywords: ['nomina', 'salario', 'sueldo', 'pago empleado'],
    type: 'egreso',
  },
  renta: {
    label: 'Renta',
    color: 'hsl(0, 84%, 60%)',
    keywords: ['renta', 'alquiler', 'arrendamiento', 'oficina'],
    type: 'egreso',
  },
  marketing: {
    label: 'Marketing',
    color: 'hsl(38, 92%, 50%)',
    keywords: ['facebook ads', 'google ads', 'publicidad', 'marketing', 'instagram'],
    type: 'egreso',
  },
  proveedores: {
    label: 'Proveedores',
    color: 'hsl(220, 70%, 50%)',
    keywords: ['proveedor', 'materia prima', 'insumos', 'compra'],
    type: 'egreso',
  },
  ventas: {
    label: 'Ventas',
    color: 'hsl(160, 84%, 39%)',
    keywords: ['venta', 'pago cliente', 'factura', 'cobro'],
    type: 'ingreso',
  },
  intereses: {
    label: 'Intereses',
    color: 'hsl(180, 60%, 45%)',
    keywords: ['interes', 'rendimiento', 'dividendo'],
    type: 'ingreso',
  },
  transferencia_propia: {
    label: 'Transferencia Propia',
    color: 'hsl(220, 15%, 50%)',
    keywords: ['spei', 'transferencia', 'traspaso'],
    type: 'both',
  },
  sin_clasificar: {
    label: 'Sin Clasificar',
    color: 'hsl(220, 15%, 50%)',
    keywords: [],
    type: 'both',
  },
};

export const BANKS = ['BBVA', 'Santander', 'Banorte', 'HSBC', 'Citibanamex', 'Scotiabank'];
