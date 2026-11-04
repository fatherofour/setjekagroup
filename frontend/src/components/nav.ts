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
  FlaskConical,
  EyeOff,
  Waypoints,
  BadgeCheck,
  FolderCheck,
  BookOpenText,
  CalendarRange,
  Tractor,
  TrendingUp,
  Ruler,
  HelpCircle,
  ShieldCheck,
  Users,
  ScrollText,
  Lightbulb,
  Building2,
  DoorOpen,
  FileSignature,
  Stamp,
  Layers,
  ClipboardCheck,
  CalendarClock,
  Calculator,
  Database,
  Coins,
  Camera,
  Bell,
  ListTodo,
  ClipboardList,
  Presentation,
  PenTool,
  Landmark,
  Mail,
  SearchCheck,
  Box,
  Trash2,
  FileSearch,
  ListX,
  Network,
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
      { label: 'Notifications', href: '/notifications', icon: Bell },
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Portfolio', href: '/portfolio', icon: Layers, audience: 'internal' },
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
      { label: 'PROCSA tracker', href: '/projects', icon: ListTodo, requiresProject: true, projectPathSuffix: '?tab=procsa' },
      { label: 'Registers', href: '/projects', icon: ClipboardList, requiresProject: true, projectPathSuffix: '?tab=registers' },
      { label: 'Reports', href: '/projects', icon: Presentation, requiresProject: true, projectPathSuffix: '?tab=reports' },
      { label: 'Meetings', href: '/projects', icon: CalendarClock, requiresProject: true, projectPathSuffix: '?tab=meetings' },
      { label: 'Schedule', href: '/projects', icon: GanttChart, requiresProject: true, projectPathSuffix: '/schedule' },
      { label: 'Tasks', href: '/projects', icon: ListChecks, requiresProject: true, projectPathSuffix: '?tab=tasks' },
      { label: 'Issues', href: '/projects', icon: AlertTriangle, requiresProject: true, projectPathSuffix: '?tab=issues' },
      { label: 'Risks', href: '/projects', icon: ShieldAlert, requiresProject: true, projectPathSuffix: '?tab=risks' },
      { label: 'Documents', href: '/projects', icon: FileText, requiresProject: true, projectPathSuffix: '?tab=documents' },
      { label: 'Search documents', href: '/search', icon: FileSearch },
      { label: 'Site photos', href: '/projects', icon: Camera, requiresProject: true, projectPathSuffix: '?tab=photos' },
      { label: 'RFIs & Submittals', href: '/projects', icon: HelpCircle, requiresProject: true, projectPathSuffix: '?tab=technical' },
    ],
  },
  {
    // The architect's working set (26 Oct 2026), used by Setjeka too.
    label: 'Design & site',
    icon: PenTool,
    children: [
      { label: 'Drawings', href: '/projects', icon: PenTool, requiresProject: true, projectPathSuffix: '?tab=drawings' },
      { label: 'Models', href: '/projects', icon: Box, requiresProject: true, projectPathSuffix: '?tab=models' },
      { label: 'BIM hub', href: '/projects', icon: Network, requiresProject: true, projectPathSuffix: '?tab=bim' },
      { label: 'Authorities', href: '/projects', icon: Landmark, requiresProject: true, projectPathSuffix: '?tab=authorities' },
      { label: 'Instructions', href: '/projects', icon: Mail, requiresProject: true, projectPathSuffix: '?tab=instructions' },
      { label: 'Delays & EOT', href: '/projects', icon: CalendarClock, requiresProject: true, projectPathSuffix: '?tab=eot' },
      { label: 'Inspections', href: '/projects', icon: SearchCheck, requiresProject: true, projectPathSuffix: '?tab=inspections' },
      { label: 'NCRs', href: '/projects', icon: ShieldAlert, requiresProject: true, projectPathSuffix: '?tab=ncrs' },
      { label: 'Tests & hold points', href: '/projects', icon: FlaskConical, requiresProject: true, projectPathSuffix: '?tab=tests' },
      { label: 'Hidden works', href: '/projects', icon: EyeOff, requiresProject: true, projectPathSuffix: '?tab=hidden' },
      { label: 'Interfaces', href: '/projects', icon: Waypoints, requiresProject: true, projectPathSuffix: '?tab=interfaces' },
      { label: 'Site measurement', href: '/projects', icon: Ruler, requiresProject: true, projectPathSuffix: '?tab=measure' },
      { label: 'Punch list', href: '/projects', icon: ListX, requiresProject: true, projectPathSuffix: '?tab=punch' },
      { label: 'Completion & defects', href: '/projects', icon: BadgeCheck, requiresProject: true, projectPathSuffix: '?tab=defects' },
      { label: 'Handover pack', href: '/projects', icon: FolderCheck, requiresProject: true, projectPathSuffix: '?tab=handover' },
      { label: 'Health & safety', href: '/projects', icon: HardHat, requiresProject: true, projectPathSuffix: '?tab=hse' },
      { label: 'Site diary', href: '/projects', icon: BookOpenText, requiresProject: true, projectPathSuffix: '?tab=diary' },
      { label: 'Look-ahead', href: '/projects', icon: CalendarRange, requiresProject: true, projectPathSuffix: '?tab=lookahead' },
      { label: 'Plant & equipment', href: '/projects', icon: Tractor, requiresProject: true, projectPathSuffix: '?tab=plant' },
    ],
  },
  {
    label: 'Commercial',
    icon: Coins,
    // The QS (an outside firm) works here too since 28 Oct 2026; Setjeka's
    // own price data and estimates stay internal. The project page itself
    // hides Commercial from those with no access to it.
    children: [
      { label: 'Project commercials', href: '/projects', icon: Coins, requiresProject: true, projectPathSuffix: '?tab=commercial' },
      { label: 'Bills & cost plans', href: '/projects', icon: Calculator, requiresProject: true, projectPathSuffix: '?tab=commercial&ctab=bills' },
      { label: 'Contracts & valuations', href: '/projects', icon: FileSignature, requiresProject: true, projectPathSuffix: '?tab=commercial&ctab=contracts' },
      { label: 'Price indices', href: '/projects', icon: TrendingUp, requiresProject: true, projectPathSuffix: '?tab=commercial&ctab=indices' },
      { label: 'Cost database', href: '/cost-database', icon: Database, audience: 'internal' },
      { label: 'Estimates', href: '/estimates', icon: Calculator, audience: 'internal' },
      { label: 'Rough estimates', href: '/rough-estimates', icon: Calculator, audience: 'internal' },
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
      { label: 'Recycle bin', href: '/administration?tab=recycle-bin', icon: Trash2 },
    ],
  },
];
