import { AtSign, Camera, CalendarClock, Clock, ListChecks, Stamp, type LucideIcon } from 'lucide-react';

// Keep in step with backend notifications/categories.ts.
export type AlertCategory = 'APPROVALS' | 'ACTIONS' | 'ASSIGNMENTS' | 'DEADLINES' | 'MEETINGS' | 'SITE';

export interface AppNotification {
  id: string;
  projectId: string | null;
  project: { id: string; name: string; projectCode: string | null } | null;
  link: string | null;
  type: string;
  category: AlertCategory;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const ALERT_CATEGORY: Record<AlertCategory, { label: string; description: string; icon: LucideIcon; tone: string }> = {
  APPROVALS: {
    label: 'Approvals',
    description: 'Decisions waiting on you and the outcome of ones you asked for. Always on.',
    icon: Stamp,
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  ACTIONS: {
    label: 'Notes & actions',
    description: 'Notes addressed to you, actions given to you or completed, and @mentions.',
    icon: AtSign,
    tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  ASSIGNMENTS: {
    label: 'Assignments',
    description: 'Tasks and issues given to you, and risks escalated to you.',
    icon: ListChecks,
    tone: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
  DEADLINES: {
    label: 'Due soon',
    description: 'Daily reminders for your work due in the next two days.',
    icon: Clock,
    tone: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
  MEETINGS: {
    label: 'Meetings',
    description: 'Meetings you are invited to.',
    icon: CalendarClock,
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  SITE: {
    label: 'Site photos',
    description: 'New photos on your issues and tasks, and photos shared with you.',
    icon: Camera,
    tone: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
};

export const ALERT_CATEGORIES = Object.keys(ALERT_CATEGORY) as AlertCategory[];

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  // Due-soon reminders carry the due date, which can be ahead of now.
  if (diffMs < 0) {
    const days = Math.ceil(-diffMs / 86_400_000);
    return days <= 1 ? 'due within a day' : `due in ${days}d`;
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Fired after anything marks alerts read, so the bell and the
 * Notifications page stay in step without waiting for the next poll. */
export const NOTIFICATIONS_CHANGED = 'setjeka:notifications-changed';

export function announceNotificationsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
