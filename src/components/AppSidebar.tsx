'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  User,
  FileText,
  Film,
  LogOut,
  Settings,
  ChevronLeft,
  ChevronRight,
  TestTubes,
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
      {
        href: '/sandbox',
        label: 'Sandbox',
        match: (p: string) => p.startsWith('/sandbox'),
        icon: TestTubes,
      },
      {
        href: '/results',
        label: 'Generated Video Library',
        match: (p: string) => p.startsWith('/results'),
        icon: Film,
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
            isCollapsed ? 'justify-center px-0' : 'px-4'
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
            <div className="ml-3 flex flex-col">
              <span className="font-heading font-bold text-lg tracking-tight text-foreground leading-none">
                AI Native Videos
              </span>
              <span className="text-[9px] text-muted-foreground leading-tight tracking-wide">
                Powered by Kuai Labs
              </span>
            </div>
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
            {!isCollapsed && (
              <SidebarGroupLabel className="type-level-4 text-muted-foreground mt-5 px-3 mb-1 font-semibold h-auto">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = item.match(pathname);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.label} className="mx-2 mb-0.5">
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                        className={cn(
                          'rounded-[6px] h-9 transition-colors',
                          active
                            ? 'bg-secondary font-medium'
                            : 'hover:bg-secondary'
                        )}
                      >
                        <Icon className="w-4 h-4 stroke-[2]" />
                        {!isCollapsed && <span>{item.label}</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="flex flex-col gap-0 p-0">
        {!isCollapsed && (
          <div className="px-4 pt-4 pb-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="type-level-4 text-slate-500 mb-2">Usage</div>
              <div className="flex justify-between items-center mb-1">
                <span className="type-level-3 text-slate-600">
                  Generated Videos
                </span>
                <span className="type-level-3 text-slate-900">
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
                <span className="type-level-3 text-slate-600">
                  Images/Avatars
                </span>
                <span className="type-level-3 text-slate-900">
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
        <div className="border-t-[0.5px] border-border p-2">
          <div
            className={cn(
              'flex items-center p-2',
              isCollapsed
                ? 'justify-center'
                : 'gap-3 rounded-[6px] hover:bg-secondary transition-colors'
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="type-level-2 text-foreground truncate leading-tight">
                    {user?.email || 'User'}
                  </span>
                  <span className="type-level-3 text-muted-foreground truncate leading-tight mt-0.5">
                    Pro Plan
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors shrink-0"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
