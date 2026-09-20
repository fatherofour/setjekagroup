import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../jwt-payload.js';

/** Gates the shared Contractors/vendor directory and its sub-resources -
 * a company-wide directory, not project-scoped, so the module/action
 * permission matrix (which is keyed by a per-project ProjectMemberRole)
 * doesn't apply here. No register ask exists for external vendor-
 * directory access, so this stays a blanket internal-staff-only gate. */
@Injectable()
export class InternalOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (request.user?.role === 'ADMIN' || request.user?.accountType === 'INTERNAL') return true;
    throw new ForbiddenException('This area is restricted to internal staff');
  }
}
