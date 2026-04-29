import React from 'react';
import ProviderBadge from './ProviderBadge';
import { ChevronRight } from 'lucide-react';
import { SidebarTrigger } from './ui/sidebar';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface TopHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export default function TopHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: TopHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-8 py-6 bg-white border-b border-border relative">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div className="md:mt-1 -ml-4 hidden md:block">
          <SidebarTrigger />
        </div>
        <div>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center space-x-1 text-sm text-muted-foreground mb-2">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  {crumb.href ? (
                    <a
                      href={crumb.href}
                      className="hover:text-foreground transition-colors"
                    >
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">
                      {crumb.label}
                    </span>
                  )}
                  {index < breadcrumbs.length - 1 && (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <div className="md:hidden">
              <SidebarTrigger />
            </div>
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ProviderBadge />
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
