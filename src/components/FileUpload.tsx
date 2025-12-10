import { useState, useCallback } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
}

export function FileUpload({ onFileUpload }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const acceptedTypes = [
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const validateFile = (file: File): boolean => {
    const isValidType = acceptedTypes.includes(file.type) || 
                        file.name.endsWith('.csv') ||
                        file.name.endsWith('.xlsx') ||
                        file.name.endsWith('.xls') ||
                        file.name.endsWith('.pdf');
    
    if (!isValidType) {
      toast({
        title: 'Formato no válido',
        description: 'Por favor sube un archivo CSV, Excel o PDF',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        setUploadedFile(file);
        onFileUpload(file);
        toast({
          title: 'Archivo cargado',
          description: `${file.name} se procesará ahora`,
        });
      }
    }
  }, [onFileUpload, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        setUploadedFile(file);
        onFileUpload(file);
        toast({
          title: 'Archivo cargado',
          description: `${file.name} se procesará ahora`,
        });
      }
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
  };

  return (
    <div className="p-6 rounded-xl bg-card border border-border animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Cargar Estado de Cuenta</h2>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center",
          "p-8 border-2 border-dashed rounded-lg",
          "transition-all duration-300 cursor-pointer",
          isDragging 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-primary/50 hover:bg-secondary/30"
        )}
      >
        {uploadedFile ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
            <FileText className="w-8 h-8 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">{uploadedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(uploadedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={removeFile}
              className="p-1 rounded hover:bg-background transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 rounded-full bg-secondary mb-4">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">Arrastra tu archivo aquí</p>
            <p className="text-xs text-muted-foreground mb-4">CSV, Excel o PDF de tu banco</p>
          </>
        )}

        <input
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {!uploadedFile && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" className="relative overflow-hidden">
            Seleccionar archivo
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </Button>
        </div>
      )}
    </div>
  );
}
