import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.js';
import { PermissionsGuard } from '../permissions/guards/permissions.guard.js';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator.js';
import { DefectsService } from './defects.service.js';
import { CertifyCompletionDto, DefectCommentDto, DefectDto, DefectReasonDto, DefectsPeriodDto } from './dto/defects.dto.js';

// Completion and defects sit with instructions and letters in the
// permission matrix, as delay claims do, so the contractor and the client
// can read and write there. The service decides who certifies, lists,
// puts right and verifies.
@Controller('projects/:projectId/defects')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class DefectsController {
  constructor(private readonly defects: DefectsService) {}

  @Get('contracts')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  contracts(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.defects.contracts(projectId, user.sub);
  }

  @Post('contracts/:contractId/certify')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  certify(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Body() dto: CertifyCompletionDto, @CurrentUser() user: JwtPayload) {
    return this.defects.certify(projectId, user.sub, contractId, dto.stage, dto.date);
  }

  @Put('contracts/:contractId/period')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  setPeriod(@Param('projectId') projectId: string, @Param('contractId') contractId: string, @Body() dto: DefectsPeriodDto, @CurrentUser() user: JwtPayload) {
    return this.defects.setPeriod(projectId, user.sub, contractId, dto.defectsPeriodDays);
  }

  @Get()
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  list(@Param('projectId') projectId: string, @CurrentUser() user: JwtPayload) {
    return this.defects.list(projectId, user.sub);
  }

  @Get(':id')
  @RequirePermission('COMMUNICATIONS', 'VIEW')
  findOne(@Param('projectId') projectId: string, @Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.defects.findOne(projectId, user.sub, id);
  }

  @Post()
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  create(@Param('projectId') projectId: string, @Body() dto: DefectDto, @CurrentUser() user: JwtPayload) {
    return this.defects.create(projectId, user.sub, dto);
  }

  @Post(':id/issue')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  issue(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DefectCommentDto, @CurrentUser() user: JwtPayload) {
    return this.defects.issue(projectId, user.sub, id, dto.comment, dto.dueDate);
  }

  @Post(':id/decline')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  decline(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DefectReasonDto, @CurrentUser() user: JwtPayload) {
    return this.defects.decline(projectId, user.sub, id, dto.reason);
  }

  @Post(':id/rectify')
  @RequirePermission('COMMUNICATIONS', 'CREATE')
  rectify(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DefectCommentDto, @CurrentUser() user: JwtPayload) {
    return this.defects.rectify(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/verify')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  verify(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DefectCommentDto, @CurrentUser() user: JwtPayload) {
    return this.defects.verify(projectId, user.sub, id, dto.comment);
  }

  @Post(':id/reopen')
  @RequirePermission('COMMUNICATIONS', 'EDIT')
  reopen(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: DefectReasonDto, @CurrentUser() user: JwtPayload) {
    return this.defects.reopen(projectId, user.sub, id, dto.reason);
  }
}
