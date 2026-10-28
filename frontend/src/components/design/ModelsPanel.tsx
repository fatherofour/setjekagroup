'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Crosshair, Eye, EyeOff, FileUp, Focus, Link2, Loader2, MousePointer2, Palette, Ruler, Trash2, X } from 'lucide-react';
import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IfcAPI } from 'web-ifc';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardCls, fmtDay, inputCls, labelCls, memberName, primaryBtn, secondaryBtn, selectCls, type Member } from '@/lib/architect';

interface ModelDoc {
  id: string;
  name: string;
  discipline: string | null;
  clientVisible: boolean;
  revisions: { id: string; revisionNumber: string; originalFilename: string; fileSize: number; uploadedAt: string; uploadedBy: { fullName: string } }[];
  linkCount: number;
}
interface Link {
  id: string;
  documentId: string;
  globalId: string;
  expressId: number | null;
  ifcType: string | null;
  name: string | null;
  entityType: 'ISSUE' | 'RFI' | 'SUBMITTAL' | 'DOCUMENT' | 'SITE_PHOTO' | 'INSPECTION';
  entityId: string;
  viewpoint: { position: number[]; target: number[] } | null;
  createdBy: { fullName: string };
  createdAt: string;
  record: { label: string; status: string | null; owner?: string | null };
}
interface Picked {
  docId: string;
  expressID: number;
  globalId: string;
  ifcType: string;
  name: string | null;
  props: { set: string; rows: [string, string][] }[];
}

const ENTITY_LABEL: Record<Link['entityType'], string> = {
  ISSUE: 'Issue',
  RFI: 'RFI',
  SUBMITTAL: 'Submittal',
  DOCUMENT: 'Drawing / document',
  SITE_PHOTO: 'Photo',
  INSPECTION: 'Inspection',
};
const err = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** Models (register BIM rows 55-61): IFC models drawn in the browser, on
 * their own or together; select an object to see its properties, raise an
 * issue on it with the view it was seen from, or link it to a drawing, RFI,
 * submittal or inspection; measure between two points. */
