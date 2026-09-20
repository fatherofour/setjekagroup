import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PermissionsService } from '../permissions.service.js';
import { PERMISSION_KEY, type RequiredPermission } from '../decorators/require-permission.decorator.js';
import type { JwtPayload } from '../../auth/jwt-payload.js';

/** Enforces `@RequirePermission(module, action)` on a route. A route with
 * no such metadata is unaffected (this guard only adds a check on top of
 * whatever guards a controller already declares - it never replaces
 * JwtAccessGuard, which must run first to populate `request.user`).
 * `recordId` is read from the route's `:id` param, matching this app's
 * convention of `:id` for the resource itself on nested-resource routes. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission>(PERMISSION_KEY, context.getHandler());
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const projectId = String(request.params.projectId);
    const recordId = request.params.id ? String(request.params.id) : undefined;

    const allowed = await this.permissionsService.can(
      request.user.role,
      request.user.accountType,
      request.user.sub,
      projectId,
      required.module,
      required.action,
      recordId,
    );
    if (!allowed) {
      throw new ForbiddenException(`You do not have ${required.action} permission on ${required.module}`);
    }
    return true;
  }
}
