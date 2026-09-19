'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
}

// Read-only when onChange is omitted (list display); interactive
// click-to-set when provided (the add-rating form). 1-5 stars, matching
// the backend's stars 1-5 validation.
export function StarRating({ value, onChange, size = 16 }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const interactive = Boolean(onChange);
  const displayed = hover ?? value;

  return (
    <div className={`flex items-center gap-0.5 ${interactive ? '' : 'pointer-events-none'}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          tabIndex={interactive ? 0 : -1}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(null)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className={interactive ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star
            size={size}
            className={n <= displayed ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300 dark:text-slate-600'}
          />
        </button>
      ))}
    </div>
  );
}
