import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor.js';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogInterceptor],
  exports: [AuditLogService, AuditLogInterceptor],
})
export class AuditLogModule {}
