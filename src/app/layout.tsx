import React from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google';
import AppSidebar from '@/components/AppSidebar';
import { AuthProvider } from '@/lib/AuthContext';
import { ProviderConfigProvider } from '@/lib/ProviderContext';
import AuthGuard from '@/components/AuthGuard';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-heading',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AI Avatar',
  description: 'AI Avatar content creation',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased flex h-screen overflow-hidden bg-[#F9FAFB] font-sans`}
      >
        <AuthProvider>
          <ProviderConfigProvider>
            <AuthGuard>
              <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="flex-1 min-w-0 flex flex-col overflow-x-hidden overflow-y-auto page-transition">
                  {children}
                </SidebarInset>
              </SidebarProvider>
            </AuthGuard>
          </ProviderConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
