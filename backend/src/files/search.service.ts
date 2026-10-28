import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';

interface Hit {
  documentId: string;
  name: string;
  drawingNumber: string | null;
  projectId: string;
  projectName: string;
  revisionId: string;
  revisionNumber: string;
  page: number;
  source: string;
  rank: number;
  snippet: string;
  latest: boolean;
}

/** Full-text search inside drawings and documents (donor "file search"):
 * Postgres full-text search on each page's text, with a plain substring
 * match too so drawing numbers and codes ("STR-201") are found. Results come
 * back one row per document, newest matching revision first, with the pages
 * and a snippet. */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  /** The projects a caller may search: one, or (with none given) every
   * project they can see. A client only finds documents shared with them. */
  private async scope(userId: string, projectId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
    if (projectId) {
      await this.projects.findOneForOwner(projectId, userId);
      const client = !internal && Boolean(await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } }));
      return { projectIds: [projectId], clientOnly: client ? [projectId] : [] };
    }
    if (internal) {
      const all = await this.prisma.project.findMany({ select: { id: true } });
      return { projectIds: all.map((p) => p.id), clientOnly: [] as string[] };
    }
    const memberships = await this.prisma.projectMember.findMany({ where: { userId }, select: { projectId: true, role: true } });
    return { projectIds: [...new Set(memberships.map((m) => m.projectId))], clientOnly: memberships.filter((m) => m.role === 'CLIENT').map((m) => m.projectId) };
  }

  async search(userId: string, q: string, projectId?: string) {
    const query = q.trim();
    if (query.length < 2) throw new BadRequestException('Type at least two characters');
    const { projectIds, clientOnly } = await this.scope(userId, projectId);
    if (!projectIds.length) return { query, results: [] };
    const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.prisma.$queryRaw<Hit[]>(Prisma.sql`
      WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS tsq)
      SELECT d.id AS "documentId", d.name, d."drawingNumber", d."projectId", p.name AS "projectName",
             r.id AS "revisionId", r."revisionNumber", t.page, t.source,
             ts_rank(to_tsvector('english', t.text), q.tsq)::float AS rank,
             CASE WHEN to_tsvector('english', t.text) @@ q.tsq
               THEN ts_headline('english', t.text, q.tsq, 'MaxWords=24, MinWords=10, MaxFragments=2, FragmentDelimiter= … , StartSel=«, StopSel=»')
               ELSE substring(t.text FROM greatest(1, strpos(lower(t.text), lower(${query})) - 80) FOR 220)
             END AS snippet,
             r.id = (SELECT r2.id FROM "DocumentRevision" r2 WHERE r2."documentId" = d.id ORDER BY r2."uploadedAt" DESC LIMIT 1) AS latest
      FROM "DocumentPageText" t
      JOIN "DocumentRevision" r ON r.id = t."revisionId"
      JOIN "ProjectDocument" d ON d.id = r."documentId"
      JOIN "Project" p ON p.id = d."projectId"
      CROSS JOIN q
      WHERE d."deletedAt" IS NULL
        AND d."projectId" IN (${Prisma.join(projectIds)})
        AND (d."clientVisible" OR d."projectId" NOT IN (${Prisma.join(clientOnly.length ? clientOnly : [''])}))
        AND (to_tsvector('english', t.text) @@ q.tsq OR t.text ILIKE ${like})
      ORDER BY latest DESC, rank DESC, t.page
      LIMIT 300`);
    // Documents found by name or drawing number but with no text on file.
    const named = await this.prisma.projectDocument.findMany({
      where: {
        deletedAt: null,
        projectId: { in: projectIds },
        OR: [{ name: { contains: query, mode: 'insensitive' } }, { drawingNumber: { contains: query, mode: 'insensitive' } }],
      },
      select: { id: true, name: true, drawingNumber: true, projectId: true, clientVisible: true, project: { select: { name: true } }, revisions: { orderBy: { uploadedAt: 'desc' }, take: 1, select: { id: true, revisionNumber: true } } },
      take: 50,
    });

    const byDoc = new Map<string, { documentId: string; name: string; drawingNumber: string | null; projectId: string; projectName: string; revisionId: string | null; revisionNumber: string | null; latest: boolean; matchedName: boolean; pages: { page: number; snippet: string; source: string }[] }>();
    for (const h of rows) {
      let d = byDoc.get(h.documentId);
      if (!d) {
        d = { documentId: h.documentId, name: h.name, drawingNumber: h.drawingNumber, projectId: h.projectId, projectName: h.projectName, revisionId: h.revisionId, revisionNumber: h.revisionNumber, latest: h.latest, matchedName: false, pages: [] };
        byDoc.set(h.documentId, d);
      }
      // One revision per document: the first (newest-matching) one seen.
      if (h.revisionId === d.revisionId && d.pages.length < 5) d.pages.push({ page: h.page, snippet: h.snippet, source: h.source });
    }
    for (const n of named) {
      if (clientOnly.includes(n.projectId) && !n.clientVisible) continue;
      const d = byDoc.get(n.id);
      if (d) d.matchedName = true;
      else
        byDoc.set(n.id, {
          documentId: n.id,
          name: n.name,
          drawingNumber: n.drawingNumber,
          projectId: n.projectId,
          projectName: n.project.name,
          revisionId: n.revisions[0]?.id ?? null,
          revisionNumber: n.revisions[0]?.revisionNumber ?? null,
          latest: true,
          matchedName: true,
          pages: [],
        });
    }
    const pending = await this.prisma.documentRevision.count({ where: { textStatus: { in: ['PROCESSING'] }, document: { deletedAt: null, projectId: { in: projectIds } } } });
    const queued = await this.prisma.documentRevision.count({ where: { textStatus: null, document: { deletedAt: null, projectId: { in: projectIds } } } });
    return { query, results: [...byDoc.values()].slice(0, 100), stillReading: pending + queued };
  }
}
