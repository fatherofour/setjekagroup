import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { PrismaService } from '../prisma/prisma.service.js';
import { BimService } from './bim.service.js';

type Vec = [number, number, number];
type Viewpoint = { position: number[]; target: number[] };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xyz = (tag: string, v: Vec) => `<${tag}><X>${v[0]}</X><Y>${v[1]}</Y><Z>${v[2]}</Z></${tag}>`;
// The viewer is Y up; BCF (and IFC) is Z up.
const toZUp = (v: number[]): Vec => [v[0], -v[2], v[1]];
const toYUp = (v: number[]): Vec => [v[0], v[2], -v[1]];
const round = (v: Vec): Vec => v.map((x) => Math.round(x * 1000) / 1000) as Vec;

const STATUS_OUT: Record<string, string> = { OPEN: 'Open', IN_PROGRESS: 'In Progress', ESCALATED: 'Open', RESOLVED: 'Resolved', CLOSED: 'Closed' };
const PRIORITY_OUT: Record<string, string> = { LOW: 'Low', MEDIUM: 'Normal', HIGH: 'High', CRITICAL: 'Critical' };

function statusIn(s?: string) {
  const v = (s ?? '').toLowerCase();
  if (/closed|done|approved/.test(v)) return 'CLOSED' as const;
  if (/resolved|fixed/.test(v)) return 'RESOLVED' as const;
  if (/progress|active|assigned|reopened/.test(v)) return 'IN_PROGRESS' as const;
  return 'OPEN' as const;
}
function priorityIn(s?: string) {
  const v = (s ?? '').toLowerCase();
  if (/critical|blocker|urgent/.test(v)) return 'CRITICAL' as const;
  if (/high|major/.test(v)) return 'HIGH' as const;
  if (/low|minor/.test(v)) return 'LOW' as const;
  return 'MEDIUM' as const;
}

/** BCF 2.1 round trip (donor BCF import/export): the model issues go out as
 * a .bcfzip - topic, notes, the elements and the camera - for Revit,
 * ArchiCAD, Solibri or Navisworks, and topics coming back become issues
 * linked to the same elements. */
