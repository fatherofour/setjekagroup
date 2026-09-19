import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContractorsService } from '../contractors/contractors.service.js';
import type { CreateContactDto } from './dto/create-contact.dto.js';
import type { UpdateContactDto } from './dto/update-contact.dto.js';

@Injectable()
export class OrganisationContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractorsService: ContractorsService,
  ) {}

  async findAll(contractorId: string) {
    await this.contractorsService.assertExists(contractorId);
    return this.prisma.organisationContact.findMany({
      where: { contractorId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(contractorId: string, dto: CreateContactDto) {
    await this.contractorsService.assertExists(contractorId);
    return this.prisma.organisationContact.create({
      data: {
        contractorId,
        fullName: dto.fullName,
        jobTitle: dto.jobTitle,
        department: dto.department,
        email: dto.email,
        phone: dto.phone,
        mobile: dto.mobile,
        contactType: dto.contactType,
        isPrimary: dto.isPrimary ?? false,
        canReceiveRfqs: dto.canReceiveRfqs ?? false,
        canReceiveCorrespondence: dto.canReceiveCorrespondence ?? false,
        canReceivePaymentNotifications: dto.canReceivePaymentNotifications ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  private async findOwnedContact(contractorId: string, contactId: string) {
    const contact = await this.prisma.organisationContact.findFirst({ where: { id: contactId, contractorId } });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async update(contractorId: string, contactId: string, dto: UpdateContactDto) {
    await this.findOwnedContact(contractorId, contactId);
    return this.prisma.organisationContact.update({
      where: { id: contactId },
      data: {
        fullName: dto.fullName,
        jobTitle: dto.jobTitle,
        department: dto.department,
        email: dto.email,
        phone: dto.phone,
        mobile: dto.mobile,
        contactType: dto.contactType,
        isPrimary: dto.isPrimary,
        canReceiveRfqs: dto.canReceiveRfqs,
        canReceiveCorrespondence: dto.canReceiveCorrespondence,
        canReceivePaymentNotifications: dto.canReceivePaymentNotifications,
        isActive: dto.isActive,
      },
    });
  }

  async remove(contractorId: string, contactId: string) {
    await this.findOwnedContact(contractorId, contactId);
    await this.prisma.organisationContact.delete({ where: { id: contactId } });
  }
}
