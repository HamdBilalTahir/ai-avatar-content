import React from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import AppSidebar from '@/components/AppSidebar';
import { AuthProvider } from '@/lib/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex h-screen overflow-hidden`}
      >
        <AuthProvider>
          <AuthGuard>
            <AppSidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto">
              {children}
            </main>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
