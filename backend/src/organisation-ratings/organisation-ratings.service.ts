import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContractorsService } from '../contractors/contractors.service.js';
import type { CreateRatingDto } from './dto/create-rating.dto.js';
import type { UpdateRatingDto } from './dto/update-rating.dto.js';

const INCLUDE = {
  appointment: { include: { project: { select: { id: true, name: true, projectCode: true } } } },
  recordedBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class OrganisationRatingsService {
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
    return this.prisma.organisationRating.findMany({ where: { contractorId }, include: INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async create(contractorId: string, recordedById: string, dto: CreateRatingDto) {
    await this.contractorsService.assertExists(contractorId);
    await this.assertAppointmentBelongs(contractorId, dto.appointmentId);

    return this.prisma.organisationRating.create({
      data: {
        contractorId,
        appointmentId: dto.appointmentId,
        raterType: dto.raterType,
        stars: dto.stars,
        comment: dto.comment,
        recordedById,
      },
      include: INCLUDE,
    });
  }

  private async findOwnedRating(contractorId: string, ratingId: string) {
    const rating = await this.prisma.organisationRating.findFirst({ where: { id: ratingId, contractorId } });
    if (!rating) throw new NotFoundException('Rating not found');
    return rating;
  }

  async update(contractorId: string, ratingId: string, dto: UpdateRatingDto) {
    await this.findOwnedRating(contractorId, ratingId);
    return this.prisma.organisationRating.update({
      where: { id: ratingId },
      data: { raterType: dto.raterType, stars: dto.stars, comment: dto.comment },
      include: INCLUDE,
    });
  }

  async remove(contractorId: string, ratingId: string) {
    await this.findOwnedRating(contractorId, ratingId);
    await this.prisma.organisationRating.delete({ where: { id: ratingId } });
  }
}
