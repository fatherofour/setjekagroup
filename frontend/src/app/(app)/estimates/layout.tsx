import type { ReactNode } from 'react';
import { SetjekaOnly } from '@/components/common/SetjekaOnly';

/** Setjeka's own area (critique M-10). */
export default function Layout({ children }: { children: ReactNode }) {
  return <SetjekaOnly area="Estimates">{children}</SetjekaOnly>;
}
