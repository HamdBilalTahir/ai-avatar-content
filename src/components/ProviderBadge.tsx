'use client';

import React, { useState, useEffect } from 'react';
import { useProvider } from '@/lib/ProviderContext';
import { useAuth } from '@/lib/AuthContext';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Eye, EyeOff, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ProviderBadge({
  hideBadge = false,
}: {
  hideBadge?: boolean;
}) {
  const { providerConfig, saveProviderConfig } = useProvider();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showValues, setShowValues] = useState(false);

  // local state for form
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [tempVertexKey, setTempVertexKey] = useState('');
  const [tempVertexProject, setTempVertexProject] = useState('');
  const [tempVertexRegion, setTempVertexRegion] = useState('');
  const [tempActiveProvider, setTempActiveProvider] = useState<
    'gemini' | 'vertex' | null
  >(null);

  const handleBadgeClick = () => {
    setIsOpen(true);
    setIsAuthenticated(false);
    setShowValues(false);
  };

  const handleToggleShow = () => {
    if (isAuthenticated) {
      setShowValues(!showValues);
    } else {
      setAuthPassword('');
      setAuthError('');
      setAuthDialogOpen(true);
    }
  };

  const handleVerifyPassword = async () => {
    if (!user || !user.email) return;

    setIsAuthenticating(true);
    setAuthError('');

    try {
      const credential = EmailAuthProvider.credential(user.email, authPassword);
      await reauthenticateWithCredential(user, credential);
      setIsAuthenticated(true);
      setAuthDialogOpen(false);
      setShowValues(true);
    } catch (err: any) {
      console.error(err);
      setAuthError('Incorrect password. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  useEffect(() => {
    const handleOpenModal = () => {
      setIsOpen(true);
      setIsAuthenticated(false);
      setShowValues(false);
    };

    document.addEventListener('open-provider-modal', handleOpenModal);
    return () => {
      document.removeEventListener('open-provider-modal', handleOpenModal);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTempGeminiKey(providerConfig.geminiApiKey || '');
      setTempVertexKey(
        providerConfig.vertexCredentials.serviceAccountKey || ''
      );
      setTempVertexProject(providerConfig.vertexCredentials.projectId || '');
      setTempVertexRegion(
        providerConfig.vertexCredentials.region || 'us-central1'
      );
      setTempActiveProvider(providerConfig.activeProvider);
    }
  }, [isOpen, providerConfig]);

  const handleSave = () => {
    saveProviderConfig({
      geminiApiKey: tempGeminiKey,
      vertexCredentials: {
        serviceAccountKey: tempVertexKey,
        projectId: tempVertexProject,
        region: tempVertexRegion,
      },
      activeProvider: tempActiveProvider,
    });
    setIsOpen(false);
  };

  let dotColor = '#EA4335'; // red for unconfigured
  let label = 'No provider';

  if (providerConfig.activeProvider === 'gemini') {
    dotColor = '#1A73E8'; // blue
    label = 'Gemini API';
  } else if (providerConfig.activeProvider === 'vertex') {
    dotColor = '#34A853'; // green
    label = 'Vertex AI';
  }

  return (
    <>
      {!hideBadge && (
        <button
          onClick={handleBadgeClick}
          className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-full bg-white hover:bg-slate-50 transition-colors shadow-sm"
        >
          <span className="type-level-3 text-slate-500 font-medium">
            Provider:
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
            <span className="type-level-2 text-slate-700">{label}</span>
            <svg
              className="w-3.5 h-3.5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </button>
      )}

      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <DialogContent className="sm:max-w-md z-[200]">
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <DialogDescription>
              Please enter your password to view or edit your sensitive API
              configurations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVerifyPassword();
                }}
              />
              {authError && (
                <p className="type-level-2 text-red-500">{authError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleVerifyPassword}
              disabled={isAuthenticating || !authPassword}
            >
              {isAuthenticating ? 'Verifying...' : 'Verify'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">AI Provider Settings</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none font-light"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-6">
              {/* Active Provider Selection */}
              <div>
                <label className="block type-level-2 text-slate-700 mb-2">
                  Active Provider
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTempActiveProvider('gemini')}
                    className={`px-3 py-2 border rounded-lg type-level-2 transition-colors ${
                      tempActiveProvider === 'gemini'
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Gemini API
                  </button>
                  <button
                    onClick={() => setTempActiveProvider('vertex')}
                    className={`px-3 py-2 border rounded-lg type-level-2 transition-colors ${
                      tempActiveProvider === 'vertex'
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Vertex AI
                  </button>
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              {/* Gemini Settings */}
              <div>
                <h4 className="type-level-2 text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#1A73E8]"></span>
                  Gemini API Configuration
                </h4>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="type-level-3 text-slate-600">
                      API Key
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 type-level-3"
                      onClick={handleToggleShow}
                    >
                      {showValues ? (
                        <EyeOff className="w-3 h-3 mr-1" />
                      ) : isAuthenticated ? (
                        <Eye className="w-3 h-3 mr-1" />
                      ) : (
                        <Lock className="w-3 h-3 mr-1" />
                      )}
                      {showValues ? 'Hide' : 'Reveal'}
                    </Button>
                  </div>
                  <input
                    type={showValues ? 'text' : 'password'}
                    value={tempGeminiKey}
                    onChange={(e) => setTempGeminiKey(e.target.value)}
                    disabled
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 type-level-2 text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 font-mono"
                  />
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              {/* Vertex Settings */}
              <div>
                <h4 className="type-level-2 text-slate-800 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#34A853]"></span>
                  Vertex AI Configuration
                </h4>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="type-level-3 text-slate-600">
                        Service Account JSON
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 type-level-3"
                        onClick={handleToggleShow}
                      >
                        {showValues ? (
                          <EyeOff className="w-3 h-3 mr-1" />
                        ) : isAuthenticated ? (
                          <Eye className="w-3 h-3 mr-1" />
                        ) : (
                          <Lock className="w-3 h-3 mr-1" />
                        )}
                        {showValues ? 'Hide' : 'Reveal'}
                      </Button>
                    </div>
                    {showValues ? (
                      <textarea
                        rows={4}
                        value={tempVertexKey}
                        onChange={(e) => {
                          setTempVertexKey(e.target.value);
                          try {
                            const parsed = JSON.parse(e.target.value);
                            if (parsed.project_id) {
                              setTempVertexProject(parsed.project_id);
                            }
                          } catch {
                            // ignore invalid JSON while typing
                          }
                        }}
                        placeholder='{"type": "service_account", ...}'
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 type-level-2 text-slate-900 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100 font-mono"
                      />
                    ) : (
                      <input
                        type="password"
                        value={tempVertexKey}
                        onChange={(e) => setTempVertexKey(e.target.value)}
                        placeholder='{"type": "service_account", ...}'
                        disabled
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 type-level-2 text-slate-900 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100 font-mono"
                      />
                    )}
                  </div>
                  <div className="flex gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="type-level-3 text-slate-600">
                        Project ID
                      </label>
                      <input
                        type="text"
                        value={tempVertexProject}
                        readOnly
                        placeholder="Auto-extracted"
                        className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 type-level-2 text-slate-500 cursor-not-allowed focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="type-level-3 text-slate-600">
                        Region
                      </label>
                      <input
                        type="text"
                        value={tempVertexRegion}
                        onChange={(e) => setTempVertexRegion(e.target.value)}
                        placeholder="us-central1"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 type-level-2 text-slate-900 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 type-level-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white type-level-2 rounded-lg transition-colors shadow-sm"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
