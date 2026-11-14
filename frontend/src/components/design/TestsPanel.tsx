'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, FlaskConical, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls, todayIso } from '@/lib/architect';
import { DateInput } from '@/components/ui/DateInput';

type Rule = 'MIN' | 'MAX' | 'RANGE' | 'PASS_FAIL';
type Outcome = 'PASS' | 'FAIL';
type PointKind = 'HOLD' | 'WITNESS';
type PointStatus = 'PLANNED' | 'NOTIFIED' | 'RELEASED' | 'PROCEEDED' | 'CANCELLED';

interface Criterion {
  id: string;
  code: string;
  name: string;
  standardRef: string | null;
  unit: string | null;
  rule: Rule;
  minValue: number | null;
  maxValue: number | null;
  frequency: string | null;
  active: boolean;
  _count?: { results: number };
}

interface TestResult {
  id: string;
  number: string;
  title: string;
  location: string | null;
  criterion: Pick<Criterion, 'id' | 'code' | 'name' | 'unit' | 'rule' | 'minValue' | 'maxValue'>;
  contractor: { id: string; name: string } | null;
  scheduleActivity: { id: string; name: string } | null;
  holdPoint: { id: string; number: string; title: string } | null;
  retestOf: { id: string; number: string; outcome: Outcome } | null;
  retests: { id: string; number: string; outcome: Outcome }[];
  sampleRef: string | null;
  laboratory: string | null;
  sampledAt: string | null;
  testedAt: string;
  value: number | null;
  outcome: Outcome;
  remarks: string | null;
  status: 'RECORDED' | 'REVIEWED';
  recordedBy: { id: string; fullName: string };
  reviewedBy: { fullName: string } | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  ncrs: { id: string; number: string; status: string }[];
  can: { review: boolean; raiseNcr: boolean; retest: boolean };
}

interface HoldPoint {
  id: string;
  number: string;
  kind: PointKind;
  title: string;
  description: string | null;
  location: string | null;
  status: PointStatus;
  noticeHours: number;
  readyAt: string | null;
  releasedAt: string | null;
  releaseComment: string | null;
  cancelReason: string | null;
  criterion: { id: string; code: string; name: string } | null;
  contractor: { id: string; name: string } | null;
  scheduleActivity: { id: string; name: string } | null;
  releaser: { id: string; externalName: string | null; user: { fullName: string } | null } | null;
  releasedBy: { fullName: string } | null;
  createdBy: { id: string; fullName: string };
  tests: { id: string; number: string; outcome: Outcome; testedAt: string }[];
  history: { status: PointStatus; at: string; comment: string | null }[];
  needsPassingTest: boolean;
  can: { notify: boolean; release: boolean; notReady: boolean; proceed: boolean; cancel: boolean; recordTest: boolean };
}

interface Options {
  activities: { id: string; name: string }[];
  contractors: { id: string; name: string }[];
  releasers: { id: string; role: string; name: string }[];
  can: { define: boolean; record: boolean; review: boolean };
}

