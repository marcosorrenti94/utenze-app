import type { ReactNode } from 'react';
import { Flame, Gauge, LayoutDashboard, Receipt, Settings, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Route } from '@/hooks/useHashRoute';
import { cn } from '@/lib/utils';
import { SyncIndicator } from './SyncIndicator';
import { ThemeToggle } from './ThemeToggle';

const NAV: { route: Route; label: string; icon: typeof Zap; mobile: boolean }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, mobile: true },
  { route: 'letture', label: 'Letture', icon: Gauge, mobile: true },
  { route: 'luce', label: 'Luce', icon: Zap, mobile: true },
  { route: 'gas', label: 'Gas', icon: Flame, mobile: true },
  { route: 'riepilogo', label: 'Riepilogo', icon: Receipt, mobile: true },
  { route: 'impostazioni', label: 'Impostazioni', icon: Settings, mobile: false },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-cyan-500 text-white shadow-soft">
        <Zap className="size-4" fill="currentColor" aria-hidden />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Utenze</p>
        <p className="text-[11px] text-muted-foreground">Luce &amp; Gas</p>
      </div>
    </div>
  );
}

export function Layout({ route, navigate, children }: { route: Route; navigate: (r: Route) => void; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background bg-app-gradient">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Vai al contenuto
      </a>

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card/60 px-3 py-5 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Navigazione principale">
          {NAV.map((n) => {
            const active = route === n.route;
            return (
              <button
                key={n.route}
                type="button"
                onClick={() => navigate(n.route)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg bg-accent"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <n.icon className="relative size-4" aria-hidden />
                <span className="relative">{n.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="flex items-center justify-between px-1">
          <SyncIndicator />
          <ThemeToggle />
        </div>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/75 px-4 backdrop-blur-xl lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <SyncIndicator compact />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => navigate('impostazioni')}
            aria-label="Impostazioni"
            className={cn(
              'flex size-9 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              route === 'impostazioni' && 'bg-accent',
            )}
          >
            <Settings className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <main id="main" className="px-4 pb-28 pt-6 sm:px-6 lg:ml-60 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Bottom nav mobile */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 backdrop-blur-xl lg:hidden"
        aria-label="Navigazione principale"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.filter((n) => n.mobile).map((n) => {
            const active = route === n.route;
            return (
              <li key={n.route}>
                <button
                  type="button"
                  onClick={() => navigate(n.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-accent')}>
                    <n.icon className="size-[18px]" aria-hidden />
                  </span>
                  {n.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
