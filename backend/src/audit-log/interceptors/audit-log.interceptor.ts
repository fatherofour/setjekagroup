import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from '../audit-log.service.js';
import { PERMISSION_KEY, type RequiredPermission } from '../../permissions/decorators/require-permission.decorator.js';
import type { JwtPayload } from '../../auth/jwt-payload.js';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Registered once, globally (see app.module.ts) - a no-op on any route
 * without `@RequirePermission` metadata, so no controller needs touching
 * beyond adding that decorator for permission enforcement itself. Logs
 * after a mutating request succeeds; a logging failure never fails the
 * request it's observing. */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.get<RequiredPermission>(PERMISSION_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (!required || !MUTATING_METHODS.has(request.method) || !request.user) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        const entityId = request.params.id
          ? String(request.params.id)
          : body && typeof body === 'object' && 'id' in body
            ? String((body as { id: unknown }).id)
            : null;
        this.auditLogService
          .log({
            userId: request.user!.sub,
            action: required.action,
            module: required.module,
            entityId,
            projectId: request.params.projectId ? String(request.params.projectId) : null,
          })
          .catch((err) => this.logger.warn(`Failed to write audit log entry: ${err}`));
      }),
    );
  }
}
