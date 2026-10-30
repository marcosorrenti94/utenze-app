import { useCallback, useEffect, useState } from 'react';

export type Route = 'dashboard' | 'letture' | 'luce' | 'gas' | 'riepilogo' | 'impostazioni';
export const ROUTES: Route[] = ['dashboard', 'letture', 'luce', 'gas', 'riepilogo', 'impostazioni'];

function parse(): { route: Route; param: string | null } {
  const [, r, p] = window.location.hash.replace(/^#/, '').split('/');
  const route = (ROUTES as string[]).includes(r) ? (r as Route) : 'dashboard';
  return { route, param: p ?? null };
}

/** Routing minimale basato su hash: funziona su GitHub Pages senza configurazioni extra. */
export function useHashRoute() {
  const [state, setState] = useState(parse);
  useEffect(() => {
    const fn = () => {
      setState(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  const navigate = useCallback((route: Route, param?: string) => {
    window.location.hash = `/${route}${param ? `/${param}` : ''}`;
  }, []);
  return { ...state, navigate };
}
