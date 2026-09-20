import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContractorsService } from '../contractors/contractors.service.js';
import type { CreateScorecardDto } from './dto/create-scorecard.dto.js';

const INCLUDE = {
  appointment: { include: { project: { select: { id: true, name: true, projectCode: true } } } },
  recordedBy: { select: { id: true, fullName: true } },
} as const;

function overallScore(s: { costScore: number; qualityScore: number; deliveryScore: number; safetyScore: number; documentationScore: number }) {
  return (s.costScore + s.qualityScore + s.deliveryScore + s.safetyScore + s.documentationScore) / 5;
}

@Injectable()
export class VendorScorecardsService {
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
    const scorecards = await this.prisma.vendorScorecard.findMany({
      where: { appointment: { contractorId } },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return scorecards.map((s) => ({ ...s, overallScore: overallScore(s) }));
  }

  async create(contractorId: string, recordedById: string, dto: CreateScorecardDto) {
    await this.contractorsService.assertExists(contractorId);
    await this.assertAppointmentBelongs(contractorId, dto.appointmentId);

    const scorecard = await this.prisma.vendorScorecard.create({
      data: {
        appointmentId: dto.appointmentId,
        costScore: dto.costScore,
        qualityScore: dto.qualityScore,
        deliveryScore: dto.deliveryScore,
        safetyScore: dto.safetyScore,
        documentationScore: dto.documentationScore,
        comment: dto.comment,
        recordedById,
      },
      include: INCLUDE,
    });
    return { ...scorecard, overallScore: overallScore(scorecard) };
  }
}
