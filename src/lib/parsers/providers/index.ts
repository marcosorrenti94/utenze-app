import type { ProviderProfile } from '../types';
import { AMOUNT_SRC } from '../numbers';

const A = `(${AMOUNT_SRC})`;
const re = (src: string) => new RegExp(src, 'i');

/**
 * Registro dei fornitori. Per aggiungerne uno nuovo basta aggiungere un oggetto
 * a questo array (o chiamare `registerProvider`) con un'espressione `detect`
 * e, se servono, pattern specifici che verranno provati prima di quelli generici.
 */
const PROVIDERS: ProviderProfile[] = [
  {
    id: 'enel',
    name: 'Enel Energia',
    detect: /enel\s+energia|servizio\s+elettrico\s+nazionale|enel\.it/i,
    patterns: { total: [re(String.raw`totale\s+da\s+pagare[^\n]{0,40}?${A}`)] },
  },
  {
    id: 'a2a',
    name: 'A2A Energia',
    detect: /a2a\s+energia|a2a\.it/i,
    patterns: { total: [re(String.raw`importo\s+da\s+pagare[^\n]{0,40}?${A}`)] },
  },
  {
    id: 'edison',
    name: 'Edison Energia',
    detect: /edison\s+energia|edisonenergia\.it/i,
  },
  {
    id: 'hera',
    name: 'Hera Comm',
    detect: /hera\s*comm|gruppohera/i,
    patterns: { total: [re(String.raw`importo\s+(?:totale\s+)?da\s+pagare[^\n]{0,40}?${A}`)] },
  },
  {
    id: 'iren',
    name: 'Iren Mercato',
    detect: /iren\s+mercato|irenlucegas|iren\.it/i,
  },
  {
    id: 'plenitude',
    name: 'Eni Plenitude',
    detect: /plenitude|eni\s+gas\s+e\s+luce/i,
    patterns: { total: [re(String.raw`totale\s+bolletta[^\n]{0,40}?${A}`)] },
  },
  {
    id: 'sorgenia',
    name: 'Sorgenia',
    detect: /sorgenia/i,
  },
  {
    id: 'acea',
    name: 'Acea Energia',
    detect: /acea\s+energia/i,
  },
  {
    id: 'engie',
    name: 'Engie Italia',
    detect: /engie/i,
  },
  {
    id: 'octopus',
    name: 'Octopus Energy',
    detect: /octopus\s+energy/i,
  },
];

export function registerProvider(profile: ProviderProfile): void {
  const i = PROVIDERS.findIndex((p) => p.id === profile.id);
  if (i >= 0) PROVIDERS[i] = profile;
  else PROVIDERS.push(profile);
}

export function detectProvider(text: string): ProviderProfile | null {
  return PROVIDERS.find((p) => p.detect.test(text)) ?? null;
}

export function listProviders(): ProviderProfile[] {
  return [...PROVIDERS];
}
