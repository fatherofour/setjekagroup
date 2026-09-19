import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContractorsService } from '../contractors/contractors.service.js';
import type { CreateComplianceRecordDto } from './dto/create-compliance-record.dto.js';
import type { UpdateComplianceRecordDto } from './dto/update-compliance-record.dto.js';
import type { ComplianceRecord } from '../generated/prisma/client.js';
import { computeComplianceStatus } from './compliance-status.util.js';
import { uploadRootDir } from './upload.util.js';

function withComputedStatus<T extends ComplianceRecord>(record: T) {
  return { ...record, computedStatus: computeComplianceStatus(record) };
}

function assertDateOrder(issueDate?: string, expiryDate?: string) {
  if (issueDate && expiryDate && new Date(expiryDate) < new Date(issueDate)) {
    throw new BadRequestException('Expiry date cannot precede issue date');
  }
}

async function deleteStoredFile(storedName: string | null) {
  if (!storedName) return;
  try {
    await unlink(join(uploadRootDir(), storedName));
  } catch {
    // Already gone or never existed on disk — not worth failing the request over.
  }
}

@Injectable()
export class ComplianceRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractorsService: ContractorsService,
  ) {}

  async findAll(contractorId: string) {
    await this.contractorsService.assertExists(contractorId);
    const records = await this.prisma.complianceRecord.findMany({
      where: { contractorId },
      orderBy: { expiryDate: 'asc' },
    });
    return records.map(withComputedStatus);
  }

  async create(contractorId: string, dto: CreateComplianceRecordDto) {
    await this.contractorsService.assertExists(contractorId);
    assertDateOrder(dto.issueDate, dto.expiryDate);
    const record = await this.prisma.complianceRecord.create({
      data: {
        contractorId,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
        issuingAuthority: dto.issuingAuthority,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        verificationStatus: dto.verificationStatus,
        notes: dto.notes,
      },
    });
    return withComputedStatus(record);
  }

  async findOwnedRecord(contractorId: string, recordId: string) {
    const record = await this.prisma.complianceRecord.findFirst({ where: { id: recordId, contractorId } });
    if (!record) throw new NotFoundException('Compliance record not found');
    return record;
  }

  async update(contractorId: string, recordId: string, dto: UpdateComplianceRecordDto, verifiedById?: string) {
    const existing = await this.findOwnedRecord(contractorId, recordId);
    const nextIssueDate = dto.issueDate ?? existing.issueDate?.toISOString();
    const nextExpiryDate = dto.expiryDate ?? existing.expiryDate?.toISOString();
    assertDateOrder(nextIssueDate, nextExpiryDate);

    const verificationChanged = dto.verificationStatus && dto.verificationStatus !== existing.verificationStatus;

    const record = await this.prisma.complianceRecord.update({
      where: { id: recordId },
      data: {
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
        issuingAuthority: dto.issuingAuthority,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        verificationStatus: dto.verificationStatus,
        notes: dto.notes,
        verifiedById: verificationChanged ? verifiedById : undefined,
        verifiedAt: verificationChanged ? new Date() : undefined,
      },
    });
    return withComputedStatus(record);
  }

  async remove(contractorId: string, recordId: string) {
    const record = await this.findOwnedRecord(contractorId, recordId);
    await this.prisma.complianceRecord.delete({ where: { id: recordId } });
    await deleteStoredFile(record.attachmentStoredName);
  }

  async attachDocument(contractorId: string, recordId: string, file: Express.Multer.File) {
    const existing = await this.findOwnedRecord(contractorId, recordId);
    // multer's diskStorage (configured on the controller's interceptor) has
    // already written the file to disk under file.filename by this point.
    await deleteStoredFile(existing.attachmentStoredName);

    const record = await this.prisma.complianceRecord.update({
      where: { id: recordId },
      data: {
        attachmentStoredName: file.filename,
        attachmentFilename: file.originalname,
        attachmentMimeType: file.mimetype,
        attachmentSize: file.size,
      },
    });
    return withComputedStatus(record);
  }

  async removeDocument(contractorId: string, recordId: string) {
    const existing = await this.findOwnedRecord(contractorId, recordId);
    await deleteStoredFile(existing.attachmentStoredName);
    const record = await this.prisma.complianceRecord.update({
      where: { id: recordId },
      data: { attachmentStoredName: null, attachmentFilename: null, attachmentMimeType: null, attachmentSize: null },
    });
    return withComputedStatus(record);
  }
}
