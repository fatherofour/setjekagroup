/** The register's "Executive" (DEV pipeline and approvals rows) is not a
 * project role: it's a Setjeka manager. An internal account with platform
 * role MANAGER or ADMIN counts as one. */
export function isExecutive(user: { role: string; accountType: string } | null | undefined): boolean {
  return Boolean(user && user.accountType === 'INTERNAL' && (user.role === 'MANAGER' || user.role === 'ADMIN'));
}
