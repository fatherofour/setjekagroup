import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateContractorDto } from './dto/create-contractor.dto.js';
import type { UpdateContractorDto } from './dto/update-contractor.dto.js';
import type { FindContractorsDto } from './dto/find-contractors.dto.js';
import type { UpdateStatusDto } from './dto/update-status.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { computeComplianceStatus } from '../compliance-records/compliance-status.util.js';

const DETAIL_INCLUDE = {
  contacts: { orderBy: { isPrimary: 'desc' } },
  complianceRecords: { orderBy: { expiryDate: 'asc' } },
  appointments: {
    include: { project: { select: { id: true, name: true, projectCode: true } } },
    orderBy: { createdAt: 'desc' },
  },
  statusHistory: { orderBy: { changedAt: 'desc' } },
} as const;

@Injectable()
export class ContractorsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: FindContractorsDto = {}) {
    const where: Prisma.ContractorWhereInput = {};
    if (filters.classification) where.classifications = { has: filters.classification };
    if (filters.discipline) where.disciplines = { has: filters.discipline };
    if (filters.registrationStatus) where.registrationStatus = filters.registrationStatus;
    if (filters.prequalificationStatus) where.prequalificationStatus = filters.prequalificationStatus;
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.country) where.country = { contains: filters.country, mode: 'insensitive' };
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };

    return this.prisma.contractor.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const contractor = await this.prisma.contractor.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!contractor) throw new NotFoundException('Contractor not found');
    return {
      ...contractor,
      complianceRecords: contractor.complianceRecords.map((record) => ({
        ...record,
        computedStatus: computeComplianceStatus(record),
      })),
    };
  }

  async assertExists(id: string) {
    const contractor = await this.prisma.contractor.findUnique({ where: { id }, select: { id: true } });
    if (!contractor) throw new NotFoundException('Contractor not found');
  }

  async checkDuplicate(name?: string, registrationNumber?: string, taxVatNumber?: string) {
    const or: Prisma.ContractorWhereInput[] = [];
    if (name?.trim()) or.push({ name: { equals: name.trim(), mode: 'insensitive' } });
    if (registrationNumber?.trim()) or.push({ registrationNumber: { equals: registrationNumber.trim(), mode: 'insensitive' } });
    if (taxVatNumber?.trim()) or.push({ taxVatNumber: { equals: taxVatNumber.trim(), mode: 'insensitive' } });
    if (or.length === 0) return [];

    return this.prisma.contractor.findMany({
      where: { OR: or },
      select: { id: true, name: true, registrationNumber: true, taxVatNumber: true },
      take: 5,
    });
  }

  async create(createdById: string, dto: CreateContractorDto) {
    try {
      return await this.prisma.contractor.create({
        data: {
          name: dto.name,
          tradingName: dto.tradingName,
          tradeType: dto.tradeType,
          disciplines: dto.disciplines ?? [],
          classifications: dto.classifications ?? [],
          registrationNumber: dto.registrationNumber,
          taxVatNumber: dto.taxVatNumber,
          country: dto.country,
          stateProvince: dto.stateProvince,
          city: dto.city,
          yearEstablished: dto.yearEstablished,
          website: dto.website,
          contactName: dto.contactName,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          notes: dto.notes,
          createdById,
        },
      });
    } catch (err) {
      throw this.mapUniqueConstraintError(err);
    }
  }

  private mapUniqueConstraintError(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('An organisation with that name already exists.');
    }
    return err;
  }

  async update(id: string, dto: UpdateContractorDto) {
    await this.findOne(id);
    try {
      return await this.prisma.contractor.update({
        where: { id },
        data: {
          name: dto.name,
          tradingName: dto.tradingName,
          tradeType: dto.tradeType,
          disciplines: dto.disciplines,
          classifications: dto.classifications,
          registrationNumber: dto.registrationNumber,
          taxVatNumber: dto.taxVatNumber,
          country: dto.country,
          stateProvince: dto.stateProvince,
          city: dto.city,
          yearEstablished: dto.yearEstablished,
          website: dto.website,
          contactName: dto.contactName,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          notes: dto.notes,
          bankName: dto.bankName,
          bankAccountName: dto.bankAccountName,
          bankAccountNumber: dto.bankAccountNumber,
          preferredPaymentMethod: dto.preferredPaymentMethod,
          paymentTerms: dto.paymentTerms,
          creditTerms: dto.creditTerms,
          withholdingTaxInfo: dto.withholdingTaxInfo,
        },
      });
    } catch (err) {
      throw this.mapUniqueConstraintError(err);
    }
  }

  async updateStatus(id: string, changedById: string, dto: UpdateStatusDto) {
    const contractor = await this.findOne(id);
    const historyEntries: Prisma.OrganisationStatusHistoryCreateManyInput[] = [];

    if (dto.registrationStatus && dto.registrationStatus !== contractor.registrationStatus) {
      historyEntries.push({
        contractorId: id,
        previousStatus: `registration:${contractor.registrationStatus}`,
        newStatus: `registration:${dto.registrationStatus}`,
        changedById,
        comment: dto.comment,
      });
    }
    if (dto.prequalificationStatus && dto.prequalificationStatus !== contractor.prequalificationStatus) {
      historyEntries.push({
        contractorId: id,
        previousStatus: `prequalification:${contractor.prequalificationStatus}`,
        newStatus: `prequalification:${dto.prequalificationStatus}`,
        changedById,
        comment: dto.comment,
      });
    }

    if (historyEntries.length === 0) return this.findOne(id);

    await this.prisma.$transaction([
      this.prisma.contractor.update({
        where: { id },
        data: { registrationStatus: dto.registrationStatus, prequalificationStatus: dto.prequalificationStatus },
      }),
      this.prisma.organisationStatusHistory.createMany({ data: historyEntries }),
    ]);

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    const usageCount = await this.prisma.projectMember.count({ where: { contractorId: id } });
    if (usageCount > 0) {
      throw new ConflictException(
        `This contractor is assigned to ${usageCount} project team ${usageCount === 1 ? 'entry' : 'entries'}. Remove it from those projects first.`,
      );
    }
    const appointmentCount = await this.prisma.organisationProjectAppointment.count({ where: { contractorId: id } });
    if (appointmentCount > 0) {
      throw new ConflictException(
        `This contractor has ${appointmentCount} project ${appointmentCount === 1 ? 'appointment' : 'appointments'}. Remove those first.`,
      );
    }
    await this.prisma.contractor.delete({ where: { id } });
  }
}
