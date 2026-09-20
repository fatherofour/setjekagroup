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
  type LucideIcon,
} from 'lucide-react';

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
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
  // Hidden entirely unless the signed-in user's platform Role is ADMIN
  // (see Sidebar.tsx) - used for the Administration group only.
  adminOnly?: boolean;
}

export type NavEntry = NavLeaf | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

export const NAV: NavEntry[] = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    children: [
      { label: 'My Day', href: '/my-day', icon: Sun },
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Projects',
    icon: FolderKanban,
    children: [
      { label: 'Overview', href: '/projects', icon: FolderKanban },
      { label: 'Schedule', href: '/projects', icon: GanttChart, requiresProject: true, projectPathSuffix: '/schedule' },
      { label: 'Tasks', href: '/projects', icon: ListChecks, requiresProject: true, projectPathSuffix: '?tab=tasks' },
      { label: 'Issues', href: '/projects', icon: AlertTriangle, requiresProject: true, projectPathSuffix: '?tab=issues' },
      { label: 'Risks', href: '/projects', icon: ShieldAlert, requiresProject: true, projectPathSuffix: '?tab=risks' },
      { label: 'Documents', href: '/projects', icon: FileText, requiresProject: true, projectPathSuffix: '?tab=documents' },
      { label: 'RFIs & Submittals', href: '/projects', icon: HelpCircle, requiresProject: true, projectPathSuffix: '?tab=technical' },
    ],
  },
  {
    label: 'Procurement',
    icon: Handshake,
    children: [
      { label: 'Contractors', href: '/contractors', icon: HardHat },
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
