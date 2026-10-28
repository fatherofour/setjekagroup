import { createHash } from 'node:crypto';
import * as webIfc from 'web-ifc';

/** One element read off an IFC model. Coordinates are web-ifc's: Y up, in
 * metres, as the browser viewer draws them (before its display origin). */
export interface ExtractedElement {
  expressId: number;
  globalId: string;
  ifcType: string;
  name: string | null;
  typeName: string | null;
  storey: string | null;
  material: string | null;
  properties: Record<string, string | number | boolean>;
  quantities: Record<string, number>;
  box: [number, number, number, number, number, number] | null;
  propsHash: string;
}

const val = (v: any): string | number | boolean | null => {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return val(v.value);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return null;
};

const QUANTITY_KEYS = ['LengthValue', 'AreaValue', 'VolumeValue', 'CountValue', 'WeightValue', 'TimeValue'];

/** Read every element with geometry: its identity, storey, materials,
 * property and quantity sets (including those on its type) and its
 * bounding box. Runs on the server so the BIM hub, clash detection, smart
 * views and requirement checks all work from the same element store. */
export async function extractIfc(bytes: Uint8Array, onProgress?: (done: number, total: number) => void) {
  const api = new webIfc.IfcAPI();
  await api.Init();
  const model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
  try {
    const schema = api.GetModelSchema(model);
    // Bounding boxes from the meshes.
    const boxes = new Map<number, [number, number, number, number, number, number]>();
    api.StreamAllMeshes(model, (mesh) => {
      const pgs = mesh.geometries;
      const b = boxes.get(mesh.expressID) ?? [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pgs.size(); i++) {
        const pg = pgs.get(i);
        const g = api.GetGeometry(model, pg.geometryExpressID);
        const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const m = pg.flatTransformation;
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k];
          const y = v[k + 1];
          const z = v[k + 2];
          const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
          const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
          const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
          if (wx < b[0]) b[0] = wx;
          if (wy < b[1]) b[1] = wy;
          if (wz < b[2]) b[2] = wz;
          if (wx > b[3]) b[3] = wx;
          if (wy > b[4]) b[4] = wy;
          if (wz > b[5]) b[5] = wz;
        }
        g.delete();
      }
      boxes.set(mesh.expressID, b);
    });

    // Storey of each element, from the spatial tree.
    const storeyOf = new Map<number, string>();
    const storeys: string[] = [];
    const tree = (await api.properties.getSpatialStructure(model, false)) as { expressID: number; type: string; children: any[] };
    const walk = (node: { expressID: number; type: string; children: any[] }, storey: string | null) => {
      let s = storey;
      if (node.type.toUpperCase() === 'IFCBUILDINGSTOREY') {
        s = (val(api.GetLine(model, node.expressID).Name) as string | null) ?? `Storey ${node.expressID}`;
        if (!storeys.includes(s)) storeys.push(s);
      }
      if (s) storeyOf.set(node.expressID, s);
      for (const c of node.children ?? []) walk(c, s);
    };
    walk(tree, null);

    const out: ExtractedElement[] = [];
    const ids = [...boxes.keys()];
    let n = 0;
    for (const id of ids) {
      n++;
      if (onProgress && n % 200 === 0) onProgress(n, ids.length);
      const line = api.GetLine(model, id);
      const globalId = val(line.GlobalId) as string | null;
      if (!globalId) continue;
      const properties: Record<string, string | number | boolean> = {};
      const quantities: Record<string, number> = {};
      try {
        // The element's own sets, then its type's (asking for both at once
        // returns nothing in this web-ifc version).
        const own = await api.properties.getPropertySets(model, id, true);
        const typeSets: any[] = [];
        for (const t of await api.properties.getTypeProperties(model, id, true).catch(() => [])) for (const ps of t?.HasPropertySets ?? []) if (ps) typeSets.push(ps);
        const sets = [...typeSets, ...own];
        for (const s of sets) {
          const setName = (val(s.Name) as string) ?? 'Properties';
          for (const p of s.HasProperties ?? []) {
            const v = val(p?.NominalValue);
            if (p?.Name && v !== null) properties[`${setName}.${val(p.Name)}`] = v;
          }
          for (const q of s.Quantities ?? []) {
            const key = QUANTITY_KEYS.find((k) => q?.[k] != null);
            const v = key ? val(q[key]) : null;
            if (q?.Name && typeof v === 'number') quantities[`${setName}.${val(q.Name)}`] = Math.round(v * 10000) / 10000;
          }
        }
      } catch {
        // an element without property sets
      }
      let material: string | null = null;
      try {
        const mats = await api.properties.getMaterialsProperties(model, id, true, false);
        const names = new Set<string>();
        const collect = (m: any) => {
          if (!m || typeof m !== 'object') return;
          const nm = val(m.Name);
          if (typeof nm === 'string' && m.type !== undefined && /MATERIAL$/i.test(api.GetNameFromTypeCode(m.type))) names.add(nm);
          for (const k of ['Material', 'Materials', 'ForLayerSet', 'MaterialLayers', 'MaterialConstituents', 'MaterialProfiles']) {
            const v = m[k];
            if (Array.isArray(v)) v.forEach(collect);
            else if (v) collect(v);
          }
        };
        mats.forEach(collect);
        if (names.size) material = [...names].slice(0, 5).join(', ');
      } catch {
        // no materials
      }
      const b = boxes.get(id)!;
      const box = Number.isFinite(b[0]) ? (b.map((x) => Math.round(x * 1000) / 1000) as ExtractedElement['box']) : null;
      const ifcType = api.GetNameFromTypeCode(line.type);
      const name = val(line.Name) as string | null;
      const typeName = val(line.ObjectType) as string | null;
      const storey = storeyOf.get(id) ?? null;
      const propsHash = createHash('sha1')
        .update(JSON.stringify([ifcType, name, typeName, storey, material, properties, quantities, box?.map((x) => Math.round(x * 100))]))
        .digest('hex');
      out.push({ expressId: id, globalId, ifcType, name, typeName, storey, material, properties, quantities, box, propsHash });
    }
    return { schema, storeys, elements: out };
  } finally {
    api.CloseModel(model);
  }
}
