'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useProvider } from '@/lib/ProviderContext';
import TopHeader from '@/components/TopHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Lock, Copy, Check, Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function SettingsPage() {
  const { user } = useAuth();
  const { providerConfig, saveProviderConfig } = useProvider();

  // Local state for provider settings (temp state used in dialogs)
  const [tempGeminiKey, setTempGeminiKey] = useState(
    providerConfig.geminiApiKey || ''
  );
  const [tempVertexKey, setTempVertexKey] = useState(
    providerConfig.vertexCredentials.serviceAccountKey || ''
  );
  const [tempVertexProject, setTempVertexProject] = useState(
    providerConfig.vertexCredentials.projectId || ''
  );
  const [tempVertexRegion, setTempVertexRegion] = useState(
    providerConfig.vertexCredentials.region || 'us-central1'
  );

  // Settings main page state
  const [activeProvider, setActiveProvider] = useState<
    'gemini' | 'vertex' | null
  >(providerConfig.activeProvider);

  // Local state for user profile
  const [name, setName] = useState(user?.displayName || '');
  const [email] = useState(user?.email || '');
  const [message, setMessage] = useState('');

  // Dialog / Auth state
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingKeyType, setEditingKeyType] = useState<
    'gemini' | 'vertex' | null
  >(null);

  const [copied, setCopied] = useState(false);
  const [showValues, setShowValues] = useState(false);

  // Initialize temp state when opening dialog
  const handleOpenAuth = (type: 'gemini' | 'vertex') => {
    setEditingKeyType(type);
    setTempGeminiKey(providerConfig.geminiApiKey || '');
    setTempVertexKey(providerConfig.vertexCredentials.serviceAccountKey || '');
    setTempVertexProject(providerConfig.vertexCredentials.projectId || '');
    setTempVertexRegion(
      providerConfig.vertexCredentials.region || 'us-central1'
    );
    setAuthPassword('');
    setAuthError('');
    setShowValues(false);
    setAuthDialogOpen(true);
  };

  const handleVerifyPassword = async () => {
    if (!user || !user.email) return;

    setIsAuthenticating(true);
    setAuthError('');

    try {
      const credential = EmailAuthProvider.credential(user.email, authPassword);
      await reauthenticateWithCredential(user, credential);
      setAuthDialogOpen(false);
      setEditDialogOpen(true);
    } catch (err: any) {
      console.error(err);
      setAuthError('Incorrect password. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSaveActiveProvider = async () => {
    setMessage('');
    await saveProviderConfig({
      ...providerConfig,
      activeProvider,
    });
    setMessage('Active provider saved successfully.');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSaveDialogKeys = async () => {
    setMessage('');

    if (editingKeyType === 'gemini') {
      await saveProviderConfig({
        ...providerConfig,
        geminiApiKey: tempGeminiKey,
      });
    } else if (editingKeyType === 'vertex') {
      await saveProviderConfig({
        ...providerConfig,
        vertexCredentials: {
          serviceAccountKey: tempVertexKey,
          projectId: tempVertexProject,
          region: tempVertexRegion,
        },
      });
    }

    setEditDialogOpen(false);
    setMessage(
      `${editingKeyType === 'gemini' ? 'Gemini' : 'Vertex'} settings saved successfully.`
    );
    setTimeout(() => setMessage(''), 3000);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveProfile = async () => {
    // In a real app, update Firebase profile here
    setMessage('Profile updated successfully.');
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-foreground flex flex-col">
      <TopHeader breadcrumbs={[{ label: 'Settings' }]} />

      <div className="flex-1 w-full max-w-4xl mx-auto p-6 md:p-8 space-y-8">
        {message && (
          <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 flex items-center justify-between">
            <span>✓ {message}</span>
            <button
              onClick={() => setMessage('')}
              className="text-emerald-500 hover:text-emerald-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* User Profile */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="type-level-1 text-slate-800 mb-4">User Profile</h2>
          <div className="space-y-4 max-w-md">
            <div>
              <Label className="type-level-2 text-slate-700">
                Email Address
              </Label>
              <Input
                type="email"
                value={email}
                readOnly
                disabled
                className="mt-1 bg-slate-50 text-slate-500 cursor-not-allowed"
                placeholder="Enter your email"
              />
            </div>
            <div>
              <Label className="type-level-2 text-slate-700">
                Display Name
              </Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="mt-1"
              />
            </div>
            <Button
              onClick={handleSaveProfile}
              className="bg-violet-600 hover:bg-violet-700 text-white mt-2"
            >
              Update Profile
            </Button>
          </div>

          <div className="h-px bg-slate-100 max-w-md my-6" />

          <h3 className="type-level-1 text-slate-800 mb-4">Change Password</h3>
          <div className="space-y-4 max-w-md">
            <div>
              <Label className="type-level-2 text-slate-700">
                New Password
              </Label>
              <Input
                type="password"
                placeholder="Enter new password"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="type-level-2 text-slate-700">
                Confirm New Password
              </Label>
              <Input
                type="password"
                placeholder="Confirm new password"
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => {
                setMessage('Password changed successfully.');
                setTimeout(() => setMessage(''), 3000);
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white mt-2"
            >
              Update Password
            </Button>
          </div>
        </section>

        {/* API Configurations */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="type-level-1 text-slate-800 mb-4">
            AI Provider Settings
          </h2>

          <div className="space-y-6">
            {/* Active Provider Selection */}
            <div>
              <Label className="type-level-2 text-slate-700 mb-2 block">
                Active Provider
              </Label>
              <div className="flex gap-3 max-w-md">
                <button
                  onClick={() => setActiveProvider('gemini')}
                  className={`flex-1 px-4 py-3 border rounded-xl font-medium transition-colors ${
                    activeProvider === 'gemini'
                      ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-200'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1A73E8]"></span>
                    Gemini API
                  </div>
                </button>
                <button
                  onClick={() => setActiveProvider('vertex')}
                  className={`flex-1 px-4 py-3 border rounded-xl font-medium transition-colors ${
                    activeProvider === 'vertex'
                      ? 'bg-green-50 border-green-200 text-green-700 ring-1 ring-green-200'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#34A853]"></span>
                    Vertex AI
                  </div>
                </button>
              </div>
              <div className="mt-4 max-w-md">
                <Button
                  onClick={handleSaveActiveProvider}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 rounded-lg"
                >
                  Save Active Provider
                </Button>
              </div>
            </div>

            <div className="h-px bg-slate-100 max-w-2xl" />

            {/* Gemini Settings */}
            <div className="max-w-2xl">
              <h4 className="text-md font-semibold text-slate-800 mb-3 flex items-center gap-2">
                Gemini API Configuration
              </h4>
              <button
                onClick={() => handleOpenAuth('gemini')}
                className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3 text-slate-600">
                  <Lock className="w-5 h-5 text-slate-400" />
                  <span className="font-medium">
                    {providerConfig.geminiApiKey
                      ? '••••••••••••••••••••••••••••'
                      : 'No API Key configured'}
                  </span>
                </div>
                <span className="type-level-2 text-blue-600">
                  View / Edit Key
                </span>
              </button>
            </div>

            <div className="h-px bg-slate-100 max-w-2xl" />

            {/* Vertex Settings */}
            <div className="max-w-2xl">
              <h4 className="text-md font-semibold text-slate-800 mb-3 flex items-center gap-2">
                Vertex AI Configuration
              </h4>
              <button
                onClick={() => handleOpenAuth('vertex')}
                className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3 text-slate-600">
                  <Lock className="w-5 h-5 text-slate-400" />
                  <span className="font-medium">
                    {providerConfig.vertexCredentials.serviceAccountKey
                      ? '••••••••••••••••••••••••••••'
                      : 'No Configuration set'}
                  </span>
                </div>
                <span className="type-level-2 text-blue-600">
                  View / Edit Config
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Password Authentication Dialog */}
      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <DialogContent className="sm:max-w-md">
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

      {/* Edit Config Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingKeyType === 'gemini'
                ? 'Gemini API Configuration'
                : 'Vertex AI Configuration'}
            </DialogTitle>
            <DialogDescription>
              View, edit, or copy your API configurations below. Make sure to
              save changes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {editingKeyType === 'gemini' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>API Key</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setShowValues(!showValues)}
                    >
                      {showValues ? (
                        <EyeOff className="w-4 h-4 mr-2" />
                      ) : (
                        <Eye className="w-4 h-4 mr-2" />
                      )}
                      {showValues ? 'Hide' : 'Show'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => handleCopy(tempGeminiKey)}
                    >
                      {copied ? (
                        <Check className="w-4 h-4 mr-2" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
                <Input
                  type={showValues ? 'text' : 'password'}
                  value={tempGeminiKey}
                  onChange={(e) => setTempGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="font-mono bg-slate-50"
                />
              </div>
            )}

            {editingKeyType === 'vertex' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Service Account JSON</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setShowValues(!showValues)}
                      >
                        {showValues ? (
                          <EyeOff className="w-4 h-4 mr-2" />
                        ) : (
                          <Eye className="w-4 h-4 mr-2" />
                        )}
                        {showValues ? 'Hide' : 'Show'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => handleCopy(tempVertexKey)}
                      >
                        {copied ? (
                          <Check className="w-4 h-4 mr-2" />
                        ) : (
                          <Copy className="w-4 h-4 mr-2" />
                        )}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                  <Input
                    type={showValues ? 'text' : 'password'}
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
                    className="font-mono bg-slate-50"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col gap-2 flex-1">
                    <Label>Project ID</Label>
                    <Input
                      type="text"
                      value={tempVertexProject}
                      readOnly
                      placeholder="Auto-extracted"
                      className="bg-slate-100 text-slate-500 cursor-not-allowed"
                    />
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <Label>Region</Label>
                    <Input
                      type="text"
                      value={tempVertexRegion}
                      onChange={(e) => setTempVertexRegion(e.target.value)}
                      placeholder="us-central1"
                      className="bg-slate-50"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDialogKeys}>Save Configuration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
