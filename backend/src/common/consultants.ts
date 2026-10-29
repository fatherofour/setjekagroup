import type { ProjectMemberRole } from '../generated/prisma/enums.js';

/** The design consultants (PROCSA): the architect and the engineers. Built
 * role by role; the architect on 2026-10-26, the engineers from 2026-10-29. */
export const ENGINEERS: ProjectMemberRole[] = ['CIVIL_ENGINEER', 'STRUCTURAL_ENGINEER', 'ELECTRICAL_ENGINEER', 'MECHANICAL_ENGINEER'];
export const DESIGN_CONSULTANTS: ProjectMemberRole[] = ['ARCHITECT', 'ARCHITECT_ENGINEER', ...ENGINEERS];

/** Who can be named on a contract to review its valuations: the architect
 * as principal agent, or the engineer for engineering works. */
export const CONTRACT_REVIEWERS: ProjectMemberRole[] = ['ARCHITECT', ...ENGINEERS];

export const ROLE_TITLE: Partial<Record<ProjectMemberRole, string>> = {
  ARCHITECT: 'architect',
  CIVIL_ENGINEER: 'civil engineer',
  STRUCTURAL_ENGINEER: 'structural engineer',
  ELECTRICAL_ENGINEER: 'electrical engineer',
  MECHANICAL_ENGINEER: 'mechanical engineer',
};

/** The team roles that act as a reviewing role. The legacy combined
 * architect-and-engineer role counts as either. */
export function holdersOf(role: ProjectMemberRole): ProjectMemberRole[] {
  return role === 'ARCHITECT_ENGINEER' ? [role] : [role, 'ARCHITECT_ENGINEER'];
}
