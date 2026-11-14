import { BadGatewayException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { onSetjekaTeam, seesProjectMoney } from '../common/setjeka-team.js';
import { rulesFor, siteToday } from '../common/countries.js';
import { contractTerms } from '../common/contract-forms.js';
import type { AskDto } from './dto/assistant.dto.js';

const DAY = 86_400_000;
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'not set');

const SYSTEM = `You are the Setjeka assistant, inside Setjeka Group's construction project management platform. Setjeka is a development and project management company working across Africa, mainly in South Africa and Nigeria.
Answer from the project records given to you. If the records do not hold the answer, say so plainly and say where in the platform to look; never invent numbers, dates, names or clauses. Use the due dates written in the records; do not work dates out yourself.
Be brief and practical, as a project manager would want it: short sentences, plain English, lists only when listing things. Use the record numbers (RFI-003, NCR-002) and dates as given.
On contract questions, say which form of contract the periods come from, and that the signed contract governs.`;

/** The Setjeka assistant (2026-11-04): questions about a project answered
 * by a language model from that project's own records. The model runs on
 * Setjeka's server through Ollama's OpenAI-compatible API (AI_BASE_URL,
 * AI_MODEL; any OpenAI-compatible service works). It is for the Setjeka
 * team for now: outside parties see only part of a project, and the
 * summary given to the model is the whole of it. */
