import { Sun, LayoutDashboard, FolderKanban, HardHat, type LucideIcon } from 'lucide-react';

interface PageTitle {
  label: string;
  icon: LucideIcon;
}

const PAGE_TITLES: Record<string, PageTitle> = {
  '/my-day': { label: 'My Day', icon: Sun },
  '/dashboard': { label: 'Dashboard', icon: LayoutDashboard },
  '/projects': { label: 'Projects', icon: FolderKanban },
  '/contractors': { label: 'Contractors', icon: HardHat },
};

export function getPageTitle(pathname: string): PageTitle {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (/^\/projects\/[^/]+$/.test(pathname)) return { label: 'Project', icon: FolderKanban };
  if (pathname === '/contractors/new') return { label: 'New Contractor', icon: HardHat };
  if (/^\/contractors\/[^/]+$/.test(pathname)) return { label: 'Contractor', icon: HardHat };
  return { label: 'Setjeka ERP', icon: LayoutDashboard };
}
