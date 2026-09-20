'use client';

import { useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import type { useScheduleData } from './useScheduleData';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  DEPENDENCY_TYPE_LABEL,
  toDateInputValue,
  descendantIds,
  type ScheduleActivity,
  type ActivityType,
  type SchedulePriority,
  type ScheduleActivityStatus,
  type DependencyType,
} from './scheduleTypes';

export type ActivityPanelMode = { kind: 'edit'; activityId: string } | { kind: 'create'; parentId: string | null };

const inputClass =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const selectClass = `${inputClass} pr-2`;
const labelClass = 'mb-1 block text-xs text-slate-400 dark:text-slate-500';

interface FormState {
  name: string;
  description: string;
  activityType: ActivityType;
  startDate: string;
  durationDays: string;
  percentComplete: string;
  priority: SchedulePriority;
  status: ScheduleActivityStatus;
  parentId: string;
  projectNodeId: string;
  contractorId: string;
  assignedToId: string;
}

function emptyForm(parentId: string | null): FormState {
  return {
    name: '',
    description: '',
    activityType: 'TASK',
    startDate: new Date().toISOString().slice(0, 10),
    durationDays: '1',
    percentComplete: '0',
    priority: 'MEDIUM',
    status: 'NOT_STARTED',
    parentId: parentId ?? '',
    projectNodeId: '',
    contractorId: '',
    assignedToId: '',
  };
}

function formFromActivity(activity: ScheduleActivity): FormState {
  return {
    name: activity.name,
    description: activity.description ?? '',
    activityType: activity.activityType,
    startDate: toDateInputValue(activity.startDate),
    durationDays: String(activity.durationDays),
    percentComplete: String(activity.percentComplete),
    priority: activity.priority,
    status: activity.status,
    parentId: activity.parentId ?? '',
    projectNodeId: activity.projectNodeId ?? '',
    contractorId: activity.contractorId ?? '',
    assignedToId: activity.assignedToId ?? '',
  };
}

