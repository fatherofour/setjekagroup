import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../jwt-payload.js';

/** Gates Administration-only routes (user management, the permission
 * matrix, the audit log). Must run after JwtAccessGuard so `request.user`
 * is populated. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    if (request.user?.role !== 'ADMIN') throw new ForbiddenException('Administrator access required');
    return true;
  }
}
