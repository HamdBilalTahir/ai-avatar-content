'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

function AuthGuardInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading) {
      const isAuthRoute =
        pathname === '/login' ||
        pathname === '/signup' ||
        pathname === '/forgot-password';
      if (!user && !isAuthRoute) {
        const currentPath =
          pathname +
          (searchParams.toString() ? `?${searchParams.toString()}` : '');
        router.push(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
      } else if (user && isAuthRoute) {
        const returnUrl = searchParams.get('returnUrl') || '/';
        router.push(returnUrl);
      }
    }
  }, [user, loading, router, pathname, searchParams]);

  if (loading) {
    return <AuthSpinner />;
  }

  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password';
  if (!user && !isAuthRoute) {
    return null;
  }

  return <>{children}</>;
}

function AuthSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AuthSpinner />}>
      <AuthGuardInner>{children}</AuthGuardInner>
    </Suspense>
  );
}
