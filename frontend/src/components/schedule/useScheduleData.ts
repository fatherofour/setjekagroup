'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { Contractor } from '@/lib/contractors';
import type {
  ScheduleActivity,
  ScheduleDependency,
  ProjectNodeLite,
  ProjectMemberLite,
  ActivityType,
  SchedulePriority,
  ScheduleActivityStatus,
  DependencyType,
} from './scheduleTypes';

export interface ActivityInput {
  name: string;
  description?: string | null;
  activityType: ActivityType;
  startDate: string;
  durationDays?: number;
  percentComplete?: number;
  priority?: SchedulePriority;
  status?: ScheduleActivityStatus;
  parentId?: string | null;
  projectNodeId?: string | null;
  contractorId?: string | null;
  assignedToId?: string | null;
  sortOrder?: number;
}

export interface DependencyInput {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

// Single source of truth for the four Schedule views (Grid/Gantt/Calendar/
// Card) — every view reads the same flat activity+dependency payload and
// shapes it client-side (per the plan: no server-side view-specific
// endpoint), and every mutation goes through here so all four views and
// the shared detail panel stay in sync without duplicating fetch/CRUD logic.
export function useScheduleData(projectId: string) {
  const { authedFetch } = useAuth();
  const [activities, setActivities] = useState<ScheduleActivity[] | null>(null);
  const [dependencies, setDependencies] = useState<ScheduleDependency[] | null>(null);
  const [projectNodes, setProjectNodes] = useState<ProjectNodeLite[]>([]);
  const [contractors, setContractors] = useState<ContractorLite[]>([]);
  const [members, setMembers] = useState<ProjectMemberLite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([
        authedFetch<ScheduleActivity[]>(`/projects/${projectId}/schedule/activities`),
        authedFetch<ScheduleDependency[]>(`/projects/${projectId}/schedule/dependencies`),
      ]);
      setActivities(a);
      setDependencies(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the schedule.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    reload();
    authedFetch<ProjectNodeLite[]>(`/projects/${projectId}/nodes`).then(setProjectNodes).catch(() => {});
    authedFetch<Contractor[]>('/contractors').then(setContractors).catch(() => {});
    authedFetch<ProjectMemberLite[]>(`/projects/${projectId}/members`).then(setMembers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function createActivity(input: ActivityInput) {
    const created = await authedFetch<ScheduleActivity>(`/projects/${projectId}/schedule/activities`, { method: 'POST', body: input });
    await reload();
    return created;
  }

  async function updateActivity(id: string, input: Partial<ActivityInput>) {
    const updated = await authedFetch<ScheduleActivity>(`/projects/${projectId}/schedule/activities/${id}`, { method: 'PATCH', body: input });
    await reload();
    return updated;
  }

  async function deleteActivity(id: string) {
    await authedFetch(`/projects/${projectId}/schedule/activities/${id}`, { method: 'DELETE' });
    await reload();
  }

  async function createDependency(input: DependencyInput) {
    await authedFetch(`/projects/${projectId}/schedule/dependencies`, { method: 'POST', body: input });
    await reload();
  }

  async function deleteDependency(id: string) {
    await authedFetch(`/projects/${projectId}/schedule/dependencies/${id}`, { method: 'DELETE' });
    await reload();
  }

  return {
    activities,
    dependencies,
    projectNodes,
    contractors,
    members,
    error,
    setError,
    reload,
    createActivity,
    updateActivity,
    deleteActivity,
    createDependency,
    deleteDependency,
  };
}

// Re-exported so views only need one import for the Contractor list shape.
export type ContractorLite = Pick<Contractor, 'id' | 'name'>;
