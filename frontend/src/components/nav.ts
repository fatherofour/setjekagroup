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
import type { ProjectStage } from '@/lib/projectStages';

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
  // Project modules: the stages where this module is the day-to-day work,
  // marked "Now" in the sidebar while the project is in one of them.
  stages?: ProjectStage[];
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

// Two menus (the navigation review, 2026-11-04): the company-wide one,
// and inside a project that project's own modules. Every screen the old
// single menu offered is still in one of them, at the same address.

/** Off a project's pages: work across projects, and Setjeka's own tools. */
export const COMPANY_NAV: NavEntry[] = [
  {
    label: 'My work',
    icon: Sun,
    children: [
      { label: 'My Day', href: '/my-day', icon: Sun },
      { label: 'Notifications', href: '/notifications', icon: Bell },
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Approvals', href: '/approvals', icon: Stamp },
    ],
  },
  { label: 'Portfolio', href: '/portfolio', icon: Layers, audience: 'internal' },
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
    // The Sidebar adds the project last opened at the top of this group.
    label: 'Projects',
    icon: FolderKanban,
    children: [
      { label: 'All projects', href: '/projects', icon: FolderKanban },
      { label: 'Search documents', href: '/search', icon: FileSearch },
    ],
  },
  {
    // Setjeka's own price data and estimates, and the firms it procures
    // from (procurement sits under Commercial: the user, 2026-11-04).
    label: 'Commercial',
    icon: Coins,
    audience: 'internal',
    children: [
      { label: 'Cost database', href: '/cost-database', icon: Database },
      { label: 'Estimates', href: '/estimates', icon: Calculator },
      { label: 'Rough estimates', href: '/rough-estimates', icon: Calculator },
      { label: 'Contractors', href: '/contractors', icon: HardHat },
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

const p = (label: string, icon: LucideIcon, projectPathSuffix: string): NavLeaf => ({ label, href: '/projects', icon, requiresProject: true, projectPathSuffix });

/** On a project's pages: its modules, each opening to its screens. A
 * screen's own parts (Commercial's cost report, budget, bills...; Health &
 * safety's incidents and permits) are tabs on that screen. The Sidebar
 * shows a person only the screens the project page lets them open. */
export const PROJECT_NAV: NavGroup[] = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    children: [
      p('Summary', LayoutDashboard, ''),
      p('PROCSA tracker', ListTodo, '?tab=procsa'),
      p('Team', Users, '?tab=team'),
      p('Project structure', Network, '?tab=structure'),
    ],
  },
  {
    label: 'Inception',
    icon: ClipboardCheck,
    stages: ['INITIATION', 'INCEPTION'],
    children: [p('Inception (Stage 1)', ClipboardCheck, '?tab=inception'), p('Authorities', Landmark, '?tab=authorities')],
  },
  {
    label: 'Coordination',
    icon: CalendarClock,
    children: [
      p('Meetings', CalendarClock, '?tab=meetings'),
      p('Actions', ClipboardList, '?tab=actions'),
      p('Tasks', ListChecks, '?tab=tasks'),
      p('Issues', AlertTriangle, '?tab=issues'),
      p('Risks', ShieldAlert, '?tab=risks'),
      p('Instructions & letters', Mail, '?tab=instructions'),
    ],
  },
  {
    label: 'Design & documents',
    icon: PenTool,
    stages: ['CONCEPT', 'DESIGN', 'DOCUMENTATION_PROCUREMENT'],
    children: [
      p('Documents', FileText, '?tab=documents'),
      { label: 'Search documents', href: '/search', icon: FileSearch },
      p('Drawings', PenTool, '?tab=drawings'),
      p('Models', Box, '?tab=models'),
      p('BIM hub', Network, '?tab=bim'),
      p('RFIs & Submittals', HelpCircle, '?tab=technical'),
    ],
  },
  {
    label: 'Programme',
    icon: GanttChart,
    stages: ['CONSTRUCTION'],
    children: [p('Schedule', GanttChart, '/schedule'), p('Look-ahead', CalendarRange, '?tab=lookahead'), p('Delays & EOT', CalendarClock, '?tab=eot')],
  },
  {
    label: 'Site',
    icon: HardHat,
    stages: ['CONSTRUCTION'],
    children: [
      p('Site diary', BookOpenText, '?tab=diary'),
      p('Plant & equipment', Tractor, '?tab=plant'),
      p('Site photos', Camera, '?tab=photos'),
      p('Site measurement', Ruler, '?tab=measure'),
    ],
  },
  {
    label: 'Quality & safety',
    icon: SearchCheck,
    stages: ['CONSTRUCTION'],
    children: [
      p('Inspections', SearchCheck, '?tab=inspections'),
      p('NCRs', ShieldAlert, '?tab=ncrs'),
      p('Tests & hold points', FlaskConical, '?tab=tests'),
      p('Hidden works', EyeOff, '?tab=hidden'),
      p('Interfaces', Waypoints, '?tab=interfaces'),
      p('Punch list', ListX, '?tab=punch'),
      p('Health & safety', HardHat, '?tab=hse'),
    ],
  },
  {
    label: 'Commercial',
    icon: Coins,
    stages: ['DOCUMENTATION_PROCUREMENT'],
    children: [
      p('Project commercials', Coins, '?tab=commercial'),
      p('Bills & cost plans', Calculator, '?tab=commercial&ctab=bills'),
      p('Contracts & valuations', FileSignature, '?tab=commercial&ctab=contracts'),
      p('Price indices', TrendingUp, '?tab=commercial&ctab=indices'),
      p('Procurement (RFQs & POs)', Handshake, '?tab=procurement'),
    ],
  },
  {
    label: 'Completion',
    icon: BadgeCheck,
    stages: ['CLOSEOUT'],
    children: [p('Completion & defects', BadgeCheck, '?tab=defects'), p('Handover pack', FolderCheck, '?tab=handover')],
  },
  {
    label: 'Reports & registers',
    icon: Presentation,
    children: [p('Reports', Presentation, '?tab=reports'), p('Registers', ClipboardList, '?tab=registers')],
  },
];

/** The workspace tab a project entry opens ('overview' for the project
 * itself, 'schedule' for its own page), or null for a non-project page. */
export function projectTabOf(leaf: NavLeaf): string | null {
  if (!leaf.requiresProject) return null;
  const suffix = leaf.projectPathSuffix ?? '';
  if (suffix.startsWith('/')) return suffix.slice(1);
  return new URLSearchParams(suffix.replace(/^\?/, '')).get('tab') ?? 'overview';
}

/** Where a project entry sits: its module and screen, for the page's
 * breadcrumb. */
export function projectPlace(tab: string, ctab: string | null): { module: string; screen: string } | null {
  const ctabOf = (leaf: NavLeaf) => new URLSearchParams((leaf.projectPathSuffix ?? '').replace(/^\?/, '')).get('ctab');
  // A screen's own sub-tab (Commercial's bills) wins over the screen itself.
  for (const want of [ctab, null]) {
    for (const group of PROJECT_NAV) {
      const leaf = group.children.find((l) => projectTabOf(l) === tab && ctabOf(l) === want);
      if (leaf) return { module: group.label, screen: leaf.label };
    }
  }
  return null;
}
