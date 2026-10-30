import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'elec' | 'gas' | 'tenant' | 'neutral';
  className?: string;
}

const TONES = {
  elec: ['#f59e0b', '#fde68a'],
  gas: ['#06b6d4', '#a5f3fc'],
  tenant: ['#8b5cf6', '#ddd6fe'],
  neutral: ['#71717a', '#e4e4e7'],
};

/** Stato vuoto illustrato (SVG inline, nessuna risorsa esterna). */
export function EmptyState({ icon: Icon, title, description, action, tone = 'neutral', className }: Props) {
  const [c1, c2] = TONES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div className="relative mb-5 h-28 w-40">
        <svg viewBox="0 0 160 112" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id={`es-${tone}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={c1} stopOpacity="0.25" />
              <stop offset="1" stopColor={c2} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <ellipse cx="80" cy="100" rx="56" ry="7" fill={c1} opacity="0.08" />
          <rect x="22" y="18" width="116" height="74" rx="16" fill={`url(#es-${tone})`} stroke={c1} strokeOpacity="0.25" />
          <rect x="36" y="34" width="44" height="6" rx="3" fill={c1} opacity="0.25" />
          <rect x="36" y="48" width="70" height="6" rx="3" fill={c1} opacity="0.15" />
          <rect x="36" y="62" width="56" height="6" rx="3" fill={c1} opacity="0.12" />
          <circle cx="132" cy="22" r="5" fill={c1} opacity="0.35" />
          <circle cx="20" cy="84" r="3" fill={c1} opacity="0.3" />
        </svg>
        <div
          className="absolute -bottom-1 right-6 flex size-12 items-center justify-center rounded-2xl bg-card shadow-lift ring-1 ring-border"
          style={{ color: c1 }}
        >
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
