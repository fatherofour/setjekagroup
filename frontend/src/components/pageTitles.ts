import {
  Sun,
  LayoutDashboard,
  FolderKanban,
  HardHat,
  Database,
  Calculator,
  Bell,
  PenLine,
  FileSearch,
  Layers,
  Stamp,
  Lightbulb,
  Building2,
  ShieldCheck,
  FileSignature,
  type LucideIcon,
  Settings,
} from 'lucide-react';
import { projectPlace } from './nav';

interface PageTitle {
  label: string;
  icon: LucideIcon;
}

// Critique L-02: the top bar names the screen the way the menu does.
const PAGE_TITLES: Record<string, PageTitle> = {
  '/my-day': { label: 'My Day', icon: Sun },
  '/dashboard': { label: 'Dashboard', icon: LayoutDashboard },
  '/approvals': { label: 'Approvals', icon: Stamp },
  '/portfolio': { label: 'Portfolio', icon: Layers },
  '/projects': { label: 'All projects', icon: FolderKanban },
  '/projects/new': { label: 'New project', icon: FolderKanban },
  '/opportunities': { label: 'All Opportunities', icon: Lightbulb },
  '/clients': { label: 'Clients', icon: Building2 },
  '/contractors': { label: 'Contractors', icon: HardHat },
  '/contractors/new': { label: 'New Contractor', icon: HardHat },
  '/cost-database': { label: 'Cost database', icon: Database },
  '/estimates': { label: 'Estimates', icon: Calculator },
  '/rough-estimates': { label: 'Rough estimates', icon: Calculator },
  '/portal': { label: 'My Projects', icon: FolderKanban },
  '/portal/opportunities': { label: 'My Developments', icon: Lightbulb },
  '/portal/rfqs': { label: 'My RFQs', icon: FileSignature },
  '/notifications': { label: 'Notifications', icon: Bell },
  '/account/signature': { label: 'My signature', icon: PenLine },
  '/account/settings': { label: 'My settings', icon: Settings },
  '/search': { label: 'Search documents', icon: FileSearch },
  '/administration': { label: 'Administration', icon: ShieldCheck },
};

/** `tab` and `ctab` are the project workspace's screen, from the URL. */
export function getPageTitle(pathname: string, tab?: string | null, ctab?: string | null): PageTitle {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (/^\/projects\/[^/]+\/schedule$/.test(pathname)) return { label: projectPlace('schedule', null)?.screen ?? 'Schedule', icon: FolderKanban };
  if (/^\/projects\/[^/]+$/.test(pathname)) {
    const place = projectPlace(tab || 'overview', ctab ?? null) ?? projectPlace(tab || 'overview', null);
    return { label: place?.screen ?? 'Project', icon: FolderKanban };
  }
  if (/^\/portal\/projects\/[^/]+$/.test(pathname)) return { label: 'My project', icon: FolderKanban };
  if (/^\/portal\/opportunities\/[^/]+$/.test(pathname)) return { label: 'My development', icon: Lightbulb };
  if (/^\/opportunities\/[^/]+$/.test(pathname)) return { label: 'Opportunity', icon: Lightbulb };
  if (/^\/clients\/[^/]+$/.test(pathname)) return { label: 'Client', icon: Building2 };
  if (/^\/contractors\/[^/]+$/.test(pathname)) return { label: 'Contractor', icon: HardHat };
  if (/^\/estimates\/[^/]+$/.test(pathname)) return { label: 'Estimate', icon: Calculator };
  return { label: 'Setjeka', icon: LayoutDashboard };
}
