import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { InternalOnlyGuard } from '../auth/guards/internal-only.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { InceptionService } from './inception.service.js';
import { DeliverablesService } from './deliverables.service.js';
import { RegistersService } from './registers.service.js';
import {
  CreateAdviceDto,
  DecideDeliverableDto,
  DeliverableActionDto,
  GenerateProgrammeDto,
  MyAppointmentDto,
  ResponsibilityCheckDto,
  UpdateAppointmentTermsDto,
  UpdateBriefDto,
  UpdateProcurementPolicyDto,
} from './dto/inception.dto.js';

/** PROCSA Stage 1 — Inception, everything under /projects/:id/inception. */
@Controller('projects/:projectId/inception')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class InceptionController {
  constructor(
    private readonly inception: InceptionService,
    private readonly deliverables: DeliverablesService,
    private readonly registers: RegistersService,
  ) {}

  @Get('deliverables')
  @RequirePermission('PROJECT_DEFINITION', 'VIEW')
  listDeliverables(@Param('projectId') projectId: string) {
    return this.deliverables.list(projectId);
  }

  // Setjeka (DM/PM) puts documents to the client, not the consultants.
  @Post('deliverables/:key/submit')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  submit(@Param('projectId') projectId: string, @Param('key') key: string, @Body() dto: DeliverableActionDto, @CurrentUser() user: JwtPayload) {
    return this.deliverables.submit(projectId, key, user.sub, dto.comment);
  }

  @Post('deliverables/:key/decide')
  @RequirePermission('PROJECT_DEFINITION', 'APPROVE')
  decide(@Param('projectId') projectId: string, @Param('key') key: string, @Body() dto: DecideDeliverableDto, @CurrentUser() user: JwtPayload) {
    return this.deliverables.decide(projectId, key, user.sub, dto.approve, dto.comment);
  }

  @Get('responsibilities')
  @RequirePermission('PROJECT_DEFINITION', 'VIEW')
  responsibilities(@Param('projectId') projectId: string) {
    return this.inception.responsibilities(projectId);
  }

  @Put('responsibilities/:roleKey/:code')
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  checkResponsibility(
    @Param('projectId') projectId: string,
    @Param('roleKey') roleKey: string,
    @Param('code') code: string,
    @Body() dto: ResponsibilityCheckDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inception.setResponsibility(projectId, user.sub, roleKey, code, true, dto.note);
  }

  @Delete('responsibilities/:roleKey/:code')
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  uncheckResponsibility(@Param('projectId') projectId: string, @Param('roleKey') roleKey: string, @Param('code') code: string, @CurrentUser() user: JwtPayload) {
    return this.inception.setResponsibility(projectId, user.sub, roleKey, code, false);
  }

  @Get('my-role')
  @RequirePermission('PROJECT_DEFINITION', 'VIEW')
  myRole(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.inception.myRole(projectId, user.sub);
  }

  // COMMENT, not EDIT: a consultant may shape their own appointment's scope
  // without holding Team-edit rights; the service checks it's their firm's.
  @Patch('my-appointments/:appointmentId')
  @RequirePermission('PROJECT_DEFINITION', 'COMMENT')
  updateMyAppointment(
    @Param('projectId') projectId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: MyAppointmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inception.updateMyAppointment(projectId, user.sub, appointmentId, dto);
  }

  @Post('my-appointments/:appointmentId/sign')
  @RequirePermission('PROJECT_DEFINITION', 'COMMENT')
  signMyAgreement(@Param('projectId') projectId: string, @Param('appointmentId') appointmentId: string, @CurrentUser() user: JwtPayload) {
    return this.inception.signMyAgreement(projectId, user.sub, appointmentId);
  }

  @Get('brief')
  @RequirePermission('PROJECT_DEFINITION', 'VIEW')
  getBrief(@Param('projectId') projectId: string) {
    return this.inception.getBrief(projectId);
  }

  @Put('brief')
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  updateBrief(@Param('projectId') projectId: string, @Body() dto: UpdateBriefDto, @CurrentUser() user: JwtPayload) {
    return this.inception.updateBrief(projectId, user.sub, dto);
  }

  @Get('procurement-policy')
  @RequirePermission('PROJECT_DEFINITION', 'VIEW')
  getPolicy(@Param('projectId') projectId: string) {
    return this.inception.getPolicy(projectId);
  }

  // DM 1.5 / PM 1.2 establish it; consultants advise on it (1.3) via advice.
  @Put('procurement-policy')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  updatePolicy(@Param('projectId') projectId: string, @Body() dto: UpdateProcurementPolicyDto, @CurrentUser() user: JwtPayload) {
    return this.inception.updatePolicy(projectId, user.sub, dto);
  }

  @Get('advice')
  @RequirePermission('PROJECT_DEFINITION', 'VIEW')
  listAdvice(@Param('projectId') projectId: string) {
    return this.inception.listAdvice(projectId);
  }

  // COMMENT, not CREATE: advising is how consultants take part, and every
  // role that can comment on the project can record advice.
  @Post('advice')
  @RequirePermission('PROJECT_DEFINITION', 'COMMENT')
  addAdvice(@Param('projectId') projectId: string, @Body() dto: CreateAdviceDto, @CurrentUser() user: JwtPayload) {
    return this.inception.addAdvice(projectId, user.sub, dto);
  }

  @Delete('advice/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROJECT_DEFINITION', 'COMMENT')
  removeAdvice(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.inception.removeAdvice(projectId, user.sub, id);
  }

  @Post('viability/:id/prefer')
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  async prefer(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.inception.preferScenario(projectId, user.sub, id);
    return this.registers.findAll(projectId, 'viability');
  }

  @Post('initiation-programme')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('SCHEDULE', 'CREATE')
  generateProgramme(@Param('projectId') projectId: string, @Body() dto: GenerateProgrammeDto, @CurrentUser() user: JwtPayload) {
    return this.inception.generateProgramme(projectId, user.sub, dto.startDate);
  }

  @Get('professional-team')
  @RequirePermission('TEAM', 'VIEW')
  professionalTeam(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.inception.professionalTeam(projectId, user.sub);
  }

  @Patch('appointments/:appointmentId')
  @RequirePermission('TEAM', 'EDIT')
  updateTerms(
    @Param('projectId') projectId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: UpdateAppointmentTermsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inception.updateAppointmentTerms(projectId, user.sub, appointmentId, dto);
  }

  // Confirming or releasing an indicative Stage 0 pick is Setjeka's call.
  @Post('appointments/:appointmentId/confirm')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('TEAM', 'EDIT')
  confirmIndicative(@Param('projectId') projectId: string, @Param('appointmentId') appointmentId: string, @CurrentUser() user: JwtPayload) {
    return this.inception.confirmIndicative(projectId, user.sub, appointmentId);
  }

  @Post('appointments/:appointmentId/release')
  @UseGuards(InternalOnlyGuard)
  @RequirePermission('TEAM', 'EDIT')
  releaseIndicative(@Param('projectId') projectId: string, @Param('appointmentId') appointmentId: string, @CurrentUser() user: JwtPayload) {
    return this.inception.releaseIndicative(projectId, user.sub, appointmentId);
  }

  @Post('milestones/template')
  @RequirePermission('PROJECT_DEFINITION', 'CREATE')
  milestoneTemplate(@Param('projectId') projectId: string) {
    return this.registers.addMilestoneTemplate(projectId);
  }

  @Post('milestones/baseline')
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  baselineMilestones(@Param('projectId') projectId: string) {
    return this.registers.baselineMilestones(projectId);
  }

  // Generic registers last, so the literal routes above win.
  @Get(':register')
  @RequirePermission('PROJECT_DEFINITION', 'VIEW')
  listRegister(@Param('projectId') projectId: string, @Param('register') register: string) {
    return this.registers.findAll(projectId, register);
  }

  @Post(':register')
  @RequirePermission('PROJECT_DEFINITION', 'CREATE')
  createInRegister(@Param('projectId') projectId: string, @Param('register') register: string, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtPayload) {
    return this.registers.create(projectId, register, user.sub, body);
  }

  @Patch(':register/:id')
  @RequirePermission('PROJECT_DEFINITION', 'EDIT')
  updateInRegister(
    @Param('projectId') projectId: string,
    @Param('register') register: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.registers.update(projectId, register, id, user.sub, body);
  }

  @Delete(':register/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('PROJECT_DEFINITION', 'DELETE')
  removeFromRegister(@Param('projectId') projectId: string, @Param('register') register: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.registers.remove(projectId, register, id, user.sub);
  }
}