export function ModelsPanel({ projectId }: { projectId: string }) {
  const { authedFetch, user } = useAuth();
  const isClient = user?.accountType === 'EXTERNAL' && Boolean(user?.clientId);
  const [models, setModels] = useState<ModelDoc[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [open, setOpen] = useState<{ id: string; revisionId: string; name: string }[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    authedFetch<ModelDoc[]>(`/projects/${projectId}/models`)
      .then(setModels)
      .catch((e) => setError(err(e, 'Could not load the models')));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', f);
      try {
        await authedFetch(`/projects/${projectId}/models`, { method: 'POST', formData: fd });
      } catch (e) {
        setError(err(e, `${f.name} did not upload`));
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
    load();
  }

  function view(ids: string[]) {
    const docs = (models ?? []).filter((m) => ids.includes(m.id) && m.revisions[0]);
    if (docs.length) setOpen(docs.map((m) => ({ id: m.id, revisionId: m.revisions[0].id, name: `${m.name} rev ${m.revisions[0].revisionNumber}` })));
  }

  if (open) return <ModelViewer projectId={projectId} models={open} readOnly={isClient} onClose={() => setOpen(null)} />;

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Box size={15} /> Models
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Open the IFC models in the browser, on their own or together. Select an object to see its properties, raise an issue on it with the view it was seen from, or link it
              to a drawing, RFI, submittal or inspection.
            </p>
          </div>
          {!isClient && (
            <>
              <button type="button" className={primaryBtn} disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Upload IFC
              </button>
              <input ref={fileRef} type="file" accept=".ifc" multiple className="hidden" onChange={(e) => upload(e.target.files)} aria-label="Choose IFC models" />
            </>
          )}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      </section>

      <section className={cardCls} aria-label="Model list">
        {models === null ? (
          <p className="p-4 text-sm text-slate-400">Loading…</p>
        ) : models.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            {isClient ? 'Setjeka has not shared a model with you yet.' : 'No models yet. Export the model from Revit, ArchiCAD or similar as IFC and upload it.'}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {models.map((m) => {
                const r = m.revisions[0];
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-600"
                      aria-label={`Include ${m.name}`}
                      checked={chosen.includes(m.id)}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, m.id] : c.filter((x) => x !== m.id)))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{m.name}</span>
                      <span className="block text-xs text-slate-500">
                        {[
                          m.discipline,
                          r && `rev ${r.revisionNumber}`,
                          r && mb(r.fileSize),
                          r && `${r.uploadedBy.fullName}, ${fmtDay(r.uploadedAt)}`,
                          !isClient && `${m.linkCount} links and issues`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <button type="button" className={secondaryBtn} onClick={() => view([m.id])}>
                      <Box size={14} /> Open
                    </button>
                  </li>
                );
              })}
            </ul>
            {models.length > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
                <span className="text-xs text-slate-500">Tick several to see them together, e.g. architectural with structural.</span>
                <button type="button" className={primaryBtn} disabled={chosen.length < 2} onClick={() => view(chosen)}>
                  Open {chosen.length || ''} together
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

type Mode = 'select' | 'measure';

/** Elements to pick out when the viewer opens - a clash pair, say: they are
 * coloured, everything else is ghosted, and the camera frames them. */
export interface ViewerFocus {
  label: string;
  items: { documentId: string; globalId: string; colour: string; label?: string }[];
}
interface SmartViewLite {
  id: string;
  name: string;
}
interface AppliedView {
  name: string;
  rules: { label: string; action: 'colour' | 'transparent' | 'hide' | 'isolate'; colour: string | null; count: number; elements: Record<string, number[]> }[];
}

export function ModelViewer({
  projectId,
  models,
  readOnly,
  focus,
  initialView,
  onClose,
}: {
  projectId: string;
  models: { id: string; revisionId: string; name: string }[];
  readOnly: boolean;
  focus?: ViewerFocus;
  /** A smart view to apply as soon as the models are in. */
  initialView?: string;
  onClose: () => void;
}) {
  const { authedFetch, accessToken } = useAuth();
  const hostRef = useRef<HTMLDivElement>(null);
  const ctx = useRef<{
    three: typeof THREE;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    api: IfcAPI;
    modelIds: Map<string, number>;
    meshes: Map<string, THREE.Mesh[]>;
    byGlobal: Map<string, Map<string, number>>;
    highlight: THREE.MeshLambertMaterial;
    ghost: THREE.MeshLambertMaterial;
    measure: THREE.Group;
    radius: number;
    // Site coordinates of the shared display origin: the scene is drawn
    // relative to it, viewpoints are stored without it (BCF wants the
    // model's own coordinates).
    origin: number[];
  } | null>(null);
  const [smartViews, setSmartViews] = useState<SmartViewLite[]>([]);
  const [applied, setApplied] = useState<AppliedView | null>(null);
  const [viewId, setViewId] = useState('');
  const [progress, setProgress] = useState<string>('Starting the viewer…');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [measurePts, setMeasurePts] = useState<number[][]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [issue, setIssue] = useState<{ title: string; ownerId: string; priority: string } | null>(null);
  const [linkForm, setLinkForm] = useState<{ type: Link['entityType']; id: string } | null>(null);
  const [records, setRecords] = useState<Record<string, { value: string; label: string }[]>>({});
  const modeRef = useRef<Mode>('select');
  modeRef.current = mode;
  const selectedKey = useRef<string | null>(null);

  // Escape closes the viewer, unless it's mid-typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement)?.closest('input, textarea, [role="listbox"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (readOnly) return;
    Promise.all(models.map((m) => authedFetch<Link[]>(`/projects/${projectId}/models/${m.id}/links`).catch(() => [] as Link[]))).then((all) => setLinks(all.flat()));
    authedFetch<Member[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
    authedFetch<SmartViewLite[]>(`/projects/${projectId}/bim/smart-views`)
      .then(setSmartViews)
      .catch(() => setSmartViews([]));
  }, [authedFetch, projectId, models, readOnly]);

  // Build the scene and stream every model's meshes into it.
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let resize: ResizeObserver | null = null;
    (async () => {
      try {
        const three = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const WebIFC = await import('web-ifc');
        // Everything async happens before the page is touched, so a run that
        // was discarded meanwhile (React mounts twice in development) leaves
        // no second canvas behind.
        const api = new WebIFC.IfcAPI();
        api.SetWasmPath('/vendor/', true);
        await api.Init(undefined, true);
        if (disposed || !hostRef.current) return;
        const host = hostRef.current;
        const renderer = new three.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(host.clientWidth, host.clientHeight);
        host.appendChild(renderer.domElement);
        const scene = new three.Scene();
        scene.background = new three.Color(document.documentElement.classList.contains('dark') ? 0x0f172a : 0xf1f5f9);
        const camera = new three.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 0.05, 20000);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        scene.add(new three.HemisphereLight(0xffffff, 0x8899aa, 1.4));
        const sun = new three.DirectionalLight(0xffffff, 1.6);
        sun.position.set(50, 120, 80);
        scene.add(sun);
        const measure = new three.Group();
        scene.add(measure);
        const highlight = new three.MeshLambertMaterial({ color: 0x10b981, emissive: 0x065f46, side: three.DoubleSide });
        const ghost = new three.MeshLambertMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.08, depthWrite: false, side: three.DoubleSide });
        const state = {
          three,
          renderer,
          scene,
          camera,
          controls,
          api,
          modelIds: new Map<string, number>(),
          meshes: new Map<string, THREE.Mesh[]>(),
          byGlobal: new Map<string, Map<string, number>>(),
          highlight,
          ghost,
          measure,
          radius: 1,
          origin: [0, 0, 0],
        };
        ctx.current = state;

        const materials = new Map<string, THREE.MeshLambertMaterial>();
        // Models share one origin, taken from the first, kept in double
        // precision so far-off site coordinates don't shake.
        let origin: number[] | null = null;
        for (const m of models) {
          if (disposed) return;
          setProgress(`Downloading ${m.name}…`);
          const url = await apiFetchBlobUrl(`/projects/${projectId}/documents/${m.id}/revisions/${m.revisionId}/file`, accessToken);
          const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
          URL.revokeObjectURL(url);
          setProgress(`Reading ${m.name}…`);
          await new Promise((r) => setTimeout(r, 20));
          if (disposed) return;
          const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
          state.modelIds.set(m.id, modelID);
          const geoms = new Map<number, THREE.BufferGeometry>();
          api.StreamAllMeshes(modelID, (mesh) => {
            const placed = mesh.geometries;
            for (let i = 0; i < placed.size(); i++) {
              const pg = placed.get(i);
              let g = geoms.get(pg.geometryExpressID);
              if (!g) {
                const geom = api.GetGeometry(modelID, pg.geometryExpressID);
                const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
                const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
                geom.delete();
                const pos = new Float32Array(v.length / 2);
                const nor = new Float32Array(v.length / 2);
                for (let k = 0, j = 0; k < v.length; k += 6, j += 3) {
                  pos[j] = v[k];
                  pos[j + 1] = v[k + 1];
                  pos[j + 2] = v[k + 2];
                  nor[j] = v[k + 3];
                  nor[j + 1] = v[k + 4];
                  nor[j + 2] = v[k + 5];
                }
                g = new three.BufferGeometry();
                g.setAttribute('position', new three.BufferAttribute(pos, 3));
                g.setAttribute('normal', new three.BufferAttribute(nor, 3));
                g.setIndex(new three.BufferAttribute(idx, 1));
                geoms.set(pg.geometryExpressID, g);
              }
              const t = [...pg.flatTransformation];
              if (!origin) origin = [t[12], t[13], t[14]];
              t[12] -= origin[0];
              t[13] -= origin[1];
              t[14] -= origin[2];
              const c = pg.color;
              const key = `${c.x.toFixed(3)}:${c.y.toFixed(3)}:${c.z.toFixed(3)}:${c.w.toFixed(3)}`;
              let mat = materials.get(key);
              if (!mat) {
                mat = new three.MeshLambertMaterial({ color: new three.Color(c.x, c.y, c.z), transparent: c.w < 1, opacity: c.w, side: three.DoubleSide, depthWrite: c.w >= 1 });
                materials.set(key, mat);
              }
              const obj = new three.Mesh(g, mat);
              obj.matrixAutoUpdate = false;
              obj.matrix.fromArray(t);
              obj.userData = { docId: m.id, expressID: mesh.expressID, material: mat };
              scene.add(obj);
              const k2 = `${m.id}:${mesh.expressID}`;
              state.meshes.set(k2, [...(state.meshes.get(k2) ?? []), obj]);
            }
          });
        }
        if (disposed) return;
        state.origin = origin ?? [0, 0, 0];
        // Frame everything.
        const box = new three.Box3();
        state.meshes.forEach((list) => list.forEach((o) => box.expandByObject(o)));
        const centre = box.getCenter(new three.Vector3());
        const radius = Math.max(box.getSize(new three.Vector3()).length() / 2, 1);
        camera.position.copy(centre.clone().add(new three.Vector3(radius * 1.2, radius * 0.9, radius * 1.2)));
        controls.target.copy(centre);
        state.radius = radius;
        camera.near = radius / 500;
        camera.far = radius * 50;
        camera.updateProjectionMatrix();
        setReady(true);
        setProgress('');
        const loop = () => {
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(loop);
        };
        loop();
        resize = new ResizeObserver(() => {
          camera.aspect = host.clientWidth / host.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(host.clientWidth, host.clientHeight);
        });
        resize.observe(host);
      } catch (e) {
        setError(e instanceof Error ? `The model could not be opened: ${e.message}` : 'The model could not be opened');
      }
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      const c = ctx.current;
      if (c) {
        c.modelIds.forEach((id) => c.api.CloseModel(id));
        c.renderer.dispose();
        c.renderer.domElement.remove();
      }
      ctx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paint = useCallback((key: string | null) => {
    const c = ctx.current;
    if (!c) return;
    if (selectedKey.current) c.meshes.get(selectedKey.current)?.forEach((o) => (o.material = o.userData.view ?? o.userData.material));
    selectedKey.current = key;
    if (key) c.meshes.get(key)?.forEach((o) => (o.material = c.highlight));
  }, []);

  /** The object's IFC identity and property sets. */
  const describe = useCallback(async (docId: string, expressID: number): Promise<Picked> => {
    const c = ctx.current!;
    const modelID = c.modelIds.get(docId)!;
    const line = c.api.GetLine(modelID, expressID);
    const ifcType = c.api.GetNameFromTypeCode(line.type);
    const props: Picked['props'] = [];
    try {
      const sets = await c.api.properties.getPropertySets(modelID, expressID, true);
      for (const s of sets) {
        const rows: [string, string][] = [];
        for (const p of s.HasProperties ?? []) if (p?.Name?.value) rows.push([p.Name.value, p.NominalValue?.value != null ? String(p.NominalValue.value) : '—']);
        for (const q of s.Quantities ?? []) {
          const v = q?.LengthValue ?? q?.AreaValue ?? q?.VolumeValue ?? q?.CountValue ?? q?.WeightValue;
          if (q?.Name?.value) rows.push([q.Name.value, v?.value != null ? String(Math.round(v.value * 1000) / 1000) : '—']);
        }
        if (rows.length) props.push({ set: s.Name?.value ?? 'Properties', rows: rows.slice(0, 40) });
      }
    } catch {
      // some objects carry no property sets
    }
    return { docId, expressID, globalId: line.GlobalId?.value ?? String(expressID), ifcType, name: line.Name?.value ?? null, props };
  }, []);

  // Click (not drag) to pick or measure.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !ready) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => (start = { x: e.clientX, y: e.clientY });
    const up = async (e: PointerEvent) => {
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
      const c = ctx.current!;
      const rect = c.renderer.domElement.getBoundingClientRect();
      const ray = new c.three.Raycaster();
      ray.setFromCamera(new c.three.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), c.camera);
      const targets: THREE.Object3D[] = [];
      c.meshes.forEach((list) => list.forEach((o) => o.visible && targets.push(o)));
      const hit = ray.intersectObjects(targets, false)[0];
      if (modeRef.current === 'measure') {
        if (!hit) return;
        setMeasurePts((pts) => (pts.length >= 2 ? [hit.point.toArray()] : [...pts, hit.point.toArray()]));
        return;
      }
      if (!hit) {
        paint(null);
        setPicked(null);
        return;
      }
      const { docId, expressID } = hit.object.userData as { docId: string; expressID: number };
      paint(`${docId}:${expressID}`);
      setIssue(null);
      setLinkForm(null);
      setPicked(await describe(docId, expressID));
    };
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointerup', up);
    return () => {
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointerup', up);
    };
  }, [ready, describe, paint]);

  // Draw the measured line.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    c.measure.clear();
    const mat = new c.three.MeshBasicMaterial({ color: 0xdc2626, depthTest: false });
    for (const p of measurePts) {
      const dot = new c.three.Mesh(new c.three.SphereGeometry(Math.max(0.02, c.radius / 250), 12, 12), mat);
      dot.position.fromArray(p);
      dot.renderOrder = 10;
      c.measure.add(dot);
    }
    if (measurePts.length === 2) {
      const line = new c.three.Line(
        new c.three.BufferGeometry().setFromPoints(measurePts.map((p) => new c.three.Vector3().fromArray(p))),
        new c.three.LineBasicMaterial({ color: 0xdc2626, depthTest: false }),
      );
      line.renderOrder = 10;
      c.measure.add(line);
    }
  }, [measurePts]);

  const distance = measurePts.length === 2 ? Math.hypot(measurePts[0][0] - measurePts[1][0], measurePts[0][1] - measurePts[1][1], measurePts[0][2] - measurePts[1][2]) : null;

  function setVisible(key: string, visible: boolean) {
    ctx.current?.meshes.get(key)?.forEach((o) => (o.visible = visible));
  }
  function hide() {
    if (!picked) return;
    const key = `${picked.docId}:${picked.expressID}`;
    setVisible(key, false);
    setHidden((h) => [...h, key]);
    paint(null);
    setPicked(null);
  }
  function isolate() {
    if (!picked) return;
    const keep = `${picked.docId}:${picked.expressID}`;
    const c = ctx.current!;
    const next: string[] = [];
    c.meshes.forEach((_, k) => {
      if (k !== keep) {
        setVisible(k, false);
        next.push(k);
      }
    });
    setHidden(next);
  }
  function showAll() {
    hidden.forEach((k) => setVisible(k, true));
    setHidden([]);
  }

  const world = (v: number[], o: number[]) => v.map((x, i) => Math.round((x + o[i]) * 1000) / 1000);
  const viewpoint = () => {
    const c = ctx.current!;
    return { position: world(c.camera.position.toArray(), c.origin), target: world(c.controls.target.toArray(), c.origin) };
  };

  /** GlobalId -> express id in an open model. */
  const expressFor = useCallback((documentId: string, globalId: string) => {
    const c = ctx.current;
    const modelID = c?.modelIds.get(documentId);
    if (!c || modelID === undefined) return undefined;
    let index = c.byGlobal.get(documentId);
    if (!index) {
      index = new Map();
      for (const k of c.meshes.keys()) {
        const [doc, id] = k.split(':');
        if (doc !== documentId) continue;
        const gid = c.api.GetLine(modelID, Number(id))?.GlobalId?.value;
        if (gid) index.set(gid, Number(id));
      }
      c.byGlobal.set(documentId, index);
    }
    return index.get(globalId);
  }, []);

  /** Back to the model's own colours, everything shown. */
  const resetStyles = useCallback(() => {
    const c = ctx.current;
    if (!c) return;
    c.meshes.forEach((list, k) =>
      list.forEach((o) => {
        o.userData.view = undefined;
        o.visible = true;
        o.material = k === selectedKey.current ? c.highlight : o.userData.material;
      }),
    );
    setHidden([]);
  }, []);

  const frame = useCallback((keys: string[]) => {
    const c = ctx.current;
    if (!c || !keys.length) return;
    const box = new c.three.Box3();
    keys.forEach((k) => c.meshes.get(k)?.forEach((o) => box.expandByObject(o)));
    if (box.isEmpty()) return;
    const centre = box.getCenter(new c.three.Vector3());
    const r = Math.max(box.getSize(new c.three.Vector3()).length(), c.radius / 20);
    const dir = c.camera.position.clone().sub(c.controls.target).normalize();
    c.controls.target.copy(centre);
    c.camera.position.copy(centre.clone().add(dir.multiplyScalar(r * 1.6)));
  }, []);

  // Pick out the focus elements (a clash pair) once the models are in.
  useEffect(() => {
    const c = ctx.current;
    if (!ready || !focus || !c) return;
    const keys: string[] = [];
    const missing: string[] = [];
    const mats = new Map<string, THREE.MeshLambertMaterial>();
    for (const it of focus.items) {
      const id = expressFor(it.documentId, it.globalId);
      if (id === undefined) {
        missing.push(it.label ?? it.globalId);
        continue;
      }
      const key = `${it.documentId}:${id}`;
      keys.push(key);
      let m = mats.get(it.colour);
      if (!m) {
        m = new c.three.MeshLambertMaterial({ color: new c.three.Color(it.colour), side: c.three.DoubleSide });
        mats.set(it.colour, m);
      }
      c.meshes.get(key)?.forEach((o) => {
        o.userData.view = m;
        o.material = m!;
      });
    }
    const keep = new Set(keys);
    c.meshes.forEach((list, k) => {
      if (!keep.has(k))
        list.forEach((o) => {
          o.userData.view = c.ghost;
          o.material = c.ghost;
        });
    });
    frame(keys);
    // Reported after the scene is updated, not as part of it.
    if (missing.length) setTimeout(() => setError(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in the open revision of the model`), 0);
  }, [ready, focus, expressFor, frame]);

  useEffect(() => {
    if (ready && initialView) void applyView(initialView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, initialView]);

  /** Apply a smart view: each rule in turn colours, ghosts, hides or
   * isolates the elements it picks. */
  async function applyView(id: string) {
    setViewId(id);
    resetStyles();
    setApplied(null);
    const c = ctx.current;
    if (!id || !c) return;
    try {
      const v = await authedFetch<AppliedView>(`/projects/${projectId}/bim/smart-views/${id}/apply`);
      const mats = new Map<string, THREE.MeshLambertMaterial>();
      for (const r of v.rules) {
        const keys = new Set(Object.entries(r.elements).flatMap(([doc, ids]) => ids.map((x) => `${doc}:${x}`)));
        if (r.action === 'isolate') {
          c.meshes.forEach((list, k) => !keys.has(k) && list.forEach((o) => (o.visible = false)));
          continue;
        }
        let m: THREE.Material | null = null;
        if (r.action === 'transparent') m = c.ghost;
        else if (r.action === 'colour') {
          const col = r.colour ?? '#d1453b';
          m = mats.get(col) ?? new c.three.MeshLambertMaterial({ color: new c.three.Color(col), side: c.three.DoubleSide });
          mats.set(col, m as THREE.MeshLambertMaterial);
        }
        keys.forEach((k) =>
          c.meshes.get(k)?.forEach((o) => {
            if (r.action === 'hide') o.visible = false;
            else if (m) {
              o.userData.view = m;
              if (k !== selectedKey.current) o.material = m;
            }
          }),
        );
      }
      setApplied(v);
    } catch (e) {
      setError(err(e, 'Could not apply the smart view'));
    }
  }

  /** Fly to a link's saved view and select its object. */
  async function goTo(l: Link) {
    const c = ctx.current;
    if (!c) return;
    if (l.viewpoint) {
      c.camera.position.fromArray(l.viewpoint.position.map((x, i) => x - c.origin[i]));
      c.controls.target.fromArray(l.viewpoint.target.map((x, i) => x - c.origin[i]));
    }
    if (!c.modelIds.has(l.documentId)) return;
    const expressID = expressFor(l.documentId, l.globalId);
    if (expressID === undefined) {
      setError(`${l.name ?? l.globalId} is no longer in this revision of the model`);
      return;
    }
    const key = `${l.documentId}:${expressID}`;
    setVisible(key, true);
    paint(key);
    if (!l.viewpoint) {
      const box = new c.three.Box3();
      c.meshes.get(key)?.forEach((o) => box.expandByObject(o));
      c.controls.target.copy(box.getCenter(new c.three.Vector3()));
    }
    setPicked(await describe(l.documentId, expressID));
  }

  async function raiseIssue() {
    if (!picked || !issue) return;
    try {
      const out = await authedFetch<Link[]>(`/projects/${projectId}/models/${picked.docId}/issues`, {
        method: 'POST',
        body: {
          globalId: picked.globalId,
          expressId: picked.expressID,
          ifcType: picked.ifcType,
          name: picked.name ?? undefined,
          title: issue.title,
          ownerId: issue.ownerId || undefined,
          priority: issue.priority,
          viewpoint: viewpoint(),
        },
      });
      setLinks((all) => [...all.filter((l) => l.documentId !== picked.docId), ...out]);
      setIssue(null);
    } catch (e) {
      setError(err(e, 'Could not raise the issue'));
    }
  }

  async function chooseLinkType(type: Link['entityType']) {
    setLinkForm({ type, id: '' });
    if (records[type]) return;
    const path = type === 'RFI' ? 'rfis' : type === 'SUBMITTAL' ? 'submittals' : type === 'INSPECTION' ? 'inspections' : 'documents';
    const rows = await authedFetch<Record<string, unknown>[]>(`/projects/${projectId}/${path}`).catch(() => []);
    const label = (r: Record<string, unknown>) =>
      type === 'RFI'
        ? `${r.rfiNumber ?? ''} ${r.title ?? ''}`
        : type === 'INSPECTION'
          ? `${r.number ?? ''} ${r.title ?? ''}`
          : type === 'DOCUMENT'
            ? `${r.drawingNumber ? `${r.drawingNumber} ` : ''}${r.name ?? ''}`
            : String(r.title ?? '');
    setRecords((all) => ({ ...all, [type]: (Array.isArray(rows) ? rows : []).map((r) => ({ value: String(r.id), label: label(r).trim() })) }));
  }

  async function saveLink() {
    if (!picked || !linkForm?.id) return;
    try {
      const out = await authedFetch<Link[]>(`/projects/${projectId}/models/${picked.docId}/links`, {
        method: 'POST',
        body: {
          globalId: picked.globalId,
          expressId: picked.expressID,
          ifcType: picked.ifcType,
          name: picked.name ?? undefined,
          entityType: linkForm.type,
          entityId: linkForm.id,
          viewpoint: viewpoint(),
        },
      });
      setLinks((all) => [...all.filter((l) => l.documentId !== picked.docId), ...out]);
      setLinkForm(null);
    } catch (e) {
      setError(err(e, 'Could not link it'));
    }
  }

  async function unlink(l: Link) {
    try {
      const out = await authedFetch<Link[]>(`/projects/${projectId}/models/${l.documentId}/links/${l.id}`, { method: 'DELETE' });
      setLinks((all) => [...all.filter((x) => x.documentId !== l.documentId), ...out]);
    } catch (e) {
      setError(err(e, 'Could not remove the link'));
    }
  }

  const objectLinks = useMemo(() => (picked ? links.filter((l) => l.documentId === picked.docId && l.globalId === picked.globalId) : []), [links, picked]);
  const issues = links.filter((l) => l.entityType === 'ISSUE');
  const owners = members.filter((m) => m.role !== 'CLIENT').map((m) => ({ value: m.id, label: memberName(m) }));

  return (
    // A portal to the page body: inside the app shell the header and the
    // chat button would sit on top of a full-screen viewer.
    createPortal(
      <div className="fixed inset-0 z-[80] flex flex-col bg-white dark:bg-slate-950" role="dialog" aria-modal="true" aria-label="Model viewer">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{models.map((m) => m.name).join(' + ')}</h2>
          <div className="flex items-center gap-1" role="toolbar" aria-label="Viewer tools">
            {(
              [
                ['select', 'Select objects', MousePointer2],
                ['measure', 'Measure a distance', Ruler],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setMeasurePts([]);
                }}
                className={`flex h-9 w-9 items-center justify-center rounded-md ${mode === m ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <Icon size={16} />
              </button>
            ))}
            {!readOnly && smartViews.length > 0 && (
              <span className="flex items-center gap-1">
                <Palette size={15} className="text-slate-500" aria-hidden />
                <Select
                  className={`${selectCls} h-9 w-48 text-xs`}
                  value={viewId}
                  onChange={(v) => void applyView(v)}
                  options={[{ value: '', label: 'No smart view' }, ...smartViews.map((v) => ({ value: v.id, label: v.name }))]}
                  aria-label="Smart view"
                />
              </span>
            )}
            {hidden.length > 0 && (
              <button type="button" className={secondaryBtn} onClick={showAll}>
                <Eye size={14} /> Show all
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="flex items-center justify-between bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
            <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </p>
        )}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative min-h-[50vh] flex-1">
            <div ref={hostRef} className="absolute inset-0" style={{ cursor: mode === 'measure' ? 'crosshair' : 'default', touchAction: 'none' }} aria-label="3D model" />
            {!ready && !error && (
              <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" /> {progress}
              </p>
            )}
            {(applied || focus) && ready && (
              <div className="absolute bottom-3 left-3 max-w-xs rounded-md bg-white/95 px-3 py-2 text-xs shadow dark:bg-slate-900/95">
                <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">{applied?.name ?? focus?.label}</p>
                <ul className="space-y-0.5">
                  {applied
                    ? applied.rules.map((r) => (
                        <li key={r.label} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ background: r.action === 'colour' ? (r.colour ?? '#d1453b') : r.action === 'transparent' ? 'transparent' : '#e2e8f0' }} />
                          {r.label} · {r.action === 'colour' ? 'coloured' : r.action === 'transparent' ? 'see-through' : r.action === 'hide' ? 'hidden' : 'only these shown'} ({r.count})
                        </li>
                      ))
                    : focus!.items.map((it) => (
                        <li key={`${it.documentId}${it.globalId}`} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: it.colour }} />
                          {it.label ?? it.globalId}
                        </li>
                      ))}
                </ul>
                {focus && !applied && (
                  <button type="button" className="mt-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400" onClick={resetStyles}>
                    Show the whole model
                  </button>
                )}
              </div>
            )}
            {mode === 'measure' && ready && (
              <p className="absolute left-3 top-3 rounded-md bg-white/90 px-3 py-1.5 text-sm shadow dark:bg-slate-900/90">
                {distance !== null ? (
                  <>
                    Distance <strong className="tabular-nums">{distance.toFixed(3)} m</strong>
                  </>
                ) : (
                  `Click ${measurePts.length ? 'the second' : 'the first'} point on the model`
                )}
              </p>
            )}
          </div>

          <aside
            className="max-h-[45vh] w-full shrink-0 overflow-y-auto border-t border-slate-200 p-3 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0 dark:border-slate-800"
            aria-label="Object and issues"
          >
            {picked ? (
              <section>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{picked.ifcType.replace(/^IFC/, 'Ifc')}</p>
                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{picked.name ?? 'Unnamed object'}</h3>
                    <p className="font-mono text-[11px] text-slate-400">{picked.globalId}</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" title="Hide" aria-label="Hide object" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={hide}>
                      <EyeOff size={14} />
                    </button>
                    <button
                      type="button"
                      title="Show only this"
                      aria-label="Isolate object"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={isolate}
                    >
                      <Focus size={14} />
                    </button>
                  </div>
                </div>

                {!readOnly && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={primaryBtn} onClick={() => setIssue({ title: '', ownerId: '', priority: 'MEDIUM' })}>
                      <Crosshair size={14} /> Raise an issue
                    </button>
                    <button type="button" className={secondaryBtn} onClick={() => chooseLinkType('DOCUMENT')}>
                      <Link2 size={14} /> Link
                    </button>
                  </div>
                )}
                {issue && (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                    <label className={labelCls}>
                      Issue
                      <input
                        autoFocus
                        className={`${inputCls} mt-0.5`}
                        placeholder="e.g. Duct clashes with the beam"
                        value={issue.title}
                        onChange={(e) => setIssue({ ...issue, title: e.target.value })}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        className={`${selectCls} w-full`}
                        value={issue.ownerId}
                        onChange={(v) => setIssue({ ...issue, ownerId: v })}
                        options={[{ value: '', label: 'Owner…' }, ...owners]}
                        aria-label="Issue owner"
                      />
                      <Select
                        className={`${selectCls} w-full`}
                        value={issue.priority}
                        onChange={(v) => setIssue({ ...issue, priority: v })}
                        options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => ({ value: p, label: p[0] + p.slice(1).toLowerCase() }))}
                        aria-label="Priority"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">The current view is saved with the issue.</p>
                    <div className="flex gap-2">
                      <button type="button" className={primaryBtn} disabled={!issue.title.trim()} onClick={raiseIssue}>
                        Raise issue
                      </button>
                      <button type="button" className={secondaryBtn} onClick={() => setIssue(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {linkForm && (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                    <Select
                      className={`${selectCls} w-full`}
                      value={linkForm.type}
                      onChange={(v) => chooseLinkType(v as Link['entityType'])}
                      options={(['DOCUMENT', 'RFI', 'SUBMITTAL', 'INSPECTION'] as const).map((t) => ({ value: t, label: ENTITY_LABEL[t] }))}
                      aria-label="Link to"
                    />
                    <Select
                      className={`${selectCls} w-full`}
                      value={linkForm.id}
                      onChange={(v) => setLinkForm({ ...linkForm, id: v })}
                      options={[{ value: '', label: 'Choose…' }, ...(records[linkForm.type] ?? [])]}
                      aria-label="Record"
                    />
                    <div className="flex gap-2">
                      <button type="button" className={primaryBtn} disabled={!linkForm.id} onClick={saveLink}>
                        Link
                      </button>
                      <button type="button" className={secondaryBtn} onClick={() => setLinkForm(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {objectLinks.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Linked to this object</h4>
                    <ul className="mt-1 space-y-1 text-xs">
                      {objectLinks.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2">
                          <span>
                            <span className="text-slate-500">{ENTITY_LABEL[l.entityType]}:</span> {l.record.label}
                            {l.record.status && <span className="text-slate-400"> · {l.record.status.toLowerCase().replace(/_/g, ' ')}</span>}
                          </span>
                          {!readOnly && (
                            <button type="button" aria-label="Remove link" className="text-slate-400 hover:text-red-600" onClick={() => unlink(l)}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {picked.props.map((p) => (
                  <details key={p.set} className="mt-3" open={picked.props.length <= 2}>
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">{p.set}</summary>
                    <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px]">
                      {p.rows.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="truncate text-slate-500">{k}</dt>
                          <dd className="truncate text-slate-800 dark:text-slate-100">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ))}
              </section>
            ) : (
              <p className="text-xs text-slate-500">{ready ? 'Click an object to see its properties. Drag to orbit, right-drag to pan, scroll to zoom.' : ''}</p>
            )}

            {!readOnly && (
              <section className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issues on the model ({issues.length})</h3>
                {issues.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">None raised yet.</p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {issues.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          disabled={!ready}
                          onClick={() => goTo(l)}
                          className="w-full rounded-md border border-slate-200 p-2 text-left text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          <span className="block font-medium text-slate-800 dark:text-slate-100">{l.record.label}</span>
                          <span className="block text-slate-500">
                            {[l.ifcType?.replace(/^IFC/, ''), l.name].filter(Boolean).join(' ')} · {l.record.status?.toLowerCase().replace(/_/g, ' ')}
                            {l.record.owner && ` · ${l.record.owner}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {links.length > issues.length && (
                  <>
                    <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Other links ({links.length - issues.length})</h3>
                    <ul className="mt-1 space-y-1">
                      {links
                        .filter((l) => l.entityType !== 'ISSUE')
                        .map((l) => (
                          <li key={l.id}>
                            <button type="button" disabled={!ready} onClick={() => goTo(l)} className="text-left text-xs text-emerald-700 hover:underline dark:text-emerald-400">
                              {ENTITY_LABEL[l.entityType]}: {l.record.label}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>,
      document.body,
    )
  );
}
