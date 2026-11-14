'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

/** Which record a panel has open, starting from the link that brought the
 * person here (`?task=<id>`, `?rfi=<id>`...), so a notification or an action
 * in My Day opens the record itself, not just its list (critique M-06). A new
 * link opens its record; otherwise the panel's own choice stands. */
export function useLinkedId(param: string): [string | null, (id: string | null) => void] {
  const linked = useSearchParams().get(param);
  const [state, setState] = useState<{ id: string | null; from: string | null }>({ id: linked, from: linked });
  // Adjusting state while rendering, when the link changes (React's
  // recommended alternative to an effect for this).
  if (state.from !== linked) setState({ id: linked ?? state.id, from: linked });
  return [state.id, (id) => setState((s) => ({ ...s, id }))];
}
