import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { uploadRootDir } from '../compliance-records/upload.util.js';

// What a Stage 0 file can be evidence for.
export const DOCUMENT_LINK_TYPES = ['APPROVAL', 'SITE', 'MARKET_RESEARCH', 'PAYMENT', 'BUSINESS_CASE'] as const;
export type DocumentLinkType = (typeof DOCUMENT_LINK_TYPES)[number];

const INCLUDE = { uploadedBy: { select: { fullName: true } } } as const;

/** Stage 0 evidence files (register DEV R11 "evidence"): approval letters,
 * land agreements, research reports, invoices. Stored on local disk like
 * compliance documents (UPLOAD_DIR); the record keeps the original name. */
@Injectable()
export class OpportunityDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(opportunityId: string) {
    return this.prisma.opportunityDocument.findMany({ where: { opportunityId }, include: INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  private async assertLink(opportunityId: string, linkType: string | undefined, linkId: string | undefined) {
    if (!linkType && !linkId) return;
    if (!linkType || !linkId || !(DOCUMENT_LINK_TYPES as readonly string[]).includes(linkType)) {
      throw new BadRequestException(`linkType must be one of ${DOCUMENT_LINK_TYPES.join(', ')} and come with a linkId`);
    }
    const where = { id: linkId, opportunityId };
    const found = await ({
      APPROVAL: () => this.prisma.opportunityApproval.count({ where }),
      SITE: () => this.prisma.opportunitySite.count({ where }),
      MARKET_RESEARCH: () => this.prisma.marketResearch.count({ where }),
      PAYMENT: () => this.prisma.opportunityPayment.count({ where }),
      BUSINESS_CASE: () => this.prisma.viabilityScenario.count({ where }),
    } as Record<string, () => Promise<number>>)[linkType]();
    if (!found) throw new BadRequestException('The linked record is not on this opportunity');
  }

  async upload(opportunityId: string, userId: string, file: Express.Multer.File, title?: string, linkType?: string, linkId?: string) {
    const discard = () => {
      const path = join(uploadRootDir(), file.filename);
      if (existsSync(path)) unlinkSync(path);
    };
    try {
      const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true } });
      if (!opportunity) throw new NotFoundException('Opportunity not found');
      await this.assertLink(opportunityId, linkType || undefined, linkId || undefined);
    } catch (err) {
      discard();
      throw err;
    }
    return this.prisma.opportunityDocument.create({
      data: {
        opportunityId,
        title: title?.trim() || file.originalname,
        linkType: linkType || null,
        linkId: linkId || null,
        storedName: file.filename,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: userId,
      },
      include: INCLUDE,
    });
  }

  async findOne(opportunityId: string, id: string) {
    const doc = await this.prisma.opportunityDocument.findFirst({ where: { id, opportunityId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async remove(opportunityId: string, id: string) {
    const doc = await this.findOne(opportunityId, id);
    await this.prisma.opportunityDocument.delete({ where: { id } });
    const path = join(uploadRootDir(), doc.storedName);
    if (existsSync(path)) unlinkSync(path);
  }
}
