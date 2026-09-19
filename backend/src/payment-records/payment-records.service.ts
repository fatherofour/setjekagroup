import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContractorsService } from '../contractors/contractors.service.js';
import type { CreatePaymentRecordDto } from './dto/create-payment-record.dto.js';
import type { UpdatePaymentRecordDto } from './dto/update-payment-record.dto.js';

const INCLUDE = {
  appointment: { include: { project: { select: { id: true, name: true, projectCode: true } } } },
} as const;

@Injectable()
export class PaymentRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractorsService: ContractorsService,
  ) {}

  private async assertAppointmentBelongs(contractorId: string, appointmentId: string) {
    const appointment = await this.prisma.organisationProjectAppointment.findFirst({ where: { id: appointmentId, contractorId } });
    if (!appointment) throw new BadRequestException('Appointment not found for this contractor');
  }

  async findAll(contractorId: string) {
    await this.contractorsService.assertExists(contractorId);
    return this.prisma.paymentRecord.findMany({ where: { contractorId }, include: INCLUDE, orderBy: { paymentDate: 'desc' } });
  }

  async create(contractorId: string, recordedById: string, dto: CreatePaymentRecordDto) {
    await this.contractorsService.assertExists(contractorId);
    if (dto.appointmentId) await this.assertAppointmentBelongs(contractorId, dto.appointmentId);

    return this.prisma.paymentRecord.create({
      data: {
        contractorId,
        appointmentId: dto.appointmentId,
        amount: dto.amount,
        currency: dto.currency,
        paymentDate: new Date(dto.paymentDate),
        reference: dto.reference,
        method: dto.method,
        notes: dto.notes,
        recordedById,
      },
      include: INCLUDE,
    });
  }

  private async findOwnedRecord(contractorId: string, recordId: string) {
    const record = await this.prisma.paymentRecord.findFirst({ where: { id: recordId, contractorId } });
    if (!record) throw new NotFoundException('Payment record not found');
    return record;
  }

  async update(contractorId: string, recordId: string, dto: UpdatePaymentRecordDto) {
    await this.findOwnedRecord(contractorId, recordId);
    if (dto.appointmentId) await this.assertAppointmentBelongs(contractorId, dto.appointmentId);

    return this.prisma.paymentRecord.update({
      where: { id: recordId },
      data: {
        amount: dto.amount,
        currency: dto.currency,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        appointmentId: dto.appointmentId,
        reference: dto.reference,
        method: dto.method,
        notes: dto.notes,
      },
      include: INCLUDE,
    });
  }

  async remove(contractorId: string, recordId: string) {
    await this.findOwnedRecord(contractorId, recordId);
    await this.prisma.paymentRecord.delete({ where: { id: recordId } });
  }
}
