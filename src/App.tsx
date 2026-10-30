import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'sonner';
import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { useHashRoute } from '@/hooks/useHashRoute';
import { clearCache } from '@/lib/storage/cache';
import { clearConnection, loadConnection, saveConnection, type Connection } from '@/lib/storage/connection';
import { DataProvider, useData } from '@/state/DataContext';
import { ConnectionPage } from '@/pages/ConnectionPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReadingsPage } from '@/pages/ReadingsPage';
import { ElectricityPage } from '@/pages/ElectricityPage';
import { GasPage } from '@/pages/GasPage';
import { SummaryPage } from '@/pages/SummaryPage';
import { SettingsPage } from '@/pages/SettingsPage';

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Caricamento">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

function Shell() {
  const { route, param, navigate } = useHashRoute();
  const { loading } = useData();

  const page = (() => {
    switch (route) {
      case 'letture':
        return <ReadingsPage />;
      case 'luce':
        return <ElectricityPage navigate={navigate} />;
      case 'gas':
        return <GasPage />;
      case 'riepilogo':
        return <SummaryPage focusMonth={param} />;
      case 'impostazioni':
        return <SettingsPage />;
      default:
        return <DashboardPage navigate={navigate} />;
    }
  })();

  return (
    <Layout route={route} navigate={navigate}>
      {loading ? (
        <LoadingSkeleton />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={route}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {page}
          </motion.div>
        </AnimatePresence>
      )}
    </Layout>
  );
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />;
}

export function App() {
  const [connection, setConnection] = useState<Connection | null>(() => loadConnection());

  return (
    <ThemeProvider>
      <ThemedToaster />
      {connection ? (
        <DataProvider
          key={`${connection.owner}/${connection.repo}`}
          connection={connection}
          onDisconnect={() => {
            clearConnection();
            void clearCache();
            setConnection(null);
            window.location.hash = '';
          }}
        >
          <Shell />
        </DataProvider>
      ) : (
        <ConnectionPage
          onConnect={(c) => {
            saveConnection(c);
            setConnection(c);
          }}
        />
      )}
    </ThemeProvider>
  );
}
