import { useDb } from '@/state/DataContext';

/** Nomi mostrati nell'interfaccia al posto di "inquilino" e "proprietario" (modificabili in Impostazioni). */
export function useNames(): { tenant: string; owner: string } {
  const { settings } = useDb();
  return {
    tenant: settings.tenantName.trim() || 'Inquilino',
    owner: settings.ownerName.trim() || 'Proprietario',
  };
}
