import React from 'react';
import Link from 'next/link';
import { ChevronRight, Bell, Settings, LogOut } from 'lucide-react';
import { SidebarTrigger } from './ui/sidebar';
import { useAuth } from '@/lib/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface TopHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export default function TopHeader({ breadcrumbs, actions }: TopHeaderProps) {
  const { user, logout } = useAuth();
  const initials = user?.email ? user.email.charAt(0).toUpperCase() : 'U';

  return (
    <div className="flex flex-row items-center justify-between px-4 sm:px-6 bg-white border-b border-border relative h-[52px]">
      <div className="flex flex-row items-center h-full">
        <div className="mr-3 md:hidden">
          <SidebarTrigger />
        </div>

        {/* Left Zone: Logo */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold type-level-3">
            KL
          </div>
          <div className="flex flex-col hidden sm:flex">
            <span className="font-semibold type-level-2 tracking-tight leading-none">
              AI Native Videos
            </span>
            <span className="text-[9px] text-muted-foreground leading-tight tracking-wide">
              Powered by Kuai Labs
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border mx-2" />

        {/* Center Zone: Breadcrumbs */}
        <div className="ml-2 flex items-center">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center space-x-1 type-level-2">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={index}>
                    {isLast ? (
                      <span className="font-medium text-foreground">
                        {crumb.label}
                      </span>
                    ) : crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        {crumb.label}
                      </span>
                    )}
                    {!isLast && (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Right Zone */}
      <div className="flex items-center gap-3">
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        <div className="flex items-center gap-2 ml-1">
          <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors">
            <Bell className="w-4 h-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center type-level-3 hover:bg-primary/20 transition-colors cursor-pointer outline-none">
              {initials}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <DropdownMenuLabel className="font-normal p-0">
                  <div className="flex flex-col space-y-1">
                    <p className="type-level-2 leading-none">Account</p>
                    <p className="type-level-3 leading-none text-muted-foreground">
                      {user?.email || 'Not signed in'}
                    </p>
                  </div>
                </DropdownMenuLabel>
              </div>
              <DropdownMenuSeparator />
              <Link href="/settings" className="outline-none block w-full">
                <DropdownMenuItem className="cursor-pointer w-full flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
