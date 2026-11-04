'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronLeft, FolderOpen, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { GREEN } from '@/lib/auth-theme';
import { useCurrentProject } from '@/lib/current-project-context';
import { useAuth } from '@/lib/auth-context';
import { useProjectAccess } from '@/lib/project-access';
import { projectStageInfo } from '@/lib/projectStages';
import { COMPANY_NAV, PROJECT_NAV, canSee, isNavGroup, projectTabOf, type NavEntry, type NavGroup, type NavLeaf } from './nav';

const OPEN_GROUPS_KEY = 'setjeka_sidebar_open_groups';
const COLLAPSED_KEY = 'setjeka_sidebar_collapsed';

function defaultOpenState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const entry of COMPANY_NAV) {
    if (isNavGroup(entry)) state[entry.label] = true;
  }
  return state;
}

/** The project whose pages are open, from the address. */
function projectIdOf(pathname: string) {
  const m = /^\/projects\/([^/]+)/.exec(pathname);
  return m && m[1] !== 'new' ? m[1] : null;
}

export function Sidebar({ open }: { open: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
  // Commercial's own sub-tabs (bills, contracts) have menu entries too.
  const currentCtab = searchParams.get('ctab');
  const { currentProject } = useCurrentProject();
  const { user } = useAuth();
  const projectId = projectIdOf(pathname);
  const access = useProjectAccess(projectId);
  const project = projectId && currentProject?.id === projectId ? currentProject : null;

  // Off a project: the company menu, with the project last opened first
  // under Projects so its screens stay one click away.
  const companyNav = COMPANY_NAV.flatMap((entry): NavEntry[] => {
    if (!isNavGroup(entry)) return canSee(entry.audience, user) ? [entry] : [];
    if (entry.adminOnly && user?.role !== 'ADMIN') return [];
    if (!canSee(entry.audience, user)) return [];
    const children = entry.children.filter((c) => canSee(c.audience, user));
    if (entry.label === 'Projects' && currentProject) children.unshift({ label: currentProject.name, href: `/projects/${currentProject.id}`, icon: FolderOpen });
    return children.length ? [{ ...entry, children }] : [];
  });
  // On a project: its modules, each with only the screens this person can
  // open there (the same rule the project page uses).
  const projectNav = PROJECT_NAV.flatMap((group): NavGroup[] => {
    const children = group.children.filter((c) => {
      const tab = projectTabOf(c);
      return tab ? access.canOpen(tab) : canSee(c.audience, user);
    });
    return children.length ? [{ ...group, children }] : [];
  });
  const visibleNav: NavEntry[] = projectId ? projectNav : companyNav;

  const hrefOf = (child: NavLeaf) => {
    const id = projectId ?? currentProject?.id;
    return child.requiresProject && id ? `/projects/${id}${child.projectPathSuffix ?? ''}` : child.href;
  };
  const isActive = (child: NavLeaf) => {
    const href = hrefOf(child);
    const [hrefPath, hrefQuery] = href.split('?');
    const hrefTab = hrefQuery ? new URLSearchParams(hrefQuery).get('tab') : null;
    const hrefCtab = hrefQuery ? new URLSearchParams(hrefQuery).get('ctab') : null;
    // Query-based entries (e.g. Documents, ?tab=documents, or a non-project
    // page like Administration's own tabs) only highlight when that exact
    // tab is active; path-based entries (e.g. Schedule, its own route) just
    // match the path.
    if (hrefTab) return pathname === hrefPath && currentTab === hrefTab && currentCtab === hrefCtab;
    return pathname === hrefPath && (!child.requiresProject || hrefPath !== child.href) && (!currentTab || currentTab === 'overview');
  };
  const activeGroup = projectId ? projectNav.find((g) => g.children.some(isActive))?.label : undefined;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpenState);
  // A project's modules start closed but for the one in use.
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_GROUPS_KEY);
      if (stored) setOpenGroups({ ...defaultOpenState(), ...JSON.parse(stored) });
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // localStorage unavailable or corrupt value - keep defaults
    }
  }, []);

  useEffect(() => {
    for (const entry of COMPANY_NAV) {
      if (isNavGroup(entry) && entry.children.some((c) => c.href === pathname)) {
        setOpenGroups((prev) => (prev[entry.label] ? prev : { ...prev, [entry.label]: true }));
      }
    }
  }, [pathname]);

  function isOpen(label: string) {
    if (projectId) return openModules[label] ?? label === activeGroup;
    return openGroups[label] ?? true;
  }

  function toggleGroup(label: string) {
    if (projectId) {
      setOpenModules((prev) => ({ ...prev, [label]: !isOpen(label) }));
      return;
    }
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }

  const stage = project ? projectStageInfo(project.stage) : null;

  return (
    <aside
      data-guide="sidebar"
      className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col text-emerald-50 transition-all duration-200 lg:static lg:z-auto lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } ${collapsed ? 'lg:w-[68px]' : 'lg:w-60'}`}
      style={{ backgroundColor: GREEN }}
    >
      <div className={`flex shrink-0 items-center px-5 py-6 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={collapsed ? '/setjeka/icon-mark.png' : '/setjeka/logo.png'}
          alt="Setjeka Group"
          className={collapsed ? 'hidden h-8 w-8 lg:block' : 'h-auto w-[116px]'}
          style={{ filter: 'brightness(0) invert(1)' }}
          draggable={false}
        />
        {/* Mobile always shows the full wordmark, even while "collapsed" applies only at lg+. */}
        {collapsed && (
          <img
            src="/setjeka/logo.png"
            alt="Setjeka Group"
            className="h-auto w-[116px] lg:hidden"
            style={{ filter: 'brightness(0) invert(1)' }}
            draggable={false}
          />
        )}
      </div>

      {projectId && (
        <div className={`shrink-0 space-y-1.5 px-3 pb-3 ${collapsed ? 'lg:hidden' : ''}`}>
          <Link href="/projects" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-200 transition hover:bg-black/10">
            <ChevronLeft size={14} /> All of Setjeka
          </Link>
          <div className="rounded-lg border border-emerald-700/60 bg-black/10 px-3 py-2">
            <p className="truncate text-sm font-semibold text-white" title={project?.name}>
              {project?.name ?? 'Project'}
            </p>
            {stage && (
              <p className="text-xs text-emerald-200">
                Stage {stage.number} · {stage.label}
              </p>
            )}
          </div>
        </div>
      )}

      {/* min-h-0 + overflow: with a group expanded the menu outgrows the
          screen; it scrolls here instead of spilling past the sidebar. */}
      <nav
        aria-label={projectId ? 'Project' : 'Main'}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 [scrollbar-color:rgba(255,255,255,.25)_transparent] [scrollbar-width:thin]"
      >
        {visibleNav.map((entry) => {
          if (isNavGroup(entry)) {
            const GroupIcon = entry.icon;
            const groupOpen = isOpen(entry.label);
            const now = Boolean(project && entry.stages?.includes(project.stage));
            return (
              <div key={entry.label}>
                <button
                  onClick={() => (collapsed ? toggleCollapsed() : toggleGroup(entry.label))}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition hover:bg-black/10 ${
                    entry.label === activeGroup ? 'text-white' : 'text-emerald-100'
                  } ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
                  aria-expanded={groupOpen}
                  title={collapsed ? entry.label : undefined}
                >
                  <GroupIcon size={16} strokeWidth={1.75} />
                  <span className={collapsed ? 'flex-1 text-left lg:hidden' : 'flex-1 text-left'}>{entry.label}</span>
                  {now && (
                    <span className={`rounded-full bg-emerald-600 px-1.5 py-px text-[10px] font-semibold text-white ${collapsed ? 'lg:hidden' : ''}`} title="The project's current stage">
                      Now
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${collapsed ? 'lg:hidden' : ''}`}
                    style={{ transform: groupOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  />
                </button>
                {groupOpen && (
                  <div className={`mt-0.5 space-y-0.5 pl-4 ${collapsed ? 'lg:hidden' : ''}`}>
                    {entry.children.map((child) => {
                      const active = isActive(child);
                      const ChildIcon = child.icon;
                      const noProject = child.requiresProject && !projectId && !currentProject;
                      return (
                        <Link
                          key={child.label}
                          href={hrefOf(child)}
                          aria-current={active ? 'page' : undefined}
                          title={noProject ? 'Select a project first' : undefined}
                          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                            active ? 'bg-emerald-800 text-white' : 'text-emerald-100 hover:bg-black/10'
                          }`}
                        >
                          <ChildIcon size={14} strokeWidth={1.75} className="shrink-0" />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = pathname === entry.href;
          const Icon = entry.icon;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              title={collapsed ? entry.label : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-emerald-800 text-white' : 'text-emerald-100 hover:bg-black/10'
              } ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span className={collapsed ? 'lg:hidden' : ''}>{entry.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={`shrink-0 px-3 pb-4 pt-2 ${collapsed ? 'lg:flex lg:justify-center' : ''}`}>
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-black/10 lg:flex"
        >
          {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
