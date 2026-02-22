import { Header } from '@/components/Header';
import { SummaryCards } from '@/components/SummaryCards';
import { FileUpload } from '@/components/FileUpload';
import { TransactionList } from '@/components/TransactionList';
import { IncomeStatement } from '@/components/IncomeStatement';
import { useTransactions } from '@/hooks/useTransactions';

const Index = () => {
  const { transactions, processFile, updateCategory, deleteTransaction } = useTransactions();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Summary Cards */}
        <section className="mb-6">
          <SummaryCards transactions={transactions} />
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - File Upload & Transactions */}
          <div className="lg:col-span-2 space-y-6">
            <FileUpload onFileUpload={processFile} />
            <TransactionList 
              transactions={transactions} 
              onUpdateCategory={updateCategory}
              onDelete={deleteTransaction}
            />
          </div>

          {/* Right Column - Income Statement */}
          <div className="lg:col-span-1">
            <IncomeStatement transactions={transactions} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