export function ActivityDetailPanel({
  mode,
  data,
  onClose,
}: {
  mode: ActivityPanelMode;
  data: ReturnType<typeof useScheduleData>;
  onClose: () => void;
}) {
  const { activities, dependencies, projectNodes, contractors, members, createActivity, updateActivity, deleteActivity, createDependency, deleteDependency } =
    data;
  const activity = mode.kind === 'edit' ? (activities ?? []).find((a) => a.id === mode.activityId) ?? null : null;

  // Initial value only — this component is remounted (via a `key` prop set
  // by the caller keyed on the activity id / parent id) whenever `mode`
  // points at a different activity, so the form never needs to reset
  // itself mid-life via an effect.
  const [form, setForm] = useState<FormState>(activity ? formFromActivity(activity) : emptyForm(mode.kind === 'create' ? mode.parentId : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPredecessorId, setNewPredecessorId] = useState('');
  const [newDependencyType, setNewDependencyType] = useState<DependencyType>('FS');
  const [newLagDays, setNewLagDays] = useState('0');

  const allActivities = activities ?? [];
  const excluded = activity ? descendantIds(allActivities, activity.id) : new Set<string>();
  const parentOptions = [
    { value: '', label: '— None (top-level) —' },
    ...allActivities.filter((a) => !excluded.has(a.id)).map((a) => ({ value: a.id, label: a.name })),
  ];
  const nodeOptions = [{ value: '', label: '— None —' }, ...projectNodes.map((n) => ({ value: n.id, label: n.name }))];
  const contractorOptions = [{ value: '', label: '— None —' }, ...contractors.map((c) => ({ value: c.id, label: c.name }))];
  const memberOptions = [
    { value: '', label: '— None —' },
    ...members.map((m) => ({ value: m.id, label: m.user?.fullName ?? m.externalName ?? 'Unnamed' })),
  ];

  const currentDependencies = activity ? (dependencies ?? []).filter((d) => d.successorId === activity.id) : [];
  const predecessorOptions = allActivities
    .filter((a) => a.id !== activity?.id && !currentDependencies.some((d) => d.predecessorId === a.id))
    .map((a) => ({ value: a.id, label: a.name }));

  async function save() {
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        activityType: form.activityType,
        startDate: form.startDate,
        durationDays: form.activityType === 'MILESTONE' ? 0 : Number(form.durationDays) || 1,
        percentComplete: Math.min(100, Math.max(0, Number(form.percentComplete) || 0)),
        priority: form.priority,
        status: form.status,
        parentId: form.parentId || null,
        projectNodeId: form.projectNodeId || null,
        contractorId: form.contractorId || null,
        assignedToId: form.assignedToId || null,
      };
      if (activity) {
        await updateActivity(activity.id, input);
      } else {
        await createActivity(input);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save this activity.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!activity) return;
    if (!confirm(`Delete "${activity.name}"? This also removes its dependency links.`)) return;
    setSaving(true);
    try {
      await deleteActivity(activity.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete this activity.');
      setSaving(false);
    }
  }

  async function addDependency() {
    if (!activity || !newPredecessorId) return;
    setError(null);
    try {
      await createDependency({ predecessorId: newPredecessorId, successorId: activity.id, type: newDependencyType, lagDays: Number(newLagDays) || 0 });
      setNewPredecessorId('');
      setNewLagDays('0');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add dependency.');
    }
  }

  async function removeDependency(id: string) {
    setError(null);
    try {
      await deleteDependency(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove dependency.');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{activity ? 'Edit activity' : 'New activity'}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {activity?.importedFromMsProject && (
          <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Imported from an MS Project file.
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className={labelClass}>Name</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={`${inputClass} h-16 resize-none py-2`}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <Select
                className={selectClass}
                value={form.activityType}
                onChange={(v) => setForm({ ...form, activityType: v as ActivityType })}
                options={[
                  { value: 'TASK', label: 'Task' },
                  { value: 'MILESTONE', label: 'Milestone' },
                ]}
              />
            </div>
            <div>
              <label className={labelClass}>Start date</label>
              <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
          </div>
          {form.activityType === 'TASK' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Duration (working days)</label>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={form.durationDays}
                  onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>% complete</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={form.percentComplete}
                  onChange={(e) => setForm({ ...form, percentComplete: e.target.value })}
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Priority</label>
              <Select
                className={selectClass}
                value={form.priority}
                onChange={(v) => setForm({ ...form, priority: v as SchedulePriority })}
                options={Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <Select
                className={selectClass}
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v as ScheduleActivityStatus })}
                options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Parent (WBS)</label>
            <Select className={selectClass} value={form.parentId} onChange={(v) => setForm({ ...form, parentId: v })} options={parentOptions} />
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <Select className={selectClass} value={form.projectNodeId} onChange={(v) => setForm({ ...form, projectNodeId: v })} options={nodeOptions} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Contractor</label>
              <Select
                className={selectClass}
                value={form.contractorId}
                onChange={(v) => setForm({ ...form, contractorId: v })}
                options={contractorOptions}
              />
            </div>
            <div>
              <label className={labelClass}>Assigned to</label>
              <Select
                className={selectClass}
                value={form.assignedToId}
                onChange={(v) => setForm({ ...form, assignedToId: v })}
                options={memberOptions}
              />
            </div>
          </div>
        </div>

        {activity && (
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Predecessors</h3>
            {currentDependencies.length === 0 ? (
              <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">No predecessors — this activity is scheduled from its own start date.</p>
            ) : (
              <ul className="mb-2 space-y-1">
                {currentDependencies.map((dep) => {
                  const pred = allActivities.find((a) => a.id === dep.predecessorId);
                  return (
                    <li
                      key={dep.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs dark:bg-slate-800/50"
                    >
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {pred?.name ?? 'Unknown'} · {DEPENDENCY_TYPE_LABEL[dep.type]}
                        {dep.lagDays !== 0 ? ` (${dep.lagDays > 0 ? '+' : ''}${dep.lagDays}d)` : ''}
                      </span>
                      <button onClick={() => removeDependency(dep.id)} className="shrink-0 text-slate-400 hover:text-red-600" aria-label="Remove dependency">
                        <Trash2 size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {predecessorOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className={`${selectClass} h-8 min-w-[9rem] flex-1`}
                  value={newPredecessorId}
                  onChange={setNewPredecessorId}
                  options={[{ value: '', label: 'Choose activity…' }, ...predecessorOptions]}
                />
                <Select
                  className={`${selectClass} h-8 w-24`}
                  value={newDependencyType}
                  onChange={(v) => setNewDependencyType(v as DependencyType)}
                  options={Object.keys(DEPENDENCY_TYPE_LABEL).map((value) => ({ value, label: value }))}
                />
                <input
                  type="number"
                  className={`${inputClass} h-8 w-16`}
                  value={newLagDays}
                  onChange={(e) => setNewLagDays(e.target.value)}
                  placeholder="Lag"
                  title="Lag (days)"
                />
                <button
                  onClick={addDependency}
                  disabled={!newPredecessorId}
                  className="flex h-8 items-center gap-1 rounded-md bg-slate-100 px-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>
            )}
          </div>
        )}

        {activity && (activity.totalFloatDays != null || activity.isCriticalPath) && (
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <p>
              Early: {toDateInputValue(activity.earlyStart)} → {toDateInputValue(activity.earlyFinish)}
            </p>
            <p>
              Late: {toDateInputValue(activity.lateStart)} → {toDateInputValue(activity.lateFinish)}
            </p>
            <p>
              Float: {activity.totalFloatDays ?? 0} working day{activity.totalFloatDays === 1 ? '' : 's'}
              {activity.isCriticalPath && <span className="ml-2 font-semibold text-red-600 dark:text-red-400">Critical path</span>}
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          {activity ? (
            <button onClick={remove} disabled={saving} className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
              <Trash2 size={13} />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