@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  private config() {
    return {
      baseUrl: (process.env.AI_BASE_URL ?? '').replace(/\/+$/, ''),
      model: process.env.AI_MODEL ?? 'qwen2.5:3b',
      apiKey: process.env.AI_API_KEY ?? '',
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 240_000),
      maxTokens: Number(process.env.AI_MAX_TOKENS ?? 400),
    };
  }

  private async isTeam(userId: string, projectId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (user?.role === 'ADMIN' || user?.accountType === 'INTERNAL') return true;
    return projectId ? onSetjekaTeam(this.prisma, projectId, userId) : false;
  }

  async status(userId: string) {
    const c = this.config();
    return { enabled: Boolean(c.baseUrl), model: c.baseUrl ? c.model : null, available: await this.isTeam(userId) };
  }

  async ask(userId: string, dto: AskDto) {
    const c = this.config();
    if (!c.baseUrl) throw new ServiceUnavailableException('The assistant is not connected to a model yet');
    if (dto.projectId) await this.projects.findOneForOwner(dto.projectId, userId);
    if (!(await this.isTeam(userId, dto.projectId))) throw new ForbiddenException('The assistant is for the Setjeka team for now');
    const context = dto.projectId ? await this.projectContext(dto.projectId, await seesProjectMoney(this.prisma, dto.projectId, userId)) : await this.portfolioContext();
    const qwen3 = c.model.startsWith('qwen3');
    const messages = [
      { role: 'system', content: `${SYSTEM}\n\n${context}` },
      ...(dto.history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
      // Qwen 3 thinks aloud unless told not to; on a CPU that doubles the wait.
      { role: 'user', content: `${qwen3 ? '/no_think ' : ''}${dto.question.trim()}` },
    ];
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), c.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
        body: JSON.stringify({ model: c.model, messages, temperature: 0.2, max_tokens: c.maxTokens, stream: false }),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new BadGatewayException(ctrl.signal.aborted ? 'The model took too long to answer; try a shorter question' : `The model could not be reached (${(e as Error).message})`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new BadGatewayException(`The model answered with an error (${res.status})`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = body.choices?.[0]?.message?.content ?? '';
    const answer = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || 'The model gave no answer.';
    return { answer, model: c.model, seconds: Math.round((Date.now() - started) / 100) / 10 };
  }

  /** Every open project, for questions asked off a project. */
  private async portfolioContext() {
    const rows = await this.prisma.project.findMany({
      where: { status: { notIn: ['COMPLETED', 'ARCHIVED'] } },
      select: { name: true, projectCode: true, stage: true, country: true, endDate: true, client: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    return ['Setjeka’s open projects:', ...rows.map((p) => `- ${p.name}${p.projectCode ? ` (${p.projectCode})` : ''}: stage ${p.stage}, ${rulesFor(p.country).name}${p.client ? `, client ${p.client}` : ''}, finish ${fmt(p.endDate)}`)].join('\n');
  }

  /** A short summary of the project's records for the model: small enough
   * for a model on a CPU to read quickly. */
  /** `money`: the project's value and the contract sums, for Setjeka's staff
   * and the QS only; an outside firm's site or HSE manager on the team gets
   * the rest (critique M-01). */
  private async projectContext(projectId: string, money: boolean) {
    const p = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true, projectCode: true, stage: true, country: true, contractForm: true, currency: true, value: true, startDate: true, endDate: true, location: true, client: true },
    });
    const today = new Date(`${siteToday(p.country)}T00:00:00.000Z`);
    const soon = new Date(today.getTime() + 14 * DAY);
    const [acts, rfis, issues, risks, letters, ncrs, incidents, permits, claims, defects, handover, contracts] = await Promise.all([
      this.prisma.scheduleActivity.findMany({ where: { projectId }, select: { id: true, parentId: true, name: true, activityType: true, startDate: true, endDate: true, durationDays: true, percentComplete: true, isCriticalPath: true, contractor: { select: { name: true } } }, orderBy: { startDate: 'asc' } }),
      this.prisma.rfi.findMany({ where: { projectId, status: 'OPEN' }, select: { rfiNumber: true, title: true, dueDate: true, priority: true }, orderBy: { createdAt: 'asc' }, take: 10 }),
      this.prisma.projectIssue.findMany({ where: { projectId, status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] } }, select: { title: true, priority: true, dueDate: true }, take: 8 }),
      this.prisma.projectRisk.findMany({ where: { projectId, status: { not: 'CLOSED' } }, select: { title: true, probability: true, impact: true }, take: 30 }),
      this.prisma.projectCommunication.findMany({ where: { projectId, status: { notIn: ['DRAFT', 'CANCELLED'] } }, select: { number: true, kind: true, subject: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
      this.prisma.nonConformance.findMany({ where: { projectId, status: { notIn: ['CLOSED', 'VOID'] } }, select: { number: true, title: true, severity: true, dueDate: true }, take: 8 }),
      this.prisma.hseIncident.findMany({ where: { projectId, status: { not: 'CLOSED' } }, select: { number: true, title: true, severity: true }, take: 6 }),
      this.prisma.workPermit.findMany({ where: { projectId, status: { in: ['ISSUED', 'SUSPENDED'] } }, select: { number: true, title: true, status: true, validTo: true }, take: 6 }),
      this.prisma.timeClaim.findMany({ where: { projectId }, select: { number: true, title: true, status: true, eventStartedAt: true, notifiedAt: true, lateNoticeDays: true, claimDueAt: true, submittedAt: true, requestedDays: true, assessDueAt: true, grantedDays: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
      this.prisma.contractDefect.count({ where: { projectId, status: { in: ['REPORTED', 'OPEN'] } } }),
      this.prisma.handoverItem.groupBy({ by: ['status'], where: { projectId }, _count: true }),
      this.prisma.projectContract.findMany({ where: { projectId }, select: { title: true, contractForm: true, contractSum: true, completionDate: true, contractor: { select: { name: true } } }, take: 6 }),
    ]);

    const parents = new Set(acts.flatMap((a) => (a.parentId ? [a.parentId] : [])));
    const leaves = acts.filter((a) => !parents.has(a.id));
    const work = leaves.reduce((s, a) => s + Math.max(a.durationDays, 1), 0);
    const done = leaves.reduce((s, a) => s + (Math.max(a.durationDays, 1) * a.percentComplete) / 100, 0);
    const late = leaves.filter((a) => a.endDate < today && a.percentComplete < 100);
    const critical = leaves.filter((a) => a.isCriticalPath && a.percentComplete < 100).slice(0, 8);
    const coming = leaves.filter((a) => a.startDate >= today && a.startDate <= soon).slice(0, 8);
    const finish = acts.length ? new Date(Math.max(...acts.map((a) => a.endDate.getTime()))) : null;
    const terms = contractTerms(p.contractForm);
    const line = (label: string, items: string[], none = 'none') => `${label}:${items.length ? `\n${items.map((i) => `- ${i}`).join('\n')}` : ` ${none}`}`;

    return [
      `Project: ${p.name}${p.projectCode ? ` (${p.projectCode})` : ''}. Today on site is ${fmt(today)}.`,
      `Stage ${p.stage}; ${rulesFor(p.country).name}${p.location ? `, ${p.location}` : ''}; client ${p.client ?? 'not recorded'}; ${p.currency}${money && p.value ? ` ${p.value.toLocaleString('en-ZA')}` : ''}; planned ${fmt(p.startDate)} to ${fmt(p.endDate)}.`,
      `Form of contract: ${p.contractForm ?? 'not set'}. Its usual periods (calendar days): delay notice within ${terms.noticeWithinDays} of the event, detailed claim within ${terms.claimWithinDays} of the notice, assessment within ${terms.assessWithinDays}; certify within ${terms.certifyWithinDays}, pay within ${terms.payWithinDays}; defects period ${terms.defectsPeriodDays}. The PM is titled ${terms.pmTitle}.`,
      acts.length
        ? `Programme: ${leaves.length} activities, ${work ? Math.round((done / work) * 100) : 0}% complete by duration, forecast finish ${fmt(finish)}.`
        : 'Programme: no activities yet.',
      line('Late (past their finish, not complete)', late.slice(0, 8).map((a) => `${a.name}, due ${fmt(a.endDate)}, ${a.percentComplete}%${a.contractor ? `, ${a.contractor.name}` : ''}`)),
      line('On the critical path, not complete', critical.map((a) => `${a.name}, ${fmt(a.startDate)} to ${fmt(a.endDate)}, ${a.percentComplete}%`)),
      line('Starting in the next two weeks', coming.map((a) => `${a.name}, from ${fmt(a.startDate)}${a.contractor ? `, ${a.contractor.name}` : ''}`)),
      line('Open RFIs', rfis.map((r) => `${r.rfiNumber} ${r.title}, ${r.priority.toLowerCase()}${r.dueDate ? `, reply due ${fmt(r.dueDate)}${r.dueDate < today ? ' (overdue)' : ''}` : ''}`)),
      line('Open issues', issues.map((i) => `${i.title}, ${i.priority.toLowerCase()}${i.dueDate ? `, due ${fmt(i.dueDate)}` : ''}`)),
      line('Highest risks (probability x impact)', risks.sort((a, b) => b.probability * b.impact - a.probability * a.impact).slice(0, 5).map((r) => `${r.title}, score ${r.probability * r.impact}`)),
      line('Latest instructions and letters', letters.map((l) => `${l.number} ${l.kind.toLowerCase()}: ${l.subject} (${l.status.toLowerCase()}, ${fmt(l.createdAt)})`)),
      line('Open NCRs', ncrs.map((n) => `${n.number} ${n.title}, ${n.severity.toLowerCase()}${n.dueDate ? `, due ${fmt(n.dueDate)}` : ''}`)),
      line('Open HSE incidents', incidents.map((i) => `${i.number} ${i.title}, ${i.severity.toLowerCase().replace('_', ' ')}`)),
      line('Live permits to work', permits.map((w) => `${w.number} ${w.title}, ${w.status.toLowerCase()}, until ${fmt(w.validTo)}`)),
      // Due dates worked out by the platform: a small model gets date
      // arithmetic wrong, so it is never asked to do it.
      line(
        'Delay and EOT claims',
        claims.map(
          (c) =>
            `${c.number} ${c.title}, ${c.status.toLowerCase().replace('_', ' ')}; event ${fmt(c.eventStartedAt)}, notice given ${fmt(c.notifiedAt)}${c.lateNoticeDays ? ` (${c.lateNoticeDays} days late)` : ''}; ${c.submittedAt ? `detailed claim submitted ${fmt(c.submittedAt)}${c.requestedDays != null ? ` for ${c.requestedDays} days` : ''}${c.assessDueAt ? `, assessment due ${fmt(c.assessDueAt)}` : ''}` : `detailed claim due ${fmt(c.claimDueAt)}${c.claimDueAt < today ? ' (overdue)' : ''}`}${c.grantedDays != null ? `; ${c.grantedDays} days granted` : ''}`,
        ),
      ),
      `Open defects: ${defects}. Handover documents: ${handover.length ? handover.map((h) => `${h._count} ${h.status.toLowerCase().replace('_', ' ')}`).join(', ') : 'none set up'}.`,
      line('Contracts', contracts.map((k) => `${k.title} with ${k.contractor.name}, ${k.contractForm ?? p.contractForm ?? 'form not set'}${money ? `, ${p.currency} ${k.contractSum.toLocaleString('en-ZA')}` : ''}, completion ${fmt(k.completionDate)}`)),
    ].join('\n');
  }
}
