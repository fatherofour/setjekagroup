import { SetMetadata } from '@nestjs/common';
import type { PermissionModule, PermissionAction } from '../../generated/prisma/enums.js';

export const PERMISSION_KEY = 'require_permission';

export interface RequiredPermission {
  module: PermissionModule;
  action: PermissionAction;
}

/** Marks a route as needing `action` on `module` for the project named by
 * its `:projectId` route param. Read by both PermissionsGuard (which
 * enforces it) and AuditLogInterceptor (which logs mutating routes that
 * carry it) - see permissions.guard.ts / audit-log.interceptor.ts. */
export const RequirePermission = (module: PermissionModule, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, { module, action } satisfies RequiredPermission);
