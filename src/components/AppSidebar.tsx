'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  User,
  FileText,
  LogOut,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const NAV_GROUPS = [
  {
    label: 'Create',
    items: [
      {
        href: '/avatar/new',
        label: 'Avatars',
        match: (p: string) =>
          p.startsWith('/avatar') || p.startsWith('/pipeline'),
        icon: User,
      },
      {
        href: '/script',
        label: 'Scripts',
        match: (p: string) => p.startsWith('/script'),
        icon: FileText,
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        href: '/settings',
        label: 'Settings',
        match: (p: string) => p.startsWith('/settings'),
        icon: Settings,
      },
    ],
  },
] as const;

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getCountFromServer,
} from 'firebase/firestore';

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const [videoCount, setVideoCount] = useState(0);
  const [avatarCount, setAvatarCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUsage = async () => {
      try {
        const vq = query(
          collection(db, 'generatedVideos'),
          where('userId', '==', user.uid)
        );
        const vsnap = await getCountFromServer(vq);
        setVideoCount(vsnap.data().count);

        const aq = query(
          collection(db, 'imageLibrary'),
          where('userId', '==', user.uid)
        );
        const asnap = await getCountFromServer(aq);
        setAvatarCount(asnap.data().count);
      } catch (e) {
        console.error('Failed to fetch usage stats', e);
      }
    };
    fetchUsage();
  }, [user]);

  if (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password'
  ) {
    return null;
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border h-14 justify-center">
        <div
          className={cn(
            'flex items-center',
            isCollapsed ? 'justify-center px-0' : 'px-2'
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm bg-gradient-to-br from-primary to-rose-500 shrink-0">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          {!isCollapsed && (
            <span className="ml-3 font-heading font-bold text-lg tracking-tight text-foreground truncate">
              Kuai Labs
            </span>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className={cn(
            'absolute -right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm hover:bg-muted transition-colors z-10',
            isCollapsed && 'right-[-12px]'
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = item.match(pathname);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border flex flex-col gap-2">
        {!isCollapsed && (
          <div className="px-4 pt-4 pb-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Usage
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-600">Generated Videos</span>
                <span className="text-xs font-medium text-slate-900">
                  {videoCount} / 100
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 mb-3">
                <div
                  className="bg-violet-500 h-1.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (videoCount / 100) * 100)}%`,
                  }}
                ></div>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-600">Images/Avatars</span>
                <span className="text-xs font-medium text-slate-900">
                  {avatarCount} / 50
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (avatarCount / 50) * 100)}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div
          className={cn(
            'flex items-center p-4',
            isCollapsed ? 'justify-center' : 'gap-3 pt-2'
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-sm font-medium text-foreground truncate">
                  {user?.email || 'User'}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  Pro Plan
                </span>
              </div>
              <button
                onClick={logout}
                className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors shrink-0"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
