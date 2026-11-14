'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';

export type Area = string;
export type Action = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'COMMENT';
type Matrix = Record<Area, Record<Action, boolean>>;

/** What the signed-in person may do on a project, area by area, from the
 * same rules the API applies (critique M-09): screens offer only the actions
 * the API will accept. Until it has loaded, nothing is offered. */
export function useMyPermissions(projectId: string | null | undefined) {
  const { authedFetch } = useAuth();
  const [m, setM] = useState<{ projectId: string; matrix: Matrix } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    authedFetch<Matrix>(`/projects/${projectId}/my-permissions`)
      .then((matrix) => setM({ projectId, matrix }))
      .catch(() => setM({ projectId, matrix: {} }));
  }, [projectId, authedFetch]);
  const matrix = m && m.projectId === projectId ? m.matrix : null;
  return {
    loaded: Boolean(matrix),
    can: (area: Area, action: Action) => Boolean(matrix?.[area]?.[action]),
  };
}