const POINT_STATUS: Record<PointStatus, { label: string; tone: string }> = {
  PLANNED: { label: 'Waiting for notice', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  NOTIFIED: { label: 'Notice given', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  RELEASED: { label: 'Released', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  PROCEEDED: { label: 'Went ahead unwitnessed', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
};
const KIND_LABEL: Record<PointKind, string> = { HOLD: 'Hold point', WITNESS: 'Witness point' };
const OUTCOME_TONE: Record<Outcome, string> = {
  PASS: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  FAIL: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};
const RULE_LABEL: Record<Rule, string> = { MIN: 'At least', MAX: 'At most', RANGE: 'Between', PASS_FAIL: 'Pass or fail' };
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';

/** "≥ 30 MPa", "75–125 mm" or "Pass / fail". */
export function acceptance(c: Pick<Criterion, 'rule' | 'minValue' | 'maxValue' | 'unit'>) {
  const u = c.unit ? ` ${c.unit}` : '';
  if (c.rule === 'MIN') return `≥ ${c.minValue}${u}`;
  if (c.rule === 'MAX') return `≤ ${c.maxValue}${u}`;
  if (c.rule === 'RANGE') return `${c.minValue}–${c.maxValue}${u}`;
  return 'Pass / fail';
}

function useAct<T>(onChanged: (x: T) => void) {
  const { authedFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = useCallback(
    async (path: string, body: object = {}) => {
      setError(null);
      setBusy(true);
      try {
        onChanged(await authedFetch<T>(path, { method: 'POST', body }));
        return true;
      } catch (e) {
        setError(err(e, 'Action failed.'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, onChanged],
  );
  return { act, busy, error };
}

// ---- Hold and witness points ---------------------------------------------------

function PointDetail({ projectId, p, onBack, onChanged, onRecordTest }: { projectId: string; p: HoldPoint; onBack: () => void; onChanged: (x: HoldPoint) => void; onRecordTest: (p: HoldPoint) => void }) {
  const { act, busy, error } = useAct<HoldPoint>(onChanged);
  const [readyAt, setReadyAt] = useState('');
  const [comment, setComment] = useState('');
  const base = `/projects/${projectId}/quality/hold-points/${p.id}`;
  const done = (ok: boolean) => ok && setComment('');
  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> All points
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {p.number} · {p.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {KIND_LABEL[p.kind]}
            {p.location && ` · ${p.location}`}
            {p.contractor && ` · ${p.contractor.name}`}
            {p.scheduleActivity && ` · activity "${p.scheduleActivity.name}"`}
            {` · ${p.noticeHours} hours' notice`}
            {p.releaser && ` · released by ${p.releaser.user?.fullName ?? p.releaser.externalName}`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${POINT_STATUS[p.status].tone}`}>{POINT_STATUS[p.status].label}</span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      {p.description && <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{p.description}</p>}
      {p.kind === 'HOLD' && p.scheduleActivity && (p.status === 'PLANNED' || p.status === 'NOTIFIED') && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">The programme activity can&apos;t progress until this hold point is released.</p>
      )}
      {p.readyAt && p.status === 'NOTIFIED' && <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">Ready for {p.kind === 'HOLD' ? 'inspection' : 'witnessing'}: {fmtDayTime(p.readyAt)}</p>}
      {p.criterion && (
        <div className="mt-3 text-sm">
          <p className="text-slate-700 dark:text-slate-200">
            Needs a passing <span className="font-medium">{p.criterion.code}</span> test ({p.criterion.name}) before release.
          </p>
          {p.tests.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-2 text-xs">
              {p.tests.map((t) => (
                <li key={t.id} className={`rounded-full px-2 py-0.5 font-medium ${OUTCOME_TONE[t.outcome]}`}>
                  {t.number} {t.outcome === 'PASS' ? 'passed' : 'failed'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {p.releaseComment && <p className="mt-2 text-xs text-slate-500">Release note: {p.releaseComment}</p>}
      {p.cancelReason && <p className="mt-2 text-xs text-slate-500">Cancelled: {p.cancelReason}</p>}

      {p.can.notify && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            act(`${base}/notify`, { readyAt: new Date(readyAt).toISOString(), comment: comment || undefined }).then(done);
          }}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
        >
          <label className={labelCls}>
            Ready for {p.kind === 'HOLD' ? 'inspection' : 'witnessing'} at
            <input type="datetime-local" className={`${inputCls} mt-0.5 w-56`} value={readyAt} onChange={(e) => setReadyAt(e.target.value)} />
          </label>
          <label className={`${labelCls} min-w-48 flex-1`}>
            Note (optional)
            <input className={`${inputCls} mt-0.5`} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || !readyAt} className={primaryBtn}>
            Give notice
          </button>
          <p className="w-full text-xs text-slate-500">At least {p.noticeHours} hours ahead.</p>
        </form>
      )}

      {(p.can.release || p.can.notReady || p.can.proceed || p.can.cancel || p.can.recordTest) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          {(p.can.release || p.can.notReady || p.can.proceed || p.can.cancel) && (
            <label className={labelCls}>
              {p.can.notReady || p.can.cancel ? 'Comment (needed to turn it back or cancel)' : 'Comment (optional)'}
              <input className={`${inputCls} mt-0.5 w-full`} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {p.can.recordTest && (
              <button type="button" onClick={() => onRecordTest(p)} className={secondaryBtn}>
                <FlaskConical size={14} /> Record a test
              </button>
            )}
            {p.can.release && (
              <button type="button" disabled={busy} onClick={() => act(`${base}/release`, { comment: comment || undefined }).then(done)} className={primaryBtn}>
                {p.kind === 'HOLD' ? 'Release the hold point' : 'Witnessed, release it'}
              </button>
            )}
            {p.can.notReady && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => act(`${base}/not-ready`, { reason: comment }).then(done)} className={secondaryBtn}>
                Not ready
              </button>
            )}
            {p.can.proceed && (
              <button type="button" disabled={busy} onClick={() => act(`${base}/proceed`, { comment: comment || undefined }).then(done)} className={secondaryBtn}>
                Not witnessed, go ahead
              </button>
            )}
            {p.can.cancel && (
              <button type="button" disabled={busy || !comment.trim()} onClick={() => confirm(`Cancel ${p.number}?`) && act(`${base}/cancel`, { reason: comment }).then(done)} className={secondaryBtn}>
                Cancel the point
              </button>
            )}
          </div>
          {p.needsPassingTest && (p.status === 'PLANNED' || p.status === 'NOTIFIED') && <p className="text-xs text-amber-700 dark:text-amber-400">It can be released once a passing {p.criterion?.code} test is recorded against it.</p>}
        </div>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {p.history.map((h, i) => (
          <li key={i}>
            {fmtDayTime(h.at)} · {POINT_STATUS[h.status]?.label ?? h.status}
            {h.comment && ` — ${h.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="HOLD_POINT" entityId={p.id} />
      </div>
    </div>
  );
}

function PointsSection({ projectId, opts, criteria, onRecordTest }: { projectId: string; opts: Options; criteria: Criterion[]; onRecordTest: (p: HoldPoint) => void }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [rows, setRows] = useState<HoldPoint[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('point'));
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const blank = { kind: 'HOLD' as PointKind, title: '', description: '', location: '', scheduleActivityId: '', criterionId: '', contractorId: '', releaserId: '', noticeHours: '24' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<HoldPoint[]>(`/projects/${projectId}/quality/hold-points`)
      .then(setRows)
      .catch((e) => setError(err(e, 'Failed to load the hold points.')));
  }, [authedFetch, projectId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const p = await authedFetch<HoldPoint>(`/projects/${projectId}/quality/hold-points`, {
        method: 'POST',
        body: {
          kind: form.kind,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          location: form.location.trim() || undefined,
          scheduleActivityId: form.scheduleActivityId || undefined,
          criterionId: form.criterionId || undefined,
          contractorId: form.contractorId || undefined,
          releaserId: form.releaserId || undefined,
          noticeHours: Number(form.noticeHours) || 0,
        },
      });
      setRows((r) => [p, ...(r ?? [])]);
      setAdding(false);
      setForm(blank);
    } catch (e2) {
      setError(err(e2, 'Could not add the point.'));
    }
  }

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  if (selected) return <PointDetail projectId={projectId} p={selected} onBack={() => setSelectedId(null)} onChanged={(x) => setRows((r) => (r ?? []).map((y) => (y.id === x.id ? x : y)))} onRecordTest={onRecordTest} />;
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === 'PLANNED' || r.status === 'NOTIFIED');

  return (
    <div className="space-y-3">
      {error && <p className={errBox}>{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-xs text-slate-500">
          {opts.can.define
            ? 'The stops in the inspection and test plan. The contractor gives notice when the work is ready; a hold point must be released before work goes on, and a witness point lets them go ahead if nobody comes.'
            : 'Give notice when the work is ready. Work stops at a hold point until it is released; at a witness point you may go ahead if nobody comes by the time you gave.'}
        </p>
        <div className="flex gap-2">
          <Select aria-label="Show points" className={`${selectCls} h-9 w-32`} value={filter} onChange={(v) => setFilter(v as 'open' | 'all')} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
          {opts.can.define && !adding && (
            <button type="button" onClick={() => setAdding(true)} className={secondaryBtn}>
              <Plus size={14} /> Add a point
            </button>
          )}
        </div>
      </div>

      {adding && (
        <form onSubmit={add} className={`${cardCls} grid grid-cols-1 gap-3 p-3 sm:grid-cols-4`}>
          <div className={labelCls}>
            Kind
            <Select aria-label="Kind" className={`${selectCls} mt-0.5 w-full`} value={form.kind} onChange={(v) => setForm({ ...form, kind: v as PointKind })} options={[{ value: 'HOLD', label: 'Hold point' }, { value: 'WITNESS', label: 'Witness point' }]} />
          </div>
          <label className={`${labelCls} sm:col-span-3`}>
            What is inspected or witnessed
            <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Reinforcement before casting, ground floor slab" />
          </label>
          <label className={`${labelCls} sm:col-span-4`}>
            Details (optional)
            <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className={labelCls}>
            Where
            <input className={`${inputCls} mt-0.5`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <div className={labelCls}>
            Contractor
            <Select aria-label="Contractor" className={`${selectCls} mt-0.5 w-full`} value={form.contractorId} onChange={(v) => setForm({ ...form, contractorId: v })} options={[{ value: '', label: 'Any' }, ...opts.contractors.map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
          <div className={labelCls}>
            Released by
            <Select aria-label="Released by" className={`${selectCls} mt-0.5 w-full`} value={form.releaserId} onChange={(v) => setForm({ ...form, releaserId: v })} options={[{ value: '', label: 'Setjeka or any engineer' }, ...opts.releasers.map((m) => ({ value: m.id, label: m.name }))]} />
          </div>
          <label className={labelCls}>
            Notice (hours)
            <input type="number" min={0} max={720} className={`${inputCls} mt-0.5`} value={form.noticeHours} onChange={(e) => setForm({ ...form, noticeHours: e.target.value })} />
          </label>
          <div className={`${labelCls} sm:col-span-2`}>
            Programme activity it holds
            <Select aria-label="Programme activity" className={`${selectCls} mt-0.5 w-full`} value={form.scheduleActivityId} onChange={(v) => setForm({ ...form, scheduleActivityId: v })} options={[{ value: '', label: 'None' }, ...opts.activities.map((a) => ({ value: a.id, label: a.name }))]} />
          </div>
          <div className={`${labelCls} sm:col-span-2`}>
            Test needed before release
            <Select aria-label="Test needed" className={`${selectCls} mt-0.5 w-full`} value={form.criterionId} onChange={(v) => setForm({ ...form, criterionId: v })} options={[{ value: '', label: 'None' }, ...criteria.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))]} />
          </div>
          <div className="flex gap-2 sm:col-span-4">
            <button type="submit" disabled={!form.title.trim()} className={primaryBtn}>
              Add the point
            </button>
            <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>{filter === 'open' ? 'No open hold or witness points.' : 'No hold or witness points on this project.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setSelectedId(p.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <span className="font-mono text-xs text-slate-500">{p.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{p.title}</span>
                  <span className="block text-xs text-slate-500">
                    {KIND_LABEL[p.kind]}
                    {p.contractor && ` · ${p.contractor.name}`}
                    {p.readyAt && p.status === 'NOTIFIED' && ` · ready ${fmtDayTime(p.readyAt)}`}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${POINT_STATUS[p.status].tone}`}>{POINT_STATUS[p.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Test results ---------------------------------------------------------------

function TestDetail({ projectId, t, onBack, onChanged, onRetest }: { projectId: string; t: TestResult; onBack: () => void; onChanged: (x: TestResult) => void; onRetest: (t: TestResult) => void }) {
  const { act, busy, error } = useAct<TestResult>(onChanged);
  const [comment, setComment] = useState('');
  const c = t.criterion;
  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> All results
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t.number} · {c.name}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {t.title}
            {t.location && ` · ${t.location}`}
            {t.contractor && ` · ${t.contractor.name}`} · tested {fmtDay(t.testedAt)} · recorded by {t.recordedBy.fullName}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${OUTCOME_TONE[t.outcome]}`}>{t.outcome === 'PASS' ? 'Pass' : 'Fail'}</span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-800/40">
        <div>
          <dt className="text-xs font-medium text-slate-500">Result</dt>
          <dd className="tabular-nums text-slate-900 dark:text-slate-100">{t.value != null ? `${t.value}${c.unit ? ` ${c.unit}` : ''}` : t.outcome === 'PASS' ? 'Passed' : 'Failed'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Required</dt>
          <dd className="text-slate-900 dark:text-slate-100">{acceptance(c)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Sample</dt>
          <dd className="text-slate-900 dark:text-slate-100">
            {t.sampleRef ?? '—'}
            {t.sampledAt && <span className="block text-xs text-slate-500">taken {fmtDay(t.sampledAt)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Laboratory</dt>
          <dd className="text-slate-900 dark:text-slate-100">{t.laboratory ?? '—'}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        {t.holdPoint && `For ${t.holdPoint.number} ${t.holdPoint.title}. `}
        {t.scheduleActivity && `Activity "${t.scheduleActivity.name}". `}
        {t.retestOf && `Retest of ${t.retestOf.number}. `}
        {t.retests.length > 0 && `Retested as ${t.retests.map((r) => `${r.number} (${r.outcome === 'PASS' ? 'pass' : 'fail'})`).join(', ')}. `}
      </p>
      {t.remarks && <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{t.remarks}</p>}
      {t.status === 'REVIEWED' ? (
        <p className="mt-3 text-xs text-slate-500">
          Reviewed by {t.reviewedBy?.fullName} on {fmtDay(t.reviewedAt)}
          {t.reviewComment && ` — ${t.reviewComment}`}
        </p>
      ) : (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Waiting for review.</p>
      )}
      {t.ncrs.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          NCR{' '}
          {t.ncrs.map((n) => (
            <Link key={n.id} href={`/projects/${projectId}?tab=ncrs&ncr=${n.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              {n.number}
            </Link>
          ))}
        </p>
      )}

      {(t.can.review || t.can.raiseNcr || t.can.retest) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          {t.can.review && (
            <label className={labelCls}>
              Review comment (optional)
              <input className={`${inputCls} mt-0.5 w-full`} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {t.can.review && (
              <button type="button" disabled={busy} onClick={() => act(`/projects/${projectId}/quality/tests/${t.id}/review`, { comment: comment || undefined })} className={primaryBtn}>
                Mark reviewed
              </button>
            )}
            {t.can.raiseNcr && (
              <Link href={`/projects/${projectId}?tab=ncrs&fromTest=${t.id}`} className={secondaryBtn}>
                Raise an NCR
              </Link>
            )}
            {t.can.retest && (
              <button type="button" onClick={() => onRetest(t)} className={secondaryBtn}>
                <FlaskConical size={14} /> Record a retest
              </button>
            )}
          </div>
        </div>
      )}
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="TEST_RESULT" entityId={t.id} />
      </div>
    </div>
  );
}

export interface TestDraft {
  criterionId: string;
  title: string;
  location: string;
  contractorId: string;
  scheduleActivityId: string;
  holdPointId: string;
  retestOfId: string;
  label?: string;
}

function TestsSection({ projectId, opts, criteria, draft }: { projectId: string; opts: Options; criteria: Criterion[]; draft: TestDraft | null }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [rows, setRows] = useState<TestResult[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(draft ? null : params.get('test'));
  const blank = { criterionId: '', title: '', location: '', contractorId: '', scheduleActivityId: '', holdPointId: '', retestOfId: '', sampleRef: '', laboratory: '', sampledAt: '', testedAt: todayIso(), value: '', outcome: '' as '' | Outcome, remarks: '' };
  // Opened from a hold point: start from what it asks for.
  const [form, setForm] = useState(() => (draft ? { ...blank, ...draft } : blank));
  const [recording, setRecording] = useState(Boolean(draft));
  const [label, setLabel] = useState<string | null>(draft?.label ?? null);
  const [filter, setFilter] = useState<'all' | 'fail' | 'review'>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<TestResult[]>(`/projects/${projectId}/quality/tests`)
      .then(setRows)
      .catch((e) => setError(err(e, 'Failed to load the test results.')));
  }, [authedFetch, projectId]);

  const crit = criteria.find((c) => c.id === form.criterionId);

  async function record(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const t = await authedFetch<TestResult>(`/projects/${projectId}/quality/tests`, {
        method: 'POST',
        body: {
          criterionId: form.criterionId,
          title: form.title.trim(),
          location: form.location.trim() || undefined,
          contractorId: form.contractorId || undefined,
          scheduleActivityId: form.scheduleActivityId || undefined,
          holdPointId: form.holdPointId || undefined,
          retestOfId: form.retestOfId || undefined,
          sampleRef: form.sampleRef.trim() || undefined,
          laboratory: form.laboratory.trim() || undefined,
          sampledAt: form.sampledAt || undefined,
          testedAt: form.testedAt,
          value: form.value === '' ? undefined : Number(form.value),
          outcome: form.outcome || undefined,
          remarks: form.remarks.trim() || undefined,
        },
      });
      setRows((r) => [t, ...(r ?? []).map((x) => (x.id === t.retestOf?.id ? { ...x, retests: [...x.retests, { id: t.id, number: t.number, outcome: t.outcome }], can: { ...x.can, retest: false } } : x))]);
      setRecording(false);
      setForm(blank);
      setLabel(null);
      setSelectedId(t.id);
    } catch (e2) {
      setError(err(e2, 'Could not record the result.'));
    }
  }

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  if (selected)
    return (
      <TestDetail
        projectId={projectId}
        t={selected}
        onBack={() => setSelectedId(null)}
        onChanged={(x) => setRows((r) => (r ?? []).map((y) => (y.id === x.id ? x : y)))}
        onRetest={(t) => {
          setForm({ ...blank, criterionId: t.criterion.id, title: t.title, location: t.location ?? '', contractorId: t.contractor?.id ?? '', scheduleActivityId: t.scheduleActivity?.id ?? '', holdPointId: t.holdPoint?.id ?? '', retestOfId: t.id });
          setLabel(`Retest of ${t.number}`);
          setRecording(true);
          setSelectedId(null);
        }}
      />
    );

  const shown = (rows ?? []).filter((t) => filter === 'all' || (filter === 'fail' ? t.outcome === 'FAIL' : t.status === 'RECORDED'));
  const fails = (rows ?? []).filter((t) => t.outcome === 'FAIL').length;
  const active = criteria.filter((c) => c.active);

  return (
    <div className="space-y-3">
      {error && <p className={errBox}>{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-xs text-slate-500">
          Each result is checked against its acceptance criterion and passes or fails on entry. {opts.can.review ? 'Review each one; raise an NCR on a failure.' : 'The engineer or QA/QC reviews each one.'}
          {rows && rows.length > 0 && ` ${rows.length} recorded, ${fails} failed.`}
        </p>
        <div className="flex gap-2">
          <Select
            aria-label="Show results"
            className={`${selectCls} h-9 w-40`}
            value={filter}
            onChange={(v) => setFilter(v as 'all' | 'fail' | 'review')}
            options={[
              { value: 'all', label: 'All results' },
              { value: 'fail', label: 'Failures' },
              { value: 'review', label: 'To review' },
            ]}
          />
          {opts.can.record && !recording && (
            <button type="button" onClick={() => setRecording(true)} disabled={!active.length} className={secondaryBtn} title={active.length ? undefined : 'Add acceptance criteria first'}>
              <Plus size={14} /> Record a result
            </button>
          )}
        </div>
      </div>

      {recording && (
        <form onSubmit={record} className={`${cardCls} grid grid-cols-1 gap-3 p-3 sm:grid-cols-4`}>
          {label && <p className="text-sm font-medium text-slate-800 sm:col-span-4 dark:text-slate-100">{label}</p>}
          <div className={`${labelCls} sm:col-span-2`}>
            Test
            <Select aria-label="Test" className={`${selectCls} mt-0.5 w-full`} value={form.criterionId} onChange={(v) => setForm({ ...form, criterionId: v, outcome: '' })} options={[{ value: '', label: 'Choose…' }, ...active.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))]} />
            {crit && <span className="mt-0.5 block text-[11px] text-slate-400">Required: {acceptance(crit)}</span>}
          </div>
          <label className={`${labelCls} sm:col-span-2`}>
            What was tested
            <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Ground floor slab, bay C" />
          </label>
          {crit && crit.rule !== 'PASS_FAIL' ? (
            <label className={labelCls}>
              Result{crit.unit ? ` (${crit.unit})` : ''}
              <input type="number" step="any" inputMode="decimal" className={`${inputCls} mt-0.5`} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </label>
          ) : (
            <div className={labelCls}>
              Result
              <Select aria-label="Result" className={`${selectCls} mt-0.5 w-full`} value={form.outcome} onChange={(v) => setForm({ ...form, outcome: v as Outcome })} options={[{ value: '', label: 'Choose…' }, { value: 'PASS', label: 'Passed' }, { value: 'FAIL', label: 'Failed' }]} />
            </div>
          )}
          <label className={labelCls}>
            Tested on
            <DateInput className={`${inputCls} mt-0.5`} value={form.testedAt} onChange={(e) => setForm({ ...form, testedAt: e.target.value })} />
          </label>
          <label className={labelCls}>
            Sample taken on
            <DateInput className={`${inputCls} mt-0.5`} value={form.sampledAt} onChange={(e) => setForm({ ...form, sampledAt: e.target.value })} />
          </label>
          <label className={labelCls}>
            Sample / cube ref
            <input className={`${inputCls} mt-0.5`} value={form.sampleRef} onChange={(e) => setForm({ ...form, sampleRef: e.target.value })} />
          </label>
          <label className={labelCls}>
            Laboratory
            <input className={`${inputCls} mt-0.5`} value={form.laboratory} onChange={(e) => setForm({ ...form, laboratory: e.target.value })} />
          </label>
          <label className={labelCls}>
            Where
            <input className={`${inputCls} mt-0.5`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          {/* A contractor's own results are theirs; they pick only if they hold more than one firm. */}
          {(opts.can.define ? opts.contractors.length > 0 : opts.contractors.length > 1) && (
            <div className={labelCls}>
              Contractor
              <Select aria-label="Contractor" className={`${selectCls} mt-0.5 w-full`} value={form.contractorId} onChange={(v) => setForm({ ...form, contractorId: v })} options={[{ value: '', label: 'None' }, ...opts.contractors.map((c) => ({ value: c.id, label: c.name }))]} />
            </div>
          )}
          <div className={labelCls}>
            Programme activity
            <Select aria-label="Activity" className={`${selectCls} mt-0.5 w-full`} value={form.scheduleActivityId} onChange={(v) => setForm({ ...form, scheduleActivityId: v })} options={[{ value: '', label: 'None' }, ...opts.activities.map((a) => ({ value: a.id, label: a.name }))]} />
          </div>
          <label className={`${labelCls} sm:col-span-4`}>
            Remarks (optional)
            <textarea className={`${textareaCls} mt-0.5`} rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <button type="submit" disabled={!form.criterionId || !form.title.trim() || !form.testedAt || (crit?.rule === 'PASS_FAIL' ? !form.outcome : form.value === '')} className={primaryBtn}>
              Record the result
            </button>
            <button
              type="button"
              onClick={() => {
                setRecording(false);
                setForm(blank);
                setLabel(null);
              }}
              className={secondaryBtn}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>{rows.length ? 'Nothing to show with this filter.' : 'No test results recorded yet.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setSelectedId(t.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <span className="font-mono text-xs text-slate-500">{t.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                    {t.criterion.code} · {t.title}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {t.value != null && `${t.value}${t.criterion.unit ? ` ${t.criterion.unit}` : ''} against ${acceptance(t.criterion)} · `}
                    {fmtDay(t.testedAt)}
                    {t.status === 'RECORDED' ? ' · to review' : ' · reviewed'}
                    {t.retests.length > 0 && ' · retested'}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OUTCOME_TONE[t.outcome]}`}>{t.outcome === 'PASS' ? 'Pass' : 'Fail'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Acceptance criteria ------------------------------------------------------

function CriteriaSection({ projectId, opts, criteria, setCriteria }: { projectId: string; opts: Options; criteria: Criterion[]; setCriteria: (c: Criterion[]) => void }) {
  const { authedFetch } = useAuth();
  const blank = { code: '', name: '', standardRef: '', unit: '', rule: 'MIN' as Rule, minValue: '', maxValue: '', frequency: '' };
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => (s === '' ? undefined : Number(s));

  async function run(fn: () => Promise<void>, fail: string) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(err(e, fail));
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className={errBox}>{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-xs text-slate-500">What each test must achieve on this project, from the specification. Results are judged against these.</p>
        {opts.can.define && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryBtn} onClick={() => run(async () => setCriteria(await authedFetch<Criterion[]>(`/projects/${projectId}/quality/criteria/starter`, { method: 'POST' })), 'Could not add the usual tests.')}>
              Add the usual SA tests
            </button>
            {!adding && (
              <button type="button" onClick={() => setAdding(true)} className={secondaryBtn}>
                <Plus size={14} /> Add a criterion
              </button>
            )}
          </div>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const c = await authedFetch<Criterion>(`/projects/${projectId}/quality/criteria`, {
                method: 'POST',
                body: { code: form.code.trim(), name: form.name.trim(), standardRef: form.standardRef.trim() || undefined, unit: form.unit.trim() || undefined, rule: form.rule, minValue: num(form.minValue), maxValue: num(form.maxValue), frequency: form.frequency.trim() || undefined },
              });
              setCriteria([...criteria, c].sort((a, b) => a.code.localeCompare(b.code)));
              setForm(blank);
              setAdding(false);
            }, 'Could not add the criterion.');
          }}
          className={`${cardCls} grid grid-cols-2 gap-3 p-3 sm:grid-cols-6`}
        >
          <label className={labelCls}>
            Code
            <input className={`${inputCls} mt-0.5`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CUBE-28" />
          </label>
          <label className={`${labelCls} col-span-1 sm:col-span-3`}>
            Test
            <input className={`${inputCls} mt-0.5`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className={labelCls}>
            Standard
            <input className={`${inputCls} mt-0.5`} value={form.standardRef} onChange={(e) => setForm({ ...form, standardRef: e.target.value })} />
          </label>
          <label className={labelCls}>
            Unit
            <input className={`${inputCls} mt-0.5`} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </label>
          <div className={labelCls}>
            Must be
            <Select aria-label="Must be" className={`${selectCls} mt-0.5 w-full`} value={form.rule} onChange={(v) => setForm({ ...form, rule: v as Rule })} options={(Object.keys(RULE_LABEL) as Rule[]).map((r) => ({ value: r, label: RULE_LABEL[r] }))} />
          </div>
          {(form.rule === 'MIN' || form.rule === 'RANGE') && (
            <label className={labelCls}>
              Minimum
              <input type="number" step="any" className={`${inputCls} mt-0.5`} value={form.minValue} onChange={(e) => setForm({ ...form, minValue: e.target.value })} />
            </label>
          )}
          {(form.rule === 'MAX' || form.rule === 'RANGE') && (
            <label className={labelCls}>
              Maximum
              <input type="number" step="any" className={`${inputCls} mt-0.5`} value={form.maxValue} onChange={(e) => setForm({ ...form, maxValue: e.target.value })} />
            </label>
          )}
          <label className={`${labelCls} col-span-2 sm:col-span-3`}>
            How often
            <input className={`${inputCls} mt-0.5`} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
          </label>
          <div className="col-span-2 flex gap-2 sm:col-span-6">
            <button type="submit" disabled={!form.code.trim() || !form.name.trim()} className={primaryBtn}>
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {criteria.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>No acceptance criteria yet.{opts.can.define && ' Start from the usual SA tests and edit them to the specification.'}</p>
      ) : (
        <div className={`${cardCls} overflow-hidden`}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="px-3 py-2 font-medium">Test</th>
                <th className="px-3 py-2 font-medium">Required</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">How often</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Results</th>
                {opts.can.define && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {criteria.map((c) => (
                <tr key={c.id} className={c.active ? '' : 'opacity-50'}>
                  <td className="px-3 py-2">
                    <span className="block font-medium text-slate-800 dark:text-slate-100">
                      {c.code} · {c.name}
                    </span>
                    {c.standardRef && <span className="block text-xs text-slate-500">{c.standardRef}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{acceptance(c)}</td>
                  <td className="hidden px-3 py-2 text-xs text-slate-500 md:table-cell">{c.frequency ?? '—'}</td>
                  <td className="hidden px-3 py-2 tabular-nums sm:table-cell">{c._count?.results ?? 0}</td>
                  {opts.can.define && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        onClick={() =>
                          run(async () => {
                            const u = await authedFetch<Criterion>(`/projects/${projectId}/quality/criteria/${c.id}`, { method: 'PATCH', body: { active: !c.active } });
                            setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, ...u } : x)));
                          }, 'Could not change the criterion.')
                        }
                      >
                        {c.active ? 'Retire' : 'Use again'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Test results against acceptance criteria, and hold and witness points
 * (the user's choice, 2026-11-03). */
export function TestsPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [opts, setOpts] = useState<Options | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [section, setSection] = useState(params.get('test') ? 'tests' : params.get('point') ? 'points' : 'points');
  const [draft, setDraft] = useState<TestDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([authedFetch<Options>(`/projects/${projectId}/quality/options`), authedFetch<Criterion[]>(`/projects/${projectId}/quality/criteria`)])
      .then(([o, c]) => {
        setOpts(o);
        setCriteria(c);
      })
      .catch((e) => setError(err(e, 'Failed to load tests and hold points.')));
  }, [authedFetch, projectId]);

  if (error) return <p className={errBox}>{error}</p>;
  if (!opts) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <FlaskConical size={16} className="text-emerald-700 dark:text-emerald-400" /> Tests &amp; hold points
        </h2>
        <div className="mt-3">
          <Tabs
            tabs={[
              { value: 'points', label: 'Hold & witness points' },
              { value: 'tests', label: 'Test results' },
              { value: 'criteria', label: 'Acceptance criteria', count: criteria.filter((c) => c.active).length },
            ]}
            value={section}
            onChange={(s) => {
              setSection(s);
              setDraft(null);
            }}
          />
        </div>
      </div>
      {section === 'points' && (
        <PointsSection
          projectId={projectId}
          opts={opts}
          criteria={criteria}
          onRecordTest={(p) => {
            setDraft({ criterionId: p.criterion?.id ?? '', title: p.title, location: p.location ?? '', contractorId: p.contractor?.id ?? '', scheduleActivityId: p.scheduleActivity?.id ?? '', holdPointId: p.id, retestOfId: '', label: `Test for ${p.number} ${p.title}` });
            setSection('tests');
          }}
        />
      )}
      {section === 'tests' && <TestsSection projectId={projectId} opts={opts} criteria={criteria} draft={draft} />}
      {section === 'criteria' && <CriteriaSection projectId={projectId} opts={opts} criteria={criteria} setCriteria={setCriteria} />}
    </div>
  );
}
