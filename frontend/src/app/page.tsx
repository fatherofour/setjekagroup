'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { isClientUser } from '@/lib/portal';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(!user ? '/login' : isClientUser(user) ? '/portal' : '/dashboard');
  }, [loading, user, router]);

  return null;
}