@Injectable()
export class BcfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bim: BimService,
  ) {}

  async export(projectId: string, userId: string, documentIds?: string[]) {
    const { client } = await this.bim.viewer(projectId, userId);
    if (client) throw new ForbiddenException('BCF exchange is kept for the project team');
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
    const links = await this.prisma.modelObjectLink.findMany({ where: { projectId, entityType: 'ISSUE', ...(documentIds?.length ? { documentId: { in: documentIds } } : {}) }, orderBy: { createdAt: 'asc' } });
    if (!links.length) throw new BadRequestException('There are no model issues to export');
    const issues = await this.prisma.projectIssue.findMany({
      where: { id: { in: [...new Set(links.map((l) => l.entityId))] }, projectId },
      include: { owner: { select: { user: { select: { email: true } }, externalEmail: true } } },
    });
    const comments = await this.prisma.comment.findMany({ where: { entityType: 'ISSUE', entityId: { in: issues.map((i) => i.id) } }, include: { author: { select: { email: true } } }, orderBy: { createdAt: 'asc' } });
    const firstLink = await this.prisma.modelObjectLink.findFirst({ where: { projectId, entityType: 'ISSUE' }, include: { createdBy: { select: { email: true } } } });
    const zip = new JSZip();
    zip.file('bcf.version', `<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>\n`);
    zip.file('project.bcfp', `<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension><Project ProjectId="${project!.id}"><Name>${esc(project!.name)}</Name></Project><ExtensionSchema></ExtensionSchema></ProjectExtension>\n`);
    for (const issue of issues) {
      let guid = issue.bcfGuid;
      if (!guid) {
        guid = randomUUID();
        await this.prisma.projectIssue.update({ where: { id: issue.id }, data: { bcfGuid: guid } });
      }
      const mine = links.filter((l) => l.entityId === issue.id);
      const vpGuid = randomUUID();
      const vp = (mine.find((l) => l.viewpoint)?.viewpoint ?? null) as Viewpoint | null;
      const author = firstLink?.createdBy.email ?? 'setjeka';
      const assigned = issue.owner?.user?.email ?? issue.owner?.externalEmail;
      const notes = comments.filter((c) => c.entityId === issue.id);
      const markup = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Markup>',
        `<Topic Guid="${guid}" TopicType="Issue" TopicStatus="${STATUS_OUT[issue.status] ?? 'Open'}">`,
        `<Title>${esc(issue.title)}</Title>`,
        `<Priority>${PRIORITY_OUT[issue.priority] ?? 'Normal'}</Priority>`,
        `<CreationDate>${issue.createdAt.toISOString()}</CreationDate>`,
        `<CreationAuthor>${esc(author)}</CreationAuthor>`,
        `<ModifiedDate>${issue.updatedAt.toISOString()}</ModifiedDate>`,
        issue.dueDate ? `<DueDate>${issue.dueDate.toISOString()}</DueDate>` : '',
        assigned ? `<AssignedTo>${esc(assigned)}</AssignedTo>` : '',
        issue.description ? `<Description>${esc(issue.description)}</Description>` : '',
        '</Topic>',
        ...notes.map((c) => `<Comment Guid="${randomUUID()}"><Date>${c.createdAt.toISOString()}</Date><Author>${esc(c.author.email)}</Author><Comment>${esc(c.body)}</Comment><Viewpoint Guid="${vpGuid}"/></Comment>`),
        `<Viewpoints Guid="${vpGuid}"><Viewpoint>viewpoint.bcfv</Viewpoint></Viewpoints>`,
        '</Markup>',
      ]
        .filter(Boolean)
        .join('\n');
      let camera = '';
      if (vp?.position?.length === 3 && vp?.target?.length === 3) {
        const p = toZUp(vp.position);
        const t = toZUp(vp.target);
        const d = [t[0] - p[0], t[1] - p[1], t[2] - p[2]];
        const n = Math.hypot(d[0], d[1], d[2]) || 1;
        camera = `<PerspectiveCamera>${xyz('CameraViewPoint', round(p))}${xyz('CameraDirection', round([d[0] / n, d[1] / n, d[2] / n]))}${xyz('CameraUpVector', [0, 0, 1])}<FieldOfView>50</FieldOfView></PerspectiveCamera>`;
      }
      const viewpoint = `<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="${vpGuid}"><Components><Selection>${mine.map((l) => `<Component IfcGuid="${esc(l.globalId)}"/>`).join('')}</Selection><Visibility DefaultVisibility="true"/></Components>${camera}</VisualizationInfo>\n`;
      zip.file(`${guid}/markup.bcf`, markup + '\n');
      zip.file(`${guid}/viewpoint.bcfv`, viewpoint);
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { buffer, filename: `${project!.name} - model issues.bcfzip`.replace(/[^\w\- .]+/g, ' '), count: issues.length };
  }

  async import(projectId: string, userId: string, file: Express.Multer.File) {
    const { client } = await this.bim.viewer(projectId, userId);
    if (client) throw new ForbiddenException('BCF exchange is kept for the project team');
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file.buffer);
    } catch {
      throw new BadRequestException('This is not a BCF file (.bcfzip / .bcf)');
    }
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, isArray: (name) => ['Comment', 'Viewpoints', 'Component'].includes(name) });
    const markups = Object.keys(zip.files).filter((n) => /(^|\/)markup\.bcf$/i.test(n));
    if (!markups.length) throw new BadRequestException('The BCF file has no topics');
    // Where each element is: GlobalId -> model, from the newest read revisions.
    const models = await this.bim.latestRevisions(projectId);
    const revIds = models.filter((m) => m.latest?.bimProcessing?.status === 'DONE').map((m) => m.latest.id);
    const els = await this.prisma.bimElement.findMany({ where: { revisionId: { in: revIds } }, select: { globalId: true, documentId: true, expressId: true, ifcType: true, name: true } });
    const where = new Map(els.map((e) => [e.globalId, e]));
    let created = 0;
    let updated = 0;
    let linked = 0;
    let unmatched = 0;
    for (const path of markups) {
      const dir = path.replace(/markup\.bcf$/i, '');
      const m = parser.parse(await zip.file(path)!.async('string')).Markup;
      const topic = m?.Topic;
      if (!topic) continue;
      const guid: string = topic['@_Guid'] ?? dir.replace(/\/$/, '');
      const title = String(topic.Title ?? 'BCF topic').slice(0, 200);
      const notes = (m.Comment ?? []).map((c: any) => `${c.Author ?? ''} (${String(c.Date ?? '').slice(0, 10)}): ${c.Comment ?? ''}`.trim()).filter((s: string) => s.length > 5);
      const description = [topic.Description, notes.length ? `Notes from the BCF topic:\n${notes.join('\n')}` : null].filter(Boolean).join('\n\n') || null;
      const existing = await this.prisma.projectIssue.findFirst({ where: { projectId, bcfGuid: guid } });
      const data = { title, description, status: statusIn(topic['@_TopicStatus']), priority: priorityIn(topic.Priority), dueDate: topic.DueDate ? new Date(topic.DueDate) : null };
      const issue = existing ? await this.prisma.projectIssue.update({ where: { id: existing.id }, data }) : await this.prisma.projectIssue.create({ data: { ...data, projectId, bcfGuid: guid } });
      if (existing) updated++;
      else created++;
      // The first viewpoint: its selected elements and camera.
      const vpName = m.Viewpoints?.[0]?.Viewpoint ?? 'viewpoint.bcfv';
      const vpFile = zip.file(dir + vpName);
      if (!vpFile) continue;
      const vi = parser.parse(await vpFile.async('string')).VisualizationInfo;
      const cam = vi?.PerspectiveCamera ?? vi?.OrthogonalCamera;
      let viewpoint: Viewpoint | undefined;
      if (cam?.CameraViewPoint && cam?.CameraDirection) {
        const p = ['X', 'Y', 'Z'].map((k) => Number(cam.CameraViewPoint[k]));
        const d = ['X', 'Y', 'Z'].map((k) => Number(cam.CameraDirection[k]));
        if ([...p, ...d].every(Number.isFinite)) {
          const dist = 10;
          viewpoint = { position: round(toYUp(p)), target: round(toYUp([p[0] + d[0] * dist, p[1] + d[1] * dist, p[2] + d[2] * dist])) };
        }
      }
      for (const c of vi?.Components?.Selection?.Component ?? []) {
        const g = c?.['@_IfcGuid'];
        const e = g ? where.get(g) : undefined;
        if (!e) {
          if (g) unmatched++;
          continue;
        }
        const ok = await this.prisma.modelObjectLink
          .create({ data: { projectId, documentId: e.documentId, globalId: e.globalId, expressId: e.expressId, ifcType: e.ifcType, name: e.name, entityType: 'ISSUE', entityId: issue.id, viewpoint: viewpoint as object | undefined, createdById: userId } })
          .then(() => true)
          .catch(() => false);
        if (ok) linked++;
      }
    }
    return { created, updated, linked, unmatched };
  }
}
