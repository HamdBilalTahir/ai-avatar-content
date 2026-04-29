'use client';

import React from 'react';
import { useProvider } from '@/lib/ProviderContext';

export default function ProviderStatus() {
  const { providerConfig } = useProvider();

  let dotColor = '#EA4335'; // red for unconfigured
  let label = 'No API provider configured';

  if (providerConfig.activeProvider === 'gemini') {
    dotColor = '#1A73E8'; // blue
    label = 'Ready · Gemini API';
  } else if (providerConfig.activeProvider === 'vertex') {
    dotColor = '#34A853'; // green
    label = `Ready · Vertex AI · ${providerConfig.vertexCredentials.region || 'us-central1'}`;
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}
