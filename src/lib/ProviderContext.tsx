'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';

export type VertexCredentials = {
  serviceAccountKey: string;
  projectId: string;
  region: string;
};

export type ProviderConfig = {
  activeProvider: 'gemini' | 'vertex' | null;
  geminiApiKey: string;
  vertexCredentials: VertexCredentials;
};

const DEFAULT_VERTEX: VertexCredentials = {
  serviceAccountKey: '',
  projectId: '',
  region: 'us-central1',
};

const DEFAULT_CONFIG: ProviderConfig = {
  activeProvider: null,
  geminiApiKey: '',
  vertexCredentials: DEFAULT_VERTEX,
};

type ProviderContextValue = {
  providerConfig: ProviderConfig;
  isProviderLoading: boolean;
  saveProviderConfig: (updates: Partial<ProviderConfig>) => Promise<void>;
};

const ProviderContext = createContext<ProviderContextValue>({
  providerConfig: DEFAULT_CONFIG,
  isProviderLoading: true,
  saveProviderConfig: async () => {},
});

export function ProviderConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [providerConfig, setProviderConfig] =
    useState<ProviderConfig>(DEFAULT_CONFIG);
  const [isProviderLoading, setIsProviderLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProviderConfig(DEFAULT_CONFIG);
      setIsProviderLoading(false);
      return;
    }

    const load = async () => {
      setIsProviderLoading(true);
      try {
        const snap = await getDoc(doc(db, 'userProfiles', user.uid));
        if (snap.exists()) {
          const raw = snap.data()?.providerConfig;
          if (raw) {
            setProviderConfig({
              activeProvider: raw.activeProvider ?? null,
              geminiApiKey: raw.geminiApiKey ?? '',
              vertexCredentials: {
                serviceAccountKey:
                  raw.vertexCredentials?.serviceAccountKey ?? '',
                projectId: raw.vertexCredentials?.projectId ?? '',
                region: raw.vertexCredentials?.region ?? 'us-central1',
              },
            });
          }
        }
      } catch (e) {
        console.error('[ProviderContext] failed to load provider config', e);
      } finally {
        setIsProviderLoading(false);
      }
    };

    load();
  }, [user]);

  const saveProviderConfig = async (updates: Partial<ProviderConfig>) => {
    const merged: ProviderConfig = { ...providerConfig, ...updates };

    // Auto-set active provider when only one credential is configured and none chosen yet
    if (!merged.activeProvider) {
      const hasGemini = !!merged.geminiApiKey;
      const hasVertex = !!merged.vertexCredentials.serviceAccountKey;
      if (hasGemini && !hasVertex) merged.activeProvider = 'gemini';
      else if (hasVertex && !hasGemini) merged.activeProvider = 'vertex';
    }

    setProviderConfig(merged);
    if (!user) return;
    try {
      await setDoc(
        doc(db, 'userProfiles', user.uid),
        { providerConfig: merged },
        { merge: true }
      );
    } catch (e) {
      console.error('[ProviderContext] failed to save provider config', e);
    }
  };

  return (
    <ProviderContext.Provider
      value={{ providerConfig, isProviderLoading, saveProviderConfig }}
    >
      {children}
    </ProviderContext.Provider>
  );
}

export function useProvider() {
  return useContext(ProviderContext);
}
