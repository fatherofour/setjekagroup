import { LayoutDashboard, Sun, FolderKanban, Handshake, HardHat, type LucideIcon } from 'lucide-react';

export interface NavLeaf {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
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
    children: [{ label: 'Overview', href: '/projects', icon: FolderKanban }],
  },
  {
    label: 'Procurement',
    icon: Handshake,
    children: [{ label: 'Contractors', href: '/contractors', icon: HardHat }],
  },
];
