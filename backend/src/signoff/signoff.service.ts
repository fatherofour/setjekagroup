import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { contractTerms } from '../common/contract-forms.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { ApprovalOutcome, ApprovalSubject, SignatureMethod } from '../generated/prisma/enums.js';
import { OUTCOME_LABEL, isApproval, type SignatureInputDto } from './dto/decision.dto.js';
import { certificate, stampedCopy, type SignOffDetails } from './pdf.js';

const MAX_SIGNATURE_BYTES = 1024 * 1024;
const PNG_PREFIX = 'data:image/png;base64,';

export const METHOD_LABEL: Record<SignatureMethod, string> = {
  ACCEPTED: 'Acceptance in the platform (no signature image)',
  DRAWN: 'Signature drawn on screen',
  TYPED: 'Name typed as a signature',
  UPLOADED: 'Uploaded signature image',
};

const ROLE_LABEL: Record<string, string> = {
  CLIENT: 'Client',
  DEVELOPMENT_MANAGER: 'Development Manager',
  PROJECT_MANAGER: 'Project Manager',
};

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface SignParams {
  projectId: string;
  subject: ApprovalSubject;
  subjectId: string;
  title: string;
  kind: string;
  outcome: ApprovalOutcome;
  comment?: string;
  signature?: SignatureInputDto;
  signerId: string;
  meta: RequestMeta;
  facts: [string, string][];
  /** The file being signed, when there is one; it's stamped if it can be. */
  source?: { path: string; mimeType: string };
}

export function signoffRootDir(sub: 'signatures' | 'signed'): string {
  const dir = join(process.env.SIGNOFF_DIR ?? './uploads/signoff', sub);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function decodePng(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(PNG_PREFIX)) throw new BadRequestException('The signature must be a PNG image');
  const bytes = Buffer.from(dataUrl.slice(PNG_PREFIX.length), 'base64');
  if (bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES) throw new BadRequestException('The signature image is empty or larger than 1 MB');
  // PNG signature bytes.
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new BadRequestException('The signature must be a PNG image');
  return bytes;
}

/** Electronic sign-off (App Review, 17 Oct 2026): every client decision is
 * recorded with the signer's own signature (drawn, typed in a handwriting
 * style, or uploaded) or, as an option, by acceptance alone, and the system
 * produces the signed document: the file itself stamped, or a sign-off
 * certificate. */
