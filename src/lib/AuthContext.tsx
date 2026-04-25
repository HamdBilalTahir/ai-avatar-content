'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { UserSession } from '@/lib/types';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    try {
      const sessionId = localStorage.getItem('sessionId');
      if (sessionId) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'ended',
          endedAt: serverTimestamp(),
        });
        localStorage.removeItem('sessionId');
      }
    } catch (e) {
      console.error('Error ending session', e);
    } finally {
      await signOut(auth);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const sessionId = localStorage.getItem('sessionId');
          let isValidSession = false;

          if (sessionId) {
            const sessionRef = doc(db, 'sessions', sessionId);
            const sessionSnap = await getDoc(sessionRef);

            if (sessionSnap.exists()) {
              const sessionData = sessionSnap.data() as UserSession;

              if (sessionData.status === 'active') {
                const lastActiveTime =
                  sessionData.lastActive?.toMillis?.() || Date.now();
                const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

                if (Date.now() - lastActiveTime > thirtyDaysInMs) {
                  // Session is stale (older than 30 days)
                  await updateDoc(sessionRef, {
                    status: 'ended',
                    endedAt: serverTimestamp(),
                  });
                  localStorage.removeItem('sessionId');
                  await signOut(auth);
                  setUser(null);
                  setLoading(false);
                  return;
                } else {
                  // Session is valid, update lastActive
                  await updateDoc(sessionRef, {
                    lastActive: serverTimestamp(),
                  });
                  isValidSession = true;
                }
              }
            }
          }

          if (!isValidSession) {
            // Create a new session
            const newSessionId = crypto.randomUUID();
            const newSession: UserSession = {
              sessionId: newSessionId,
              uid: currentUser.uid,
              userAgent: navigator.userAgent,
              status: 'active',
              createdAt: serverTimestamp(),
              endedAt: null,
              lastActive: serverTimestamp(),
            };

            await setDoc(doc(db, 'sessions', newSessionId), newSession);
            localStorage.setItem('sessionId', newSessionId);
          }

          setUser(currentUser);
        } catch (e) {
          console.error('Session verification failed', e);
          setUser(currentUser); // fallback: just log them in if session checks fail
        }
      } else {
        // Not logged in
        localStorage.removeItem('sessionId');
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
