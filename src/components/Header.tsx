import { FileSpreadsheet, Sun, Moon } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const [isDark, setIsDark] = useState(true);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/20">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Gestión Financiera</h1>
        </div>
      </div>
      
      <button
        onClick={() => setIsDark(!isDark)}
        className="p-2 rounded-lg hover:bg-secondary transition-colors"
      >
        {isDark ? (
          <Sun className="w-5 h-5 text-muted-foreground" />
        ) : (
          <Moon className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
    </header>
  );
}
