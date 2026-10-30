import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  color: string;
  index?: number;
}

export function KpiCard({ label, value, sub, icon: Icon, color, index = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift sm:p-5"
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-[0.08] blur-2xl transition-opacity group-hover:opacity-[0.14]"
        style={{ background: color }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-xl" style={{ background: `${color}1f`, color }}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className={cn('mt-2 text-xl font-semibold tracking-tight tabular sm:text-2xl')}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}
