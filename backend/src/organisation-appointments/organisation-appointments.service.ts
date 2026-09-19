import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContractorsService } from '../contractors/contractors.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import type { UpdateAppointmentDto } from './dto/update-appointment.dto.js';

const APPOINTMENT_INCLUDE = {
  project: { select: { id: true, name: true, projectCode: true } },
} as const;

@Injectable()
export class OrganisationAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractorsService: ContractorsService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findAll(contractorId: string) {
    await this.contractorsService.assertExists(contractorId);
    return this.prisma.organisationProjectAppointment.findMany({
      where: { contractorId },
      include: APPOINTMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(contractorId: string, ownerId: string, dto: CreateAppointmentDto) {
    await this.contractorsService.assertExists(contractorId);
    await this.projectsService.findOneForOwner(dto.projectId, ownerId);

    return this.prisma.organisationProjectAppointment.create({
      data: {
        contractorId,
        projectId: dto.projectId,
        role: dto.role,
        appointmentType: dto.appointmentType,
        appointmentDate: dto.appointmentDate ? new Date(dto.appointmentDate) : undefined,
        appointmentReference: dto.appointmentReference,
        contractReference: dto.contractReference,
        contractValue: dto.contractValue,
        currency: dto.currency,
        scopeOfWork: dto.scopeOfWork,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        appointmentStatus: dto.appointmentStatus,
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  private async findOwnedAppointment(contractorId: string, appointmentId: string) {
    const appointment = await this.prisma.organisationProjectAppointment.findFirst({
      where: { id: appointmentId, contractorId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async update(contractorId: string, appointmentId: string, dto: UpdateAppointmentDto) {
    await this.findOwnedAppointment(contractorId, appointmentId);
    return this.prisma.organisationProjectAppointment.update({
      where: { id: appointmentId },
      data: {
        role: dto.role,
        appointmentType: dto.appointmentType,
        appointmentDate: dto.appointmentDate ? new Date(dto.appointmentDate) : undefined,
        appointmentReference: dto.appointmentReference,
        contractReference: dto.contractReference,
        contractValue: dto.contractValue,
        currency: dto.currency,
        scopeOfWork: dto.scopeOfWork,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        appointmentStatus: dto.appointmentStatus,
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  async remove(contractorId: string, appointmentId: string) {
    await this.findOwnedAppointment(contractorId, appointmentId);
    await this.prisma.organisationProjectAppointment.delete({ where: { id: appointmentId } });
  }
}
