import {
  LayoutDashboard,
  Sun,
  FolderKanban,
  Handshake,
  HardHat,
  GanttChart,
  FileText,
  ListChecks,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  ShieldCheck,
  Users,
  ScrollText,
  Lightbulb,
  Building2,
  DoorOpen,
  FileSignature,
  Stamp,
  ClipboardCheck,
  CalendarClock,
  Calculator,
  Database,
  Coins,
  type LucideIcon,
} from 'lucide-react';
import type { AuthUser } from '@/lib/auth-context';

// Who an entry is shown to. Internal = Setjeka staff (and admins); client /
// vendor = an external login tied to a client or a registered vendor. The
// API enforces all of this itself - this only keeps menus from offering
// screens that would just answer "forbidden".
export type NavAudience = 'internal' | 'client' | 'vendor';

export interface NavLeaf {
  label: string;
  href: string;
  icon: LucideIcon;
  // Resolved against the current project at render time (see Sidebar.tsx) —
  // `href` here is a fallback for when no project is selected yet.
  requiresProject?: boolean;
  // Appended to `/projects/<currentProjectId>` when requiresProject is set —
  // a path segment ("/schedule") for a dedicated page, or a query string
  // ("?tab=documents") to land on a specific tab of the project workspace.
  // Defaults to '' (the workspace's Overview tab).
  projectPathSuffix?: string;
  audience?: NavAudience;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
  // Hidden entirely unless the signed-in user's platform Role is ADMIN
  // (see Sidebar.tsx) - used for the Administration group only.
  adminOnly?: boolean;
  audience?: NavAudience;
}

export type NavEntry = NavLeaf | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

export function canSee(audience: NavAudience | undefined, user: AuthUser | null): boolean {
  if (!audience) return true;
  const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
  if (audience === 'internal') return internal;
  if (audience === 'client') return !internal && Boolean(user?.clientId);
  return !internal && Boolean(user?.contractorId);
}

export const NAV: NavEntry[] = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    children: [
      { label: 'My Day', href: '/my-day', icon: Sun },
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Approvals', href: '/approvals', icon: Stamp },
    ],
  },
  {
    label: 'Portal',
    icon: DoorOpen,
    children: [
      { label: 'My Projects', href: '/portal', icon: FolderKanban, audience: 'client' },
      { label: 'My Developments', href: '/portal/opportunities', icon: Lightbulb, audience: 'client' },
      { label: 'My RFQs', href: '/portal/rfqs', icon: FileSignature, audience: 'vendor' },
    ],
  },
  {
    label: 'Opportunities',
    icon: Lightbulb,
    audience: 'internal',
    children: [
      { label: 'All Opportunities', href: '/opportunities', icon: Lightbulb },
      { label: 'Clients', href: '/clients', icon: Building2 },
    ],
  },
  {
    label: 'Projects',
    icon: FolderKanban,
    children: [
      { label: 'Overview', href: '/projects', icon: FolderKanban },
      { label: 'Inception (Stage 1)', href: '/projects', icon: ClipboardCheck, requiresProject: true, projectPathSuffix: '?tab=inception' },
      { label: 'Meetings', href: '/projects', icon: CalendarClock, requiresProject: true, projectPathSuffix: '?tab=meetings' },
      { label: 'Schedule', href: '/projects', icon: GanttChart, requiresProject: true, projectPathSuffix: '/schedule' },
      { label: 'Tasks', href: '/projects', icon: ListChecks, requiresProject: true, projectPathSuffix: '?tab=tasks' },
      { label: 'Issues', href: '/projects', icon: AlertTriangle, requiresProject: true, projectPathSuffix: '?tab=issues' },
      { label: 'Risks', href: '/projects', icon: ShieldAlert, requiresProject: true, projectPathSuffix: '?tab=risks' },
      { label: 'Documents', href: '/projects', icon: FileText, requiresProject: true, projectPathSuffix: '?tab=documents' },
      { label: 'RFIs & Submittals', href: '/projects', icon: HelpCircle, requiresProject: true, projectPathSuffix: '?tab=technical' },
    ],
  },
  {
    label: 'Commercial',
    icon: Coins,
    audience: 'internal',
    children: [
      { label: 'Cost database', href: '/cost-database', icon: Database },
      { label: 'Estimates', href: '/estimates', icon: Calculator },
      { label: 'Project commercials', href: '/projects', icon: Coins, requiresProject: true, projectPathSuffix: '?tab=commercial' },
    ],
  },
  {
    label: 'Procurement',
    icon: Handshake,
    children: [
      { label: 'Contractors', href: '/contractors', icon: HardHat, audience: 'internal' },
      { label: 'RFQs & POs', href: '/projects', icon: Handshake, requiresProject: true, projectPathSuffix: '?tab=procurement' },
    ],
  },
  {
    label: 'Administration',
    icon: ShieldCheck,
    adminOnly: true,
    children: [
      { label: 'Users', href: '/administration?tab=users', icon: Users },
      { label: 'Permissions', href: '/administration?tab=permissions', icon: ShieldCheck },
      { label: 'Audit Log', href: '/administration?tab=audit-log', icon: ScrollText },
    ],
  },
];
