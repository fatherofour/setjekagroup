'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Plus, Trash2, Building2, Layers, Boxes, Map as MapIcon, Package } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';

type NodeType = 'PHASE' | 'BUILDING' | 'FLOOR' | 'ZONE' | 'WORK_PACKAGE';

interface ProjectNode {
  id: string;
  projectId: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  sortOrder: number;
}

const NODE_TYPE_OPTIONS: { value: NodeType; label: string }[] = [
  { value: 'PHASE', label: 'Phase' },
  { value: 'BUILDING', label: 'Building' },
  { value: 'FLOOR', label: 'Floor' },
  { value: 'ZONE', label: 'Zone' },
  { value: 'WORK_PACKAGE', label: 'Work package' },
];

const NODE_ICON: Record<NodeType, typeof Building2> = {
  PHASE: Layers,
  BUILDING: Building2,
  FLOOR: Boxes,
  ZONE: MapIcon,
  WORK_PACKAGE: Package,
};

interface TreeRow {
  node: ProjectNode;
  depth: number;
  hasChildren: boolean;
}

function buildTree(nodes: ProjectNode[]): TreeRow[] {
  const byParent = new Map<string | null, ProjectNode[]>();
  for (const node of nodes) {
    const key = node.parentId;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(node);
    else byParent.set(key, [node]);
  }
  for (const bucket of byParent.values()) bucket.sort((a, b) => a.sortOrder - b.sortOrder);

  const rows: TreeRow[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const node of byParent.get(parentId) ?? []) {
      rows.push({ node, depth, hasChildren: (byParent.get(node.id)?.length ?? 0) > 0 });
      walk(node.id, depth + 1);
    }
  }
  walk(null, 0);
  return rows;
}

function AddNodeForm({
  onAdd,
  onCancel,
  compact,
}: {
  onAdd: (type: NodeType, name: string) => Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [type, setType] = useState<NodeType>('PHASE');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd(type, name.trim());
      setName('');
      onCancel?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50'}`}>
      <Select
        value={type}
        onChange={(v) => setType(v as NodeType)}
        options={NODE_TYPE_OPTIONS}
        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Name"
        autoFocus
        className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <button
        onClick={submit}
        disabled={saving || !name.trim()}
        className="h-8 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
      >
        Add
      </button>
      {onCancel && (
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          Cancel
        </button>
      )}
    </div>
  );
}

export function ProjectNodeTree({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [nodes, setNodes] = useState<ProjectNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await authedFetch<ProjectNode[]>(`/projects/${projectId}/nodes`);
      setNodes(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load project structure.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const rows = useMemo(() => buildTree(nodes ?? []), [nodes]);

  async function addNode(type: NodeType, name: string, parentId: string | null) {
    try {
      await authedFetch(`/projects/${projectId}/nodes`, { method: 'POST', body: { type, name, parentId: parentId ?? undefined } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add item.');
    }
  }

  async function deleteNode(id: string) {
    try {
      await authedFetch(`/projects/${projectId}/nodes/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete item.');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Structure</h2>
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
        Phase → building → floor → zone → work package. Add only the levels this project actually needs.
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {nodes === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No structure defined yet.</p>
          ) : (
            <ul className="mb-3 space-y-1">
              {rows.map(({ node, depth }) => {
                const Icon = NODE_ICON[node.type];
                return (
                  <li key={node.id}>
                    <div className="group/row flex items-center gap-2 rounded-md py-1 hover:bg-slate-50 dark:hover:bg-slate-800/40" style={{ paddingLeft: depth * 20 }}>
                      <ChevronRight size={12} className="shrink-0 text-transparent" />
                      <Icon size={14} className="shrink-0 text-slate-400" />
                      <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{node.name}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {NODE_TYPE_OPTIONS.find((o) => o.value === node.type)?.label}
                      </span>
                      <button
                        onClick={() => setAddingChildOf(addingChildOf === node.id ? null : node.id)}
                        className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-emerald-700 group-hover/row:opacity-100 dark:hover:bg-slate-700"
                        aria-label={`Add item under ${node.name}`}
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => deleteNode(node.id)}
                        className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/row:opacity-100 dark:hover:bg-red-950"
                        aria-label={`Delete ${node.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {addingChildOf === node.id && (
                      <div style={{ paddingLeft: (depth + 1) * 20 }} className="mt-1">
                        <AddNodeForm
                          compact
                          onAdd={(type, name) => addNode(type, name, node.id)}
                          onCancel={() => setAddingChildOf(null)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <AddNodeForm onAdd={(type, name) => addNode(type, name, null)} />
        </>
      )}
    </div>
  );
}
