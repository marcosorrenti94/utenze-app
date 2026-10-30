import type * as React from 'react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseDecimalInput, toInputValue } from '@/lib/format';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  allowNegative?: boolean;
}

const same = (a: number | null, b: number | null) => (a ?? 0) === (b ?? 0);

/** Campo numerico che accetta virgola o punto come separatore decimale (comodo da smartphone). */
export const NumberInput = forwardRef<HTMLInputElement, Props>(({ value, onValueChange, allowNegative = false, ...props }, ref) => {
  const [text, setText] = useState(toInputValue(value));
  const lastEmitted = useRef<number | null>(value);

  // Aggiorna il testo solo se il valore cambia dall'esterno (reset, dati estratti dal PDF…)
  useEffect(() => {
    if (same(value, lastEmitted.current)) return;
    lastEmitted.current = value;
    setText(toInputValue(value));
  }, [value]);

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const pattern = allowNegative ? /[^\d,.-]/g : /[^\d,.]/g;
        const raw = e.target.value.replace(pattern, '');
        setText(raw);
        const n = parseDecimalInput(raw);
        const next = Number.isFinite(n) ? n : null;
        lastEmitted.current = next;
        onValueChange(next);
      }}
      {...props}
    />
  );
});
NumberInput.displayName = 'NumberInput';
