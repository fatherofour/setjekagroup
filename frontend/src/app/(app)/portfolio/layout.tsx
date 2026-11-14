import type { ReactNode } from 'react';
import { SetjekaOnly } from '@/components/common/SetjekaOnly';

/** Setjeka's own area: no portfolio call for outsiders (critique V3-L-09). */
export default function Layout({ children }: { children: ReactNode }) {
  return <SetjekaOnly area="The portfolio">{children}</SetjekaOnly>;
}
