'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading) {
      if (!user && pathname !== '/login' && pathname !== '/signup') {
        const currentPath =
          pathname +
          (searchParams.toString() ? `?${searchParams.toString()}` : '');
        router.push(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
      } else if (user && (pathname === '/login' || pathname === '/signup')) {
        const returnUrl = searchParams.get('returnUrl') || '/';
        router.push(returnUrl);
      }
    }
  }, [user, loading, router, pathname, searchParams]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // We still render children if loading is false.
  // If not authenticated and on a protected route, useEffect will trigger a redirect,
  // but we should avoid rendering protected content briefly.
  if (!user && pathname !== '/login' && pathname !== '/signup') {
    return null;
  }

  return <>{children}</>;
}
