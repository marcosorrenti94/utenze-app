import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { AutoBadge } from './AutoBadge';
import { cn } from '@/lib/utils';

export function Field({
  id,
  label,
  auto = false,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  auto?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="flex flex-wrap items-center">
        {label}
        <AutoBadge show={auto} />
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
