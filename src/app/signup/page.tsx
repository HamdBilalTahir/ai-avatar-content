'use client';

import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { LayoutGrid } from 'lucide-react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      const returnUrl = searchParams.get('returnUrl') || '/';
      router.push(returnUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center p-4 bg-[#F9FAFB]">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Create an account
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign up to get started with Kuai Labs
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {error && (
              <div className="mb-4 rounded-md bg-destructive/15 p-3 text-sm text-destructive font-medium text-center">
                {error}
              </div>
            )}
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Creating account...' : 'Sign up'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center border-t border-border pt-6 pb-6">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href={`/login${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
