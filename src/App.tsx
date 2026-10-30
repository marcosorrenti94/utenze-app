import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { useHashRoute } from '@/hooks/useHashRoute';
import { clearCache } from '@/lib/storage/cache';
import { clearConnection, loadConnection, saveConnection, type Connection } from '@/lib/storage/connection';
import { clearInviteFromUrl, isInviteHash, parseInviteHash } from '@/lib/storage/invite';
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

type InviteOutcome = 'connected' | 'ignored-owner' | 'invalid' | null;

/** Applica un eventuale link di accesso (#invito=…) prima del primo render. */
function initialConnection(): { connection: Connection | null; invite: InviteOutcome } {
  const existing = loadConnection();
  if (!isInviteHash(window.location.hash)) return { connection: existing, invite: null };
  const invite = parseInviteHash(window.location.hash);
  clearInviteFromUrl();
  if (!invite) return { connection: existing, invite: 'invalid' };
  // Su un dispositivo già collegato con accesso completo (il proprietario) l'invito non sostituisce la connessione
  if (existing && !existing.readOnly) return { connection: existing, invite: 'ignored-owner' };
  saveConnection(invite);
  return { connection: invite, invite: 'connected' };
}

function InviteNotice({ outcome }: { outcome: InviteOutcome }) {
  useEffect(() => {
    if (outcome === 'connected') toast.success('Accesso in sola consultazione attivato', { description: 'Puoi vedere i dati ma non modificarli.' });
    if (outcome === 'ignored-owner') {
      toast.info('Link di accesso ignorato', { description: 'Questo dispositivo è già collegato con accesso completo.' });
    }
    if (outcome === 'invalid') toast.error('Link di accesso non valido', { description: 'Chiedi al proprietario di inviarti un nuovo link.' });
  }, [outcome]);
  return null;
}

export function App() {
  const [initial] = useState(initialConnection);
  const [connection, setConnection] = useState<Connection | null>(initial.connection);

  // Link di accesso aperto con l'app già caricata nella stessa scheda: cambia solo il "#", quindi si ricarica
  // la pagina per applicarlo dall'inizio (initialConnection).
  useEffect(() => {
    const onHash = () => {
      if (isInviteHash(window.location.hash)) window.location.reload();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <ThemeProvider>
      <ThemedToaster />
      <InviteNotice outcome={initial.invite} />
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
