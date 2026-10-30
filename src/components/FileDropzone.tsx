import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  accept: string;
  label: string;
  hint?: string;
  loading?: boolean;
  accent?: 'elec' | 'gas' | 'neutral';
  onFile: (file: File) => void;
  capture?: 'environment' | 'user';
}

const ACCENTS = {
  elec: 'from-amber-500/10 text-amber-600 dark:text-amber-400',
  gas: 'from-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  neutral: 'from-zinc-500/10 text-foreground',
};

export function FileDropzone({ accept, label, hint, loading, accent = 'neutral', onFile, capture }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handle = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <motion.div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      animate={{ scale: over ? 1.01 : 1 }}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-gradient-to-b to-transparent p-6 text-center transition-colors sm:p-8',
        ACCENTS[accent],
        over ? 'border-current' : 'border-border',
        loading && 'pointer-events-none opacity-80',
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-card shadow-soft ring-1 ring-border">
        {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileUp className="size-5" aria-hidden />}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{loading ? 'Analisi in corso…' : label}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={loading}
      >
        Scegli file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
    </motion.div>
  );
}
