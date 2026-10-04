import { Sun, LayoutDashboard, FolderKanban, HardHat, Database, Calculator, type LucideIcon } from 'lucide-react';

interface PageTitle {
  label: string;
  icon: LucideIcon;
}

const PAGE_TITLES: Record<string, PageTitle> = {
  '/my-day': { label: 'My Day', icon: Sun },
  '/dashboard': { label: 'Dashboard', icon: LayoutDashboard },
  '/projects': { label: 'Projects', icon: FolderKanban },
  '/contractors': { label: 'Contractors', icon: HardHat },
  '/cost-database': { label: 'Cost database', icon: Database },
  '/estimates': { label: 'Estimates', icon: Calculator },
  '/portal': { label: 'My projects', icon: FolderKanban },
};

export function getPageTitle(pathname: string): PageTitle {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (/^\/projects\/[^/]+$/.test(pathname)) return { label: 'Project', icon: FolderKanban };
  if (pathname === '/contractors/new') return { label: 'New Contractor', icon: HardHat };
  if (/^\/contractors\/[^/]+$/.test(pathname)) return { label: 'Contractor', icon: HardHat };
  if (/^\/estimates\/[^/]+$/.test(pathname)) return { label: 'Estimate', icon: Calculator };
  return { label: 'Setjeka ERP', icon: LayoutDashboard };
}