@Injectable()
export class SignoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  // ---- Saved signatures ----------------------------------------------------

  async mySignature(userId: string) {
    const s = await this.prisma.userSignature.findUnique({ where: { userId } });
    return s ? { method: s.method, updatedAt: s.updatedAt } : null;
  }

  async saveMySignature(userId: string, method: SignatureMethod, image: string) {
    if (method === 'ACCEPTED') throw new BadRequestException('Draw, type or upload a signature to save');
    const bytes = decodePng(image);
    const filename = `${randomUUID()}.png`;
    writeFileSync(join(signoffRootDir('signatures'), filename), bytes);
    await this.prisma.userSignature.upsert({ where: { userId }, create: { userId, method, filename }, update: { method, filename } });
    return this.mySignature(userId);
  }

  async deleteMySignature(userId: string) {
    await this.prisma.userSignature.deleteMany({ where: { userId } });
  }

  async mySignatureFile(userId: string) {
    const s = await this.prisma.userSignature.findUnique({ where: { userId } });
    const path = s ? join(signoffRootDir('signatures'), s.filename) : null;
    if (!path || !existsSync(path)) throw new NotFoundException('No saved signature');
    return path;
  }

  // ---- Signing -------------------------------------------------------------

  /** The signature for this decision as a stored PNG, or none for approval
   * by acceptance. */
  private async signatureFor(userId: string, input?: SignatureInputDto): Promise<{ method: SignatureMethod; filename: string | null; bytes?: Buffer }> {
    const method = input?.method ?? 'ACCEPTED';
    if (method === 'ACCEPTED') return { method, filename: null };
    if (input?.useSaved) {
      const saved = await this.prisma.userSignature.findUnique({ where: { userId } });
      const path = saved ? join(signoffRootDir('signatures'), saved.filename) : null;
      if (!saved || !path || !existsSync(path)) throw new BadRequestException('You have no saved signature yet');
      const filename = `${randomUUID()}.png`;
      copyFileSync(path, join(signoffRootDir('signatures'), filename));
      return { method: saved.method, filename, bytes: readFileSync(path) };
    }
    if (!input?.image) throw new BadRequestException('Sign, or choose to approve by acceptance');
    const bytes = decodePng(input.image);
    const filename = `${randomUUID()}.png`;
    writeFileSync(join(signoffRootDir('signatures'), filename), bytes);
    if (input.saveForNextTime) {
      const keep = `${randomUUID()}.png`;
      writeFileSync(join(signoffRootDir('signatures'), keep), bytes);
      await this.prisma.userSignature.upsert({ where: { userId }, create: { userId, method, filename: keep }, update: { method, filename: keep } });
    }
    return { method, filename, bytes };
  }

  /** Writes the decision record and its signed document. Call after the
   * decision itself has been validated. */
  async sign(p: SignParams) {
    const [signer, member, project] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: p.signerId }, select: { fullName: true, accountType: true } }),
      this.prisma.projectMember.findFirst({ where: { projectId: p.projectId, userId: p.signerId }, select: { role: true } }),
      this.prisma.project.findUniqueOrThrow({ where: { id: p.projectId }, select: { name: true, projectCode: true, contractForm: true } }),
    ]);
    const sig = await this.signatureFor(p.signerId, p.signature);
    const id = randomUUID();
    const signedAt = new Date();
    const roleLabel = (role: string) => (role === 'PROJECT_MANAGER' ? contractTerms(project.contractForm).pmTitle : (ROLE_LABEL[role] ?? role.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())));
    const signerRole = member ? roleLabel(member.role) : signer.accountType === 'INTERNAL' ? 'Setjeka' : undefined;
    const details: SignOffDetails = {
      projectName: project.projectCode ? `${project.name} (${project.projectCode})` : project.name,
      title: p.title,
      kind: p.kind,
      outcomeLabel: OUTCOME_LABEL[p.outcome],
      approved: isApproval(p.outcome),
      comment: p.comment,
      signerName: signer.fullName,
      signerRole,
      signedAt,
      methodLabel: METHOD_LABEL[sig.method],
      signature: sig.bytes ? new Uint8Array(sig.bytes) : undefined,
      recordId: id,
      ipAddress: p.meta.ip,
      facts: p.facts,
    };

    let pdf: Uint8Array | null = null;
    if (p.source && existsSync(p.source.path)) pdf = await stampedCopy(new Uint8Array(readFileSync(p.source.path)), p.source.mimeType, details);
    if (!pdf) pdf = await certificate(details);
    const signedFilename = `${id}.pdf`;
    writeFileSync(join(signoffRootDir('signed'), signedFilename), pdf);

    return this.prisma.approvalRecord.create({
      data: {
        id,
        projectId: p.projectId,
        subject: p.subject,
        subjectId: p.subjectId,
        title: p.title,
        outcome: p.outcome,
        comment: p.comment,
        method: sig.method,
        signatureFilename: sig.filename,
        signerId: p.signerId,
        signerName: signer.fullName,
        signerRole,
        signedAt,
        ipAddress: p.meta.ip?.slice(0, 64),
        userAgent: p.meta.userAgent?.slice(0, 300),
        signedFilename,
        signedSha256: createHash('sha256').update(pdf).digest('hex'),
      },
    });
  }

  // ---- Reading back --------------------------------------------------------

  /** Setjeka staff and the client see every record; consultants and
   * contractors see the signed documents and stage moves (they work from
   * the signed drawings), not variations or Stage 1 sign-offs. */
  private async visibleSubjects(projectId: string, userId: string): Promise<ApprovalSubject[] | null> {
    await this.projects.findOneForOwner(projectId, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, accountType: true } });
    if (user?.role === 'ADMIN' || user?.accountType === 'INTERNAL') return null;
    if (await this.prisma.projectMember.findFirst({ where: { projectId, userId, role: 'CLIENT' } })) return null;
    return ['DOCUMENT_REVISION', 'STAGE_TRANSITION', 'REGISTER_ENTRY', 'PAYMENT_CERTIFICATE'];
  }

  async list(projectId: string, userId: string, subject?: ApprovalSubject, subjectId?: string) {
    const allowed = await this.visibleSubjects(projectId, userId);
    if (subject && allowed && !allowed.includes(subject)) return [];
    return this.prisma.approvalRecord.findMany({
      where: { projectId, ...(subject ? { subject } : allowed ? { subject: { in: allowed } } : {}), ...(subjectId ? { subjectId } : {}) },
      orderBy: { signedAt: 'desc' },
      select: { id: true, subject: true, subjectId: true, title: true, outcome: true, comment: true, method: true, signerName: true, signerRole: true, signedAt: true, signedSha256: true },
    });
  }

  async signedFile(projectId: string, userId: string, id: string) {
    const allowed = await this.visibleSubjects(projectId, userId);
    const r = await this.prisma.approvalRecord.findFirst({ where: { id, projectId } });
    if (!r?.signedFilename || (allowed && !allowed.includes(r.subject))) throw new NotFoundException('Signed document not found');
    const path = join(signoffRootDir('signed'), r.signedFilename);
    if (!existsSync(path)) throw new NotFoundException('Signed document is missing');
    const safeTitle = r.title.replace(/[^\w\- ().]+/g, '').slice(0, 80) || 'signed';
    return { path, filename: `${safeTitle} - ${OUTCOME_LABEL[r.outcome]}.pdf` };
  }
}
