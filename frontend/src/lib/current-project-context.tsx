'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProjectStage } from './projectStages';

export interface CurrentProject {
  id: string;
  name: string;
  status: string;
  stage: ProjectStage;
}

interface CurrentProjectContextValue {
  currentProject: CurrentProject | null;
  setCurrentProject: (project: CurrentProject | null) => void;
}

const STORAGE_KEY = 'setjeka_current_project';
const CurrentProjectContext = createContext<CurrentProjectContextValue | null>(null);

export function CurrentProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProjectState] = useState<CurrentProject | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCurrentProjectState(JSON.parse(stored));
    } catch {
      // localStorage unavailable or corrupt value - start with no current project
    }
  }, []);

  const setCurrentProject = useCallback((project: CurrentProject | null) => {
    setCurrentProjectState(project);
    try {
      if (project) localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ currentProject, setCurrentProject }), [currentProject, setCurrentProject]);

  return <CurrentProjectContext.Provider value={value}>{children}</CurrentProjectContext.Provider>;
}

export function useCurrentProject(): CurrentProjectContextValue {
  const ctx = useContext(CurrentProjectContext);
  if (!ctx) throw new Error('useCurrentProject must be used within a CurrentProjectProvider');
  return ctx;
}
