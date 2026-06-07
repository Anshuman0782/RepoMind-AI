'use client';

import React, { useState } from 'react';
import { 
  X, 
  User as UserIcon, 
  KeyRound, 
  Moon, 
  Sun, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Settings, 
  Lock, 
  Sparkles,
  Link,
  Unlink,
  LogOut
} from 'lucide-react';
import { User, updateProfile, updatePassword, unlinkGitHub } from '../../lib/api';

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

type SettingsTab = 'profile' | 'github' | 'theme';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUserUpdate: (user: User) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  onLogout: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  currentUser,
  onUserUpdate,
  theme,
  setTheme,
  onLogout,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  
  // Profile Settings States
  const [newUsername, setNewUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Loading & Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetFeedback = () => {
    setError(null);
    setSuccess(null);
  };

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    setLoading(true);
    try {
      const updatedUser = await updateProfile(newUsername);
      onUserUpdate(updatedUser);
      setSuccess('Username updated successfully!');
    } catch (err: any) {
      setError(err?.message || 'Failed to update username.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err?.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkGitHub = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || 'Ov23liakfpajpVfVMrhG';
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user:email`;
  };

  const handleLogoutClick = () => {
    const confirmed = window.confirm('Are you sure you want to log out of your session?');
    if (!confirmed) return;
    onClose();
    onLogout();
  };

  const handleUnlinkGitHub = async () => {
    const confirmed = window.confirm('Are you sure you want to unlink your GitHub account? Standard login credentials will still remain active.');
    if (!confirmed) return;

    resetFeedback();
    setLoading(true);
    try {
      const updatedUser = await unlinkGitHub();
      onUserUpdate(updatedUser);
      setSuccess('GitHub account unlinked successfully!');
    } catch (err: any) {
      setError(err?.message || 'Failed to unlink GitHub account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300 animate-fade-in">
      <div className="w-full max-w-2xl glass-panel rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col md:flex-row relative max-h-[90vh] md:max-h-[600px] z-10 transition-all duration-300"
           style={{ 
             background: 'var(--color-glass-panel-bg)',
             borderColor: 'var(--color-glass-panel-border)',
             boxShadow: '0 25px 60px -15px rgba(0,0,0,0.6)'
           }}>
        
        {/* Absolute Close Icon */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 bg-panel border border-line/25 text-zinc-400 hover:text-ink hover:bg-line/45 transition-colors z-20"
        >
          <X className="w-4.5 h-4.5" />
        </button>

        {/* Modal Left Sidebar - Tabs */}
        <div className="w-full md:w-48 border-b md:border-b-0 md:border-r p-5 md:py-6 flex flex-col gap-1 shrink-0 bg-black/10"
             style={{ borderColor: 'var(--color-glass-panel-border)' }}>
          <div className="flex items-center gap-2 mb-6 hidden md:flex">
            <Settings className="w-5 h-5 text-purple-400 animate-spin-slow" />
            <h3 className="font-bold text-sm tracking-wide uppercase" style={{ color: 'var(--color-text-primary)', fontFamily: 'Outfit' }}>
              Settings
            </h3>
          </div>
          
          <button
            onClick={() => { setActiveTab('profile'); resetFeedback(); }}
            className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all text-left ${
              activeTab === 'profile' 
                ? 'bg-purple-600/15 border-purple-500/20 text-purple-400 font-bold border' 
                : 'text-zinc-400 hover:text-ink hover:bg-white/[0.03] border border-transparent'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Profile Settings</span>
          </button>
          
          <button
            onClick={() => { setActiveTab('github'); resetFeedback(); }}
            className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all text-left ${
              activeTab === 'github' 
                ? 'bg-purple-600/15 border-purple-500/20 text-purple-400 font-bold border' 
                : 'text-zinc-400 hover:text-ink hover:bg-white/[0.03] border border-transparent'
            }`}
          >
            <GithubIcon style={{ width: 16, height: 16 }} />
            <span>GitHub Profile</span>
          </button>
          
          <button
            onClick={() => { setActiveTab('theme'); resetFeedback(); }}
            className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all text-left ${
              activeTab === 'theme' 
                ? 'bg-purple-600/15 border-purple-500/20 text-purple-400 font-bold border' 
                : 'text-zinc-400 hover:text-ink hover:bg-white/[0.03] border border-transparent'
            }`}
          >
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span>Workspace Theme</span>
          </button>

          {/* Spacer to push Logout to bottom */}
          <div className="flex-1 min-h-[20px]" />

          {/* Red Logout Button */}
          <button
            onClick={handleLogoutClick}
            className="w-full py-2.5 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all text-left text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent mt-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>

        {/* Modal Right Area - Panels */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto flex flex-col">
          
          {/* Notifications */}
          {error && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs mb-5 shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="font-semibold">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs mb-5 shrink-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <p className="font-semibold">{success}</p>
            </div>
          )}

          <div className="flex-1 flex flex-col justify-center">

            {/* TAB PANEL 1: PROFILE SETTINGS */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Username Modification */}
                <form onSubmit={handleUpdateUsername} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Profile Username
                    </label>
                    <div className="flex gap-2.5">
                      <div className="relative flex-1 group">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 transition-colors group-focus-within:text-purple-400" />
                        <input
                          type="text"
                          required
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 rounded-xl border bg-black/20 focus:outline-none transition-all text-xs"
                          style={{ borderColor: 'var(--color-glass-panel-border)', color: 'var(--color-text-primary)' }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading || newUsername === currentUser.username}
                        className="py-2 px-4 rounded-xl font-bold text-xs text-white transition-all bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 shrink-0"
                      >
                        Update Name
                      </button>
                    </div>
                  </div>
                </form>

                <div className="border-t" style={{ borderColor: 'var(--color-glass-panel-border)' }} />

                {/* Password Modification */}
                <form onSubmit={handleUpdatePassword} className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Change Credentials Password
                  </h4>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase">Current Password</label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-purple-400" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-xl border bg-black/20 focus:outline-none transition-all text-xs"
                        style={{ borderColor: 'var(--color-glass-panel-border)', color: 'var(--color-text-primary)' }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase">New Password</label>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-purple-400" />
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 rounded-xl border bg-black/20 focus:outline-none transition-all text-xs"
                          style={{ borderColor: 'var(--color-glass-panel-border)', color: 'var(--color-text-primary)' }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase">Confirm Password</label>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-purple-400" />
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 rounded-xl border bg-black/20 focus:outline-none transition-all text-xs"
                          style={{ borderColor: 'var(--color-glass-panel-border)', color: 'var(--color-text-primary)' }}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white transition-all bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 shadow-md active:scale-[0.98]"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Change Account Password'}
                  </button>
                </form>
              </div>
            )}

            {/* TAB PANEL 2: GITHUB INTEGRATION */}
            {activeTab === 'github' && (
              <div className="flex flex-col items-center justify-center text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-black/10 border"
                     style={{ 
                       borderColor: currentUser.has_github ? '#10b981' : 'var(--color-glass-panel-border)',
                       boxShadow: currentUser.has_github ? '0 0 15px rgba(16, 185, 129, 0.1)' : 'none'
                     }}>
                  <GithubIcon style={{ width: 32, height: 32, color: currentUser.has_github ? '#10b981' : 'var(--color-text-secondary)' }} />
                </div>
                
                <div className="space-y-1">
                  <h4 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'Outfit' }}>
                    GitHub Authorization Connection
                  </h4>
                  <p className="text-xs max-w-sm mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                    Once connected, a single one-time login links all workspace repositories, hiding connection banners globally.
                  </p>
                </div>

                <div className="glass-panel p-3.5 rounded-xl border flex items-center gap-3 text-xs w-full max-w-sm justify-center bg-black/5"
                     style={{ borderColor: 'var(--color-glass-panel-border)' }}>
                  <div className={`w-2.5 h-2.5 rounded-full ${currentUser.has_github ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {currentUser.has_github 
                      ? `Linked to GitHub profile @${currentUser.github_user_login || 'Linked'}` 
                      : 'Not Connected to GitHub'}
                  </span>
                </div>

                {currentUser.has_github ? (
                  <button
                    onClick={handleUnlinkGitHub}
                    disabled={loading}
                    className="py-2.5 px-6 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs flex items-center gap-2.5 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    <Unlink className="w-4 h-4" />
                    <span>Disconnect GitHub Profile</span>
                  </button>
                ) : (
                  <button
                    onClick={handleLinkGitHub}
                    disabled={loading}
                    className="py-2.5 px-6 rounded-xl font-bold text-xs text-white transition-all flex items-center gap-2.5 shadow-lg active:scale-[0.98] hover:shadow-purple-500/10"
                    style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-brand-accent))' }}
                  >
                    <Link className="w-4 h-4" />
                    <span>Link GitHub Profile</span>
                  </button>
                )}
              </div>
            )}

            {/* TAB PANEL 3: THEME OPTIONS */}
            {activeTab === 'theme' && (
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="space-y-1">
                  <h4 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'Outfit' }}>
                    Workspace Appearance
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Switch between deep focus dark styling or rich details light themes.
                  </p>
                </div>

                {/* Theme Selector Switches */}
                <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`p-4 rounded-xl border flex flex-col items-center gap-2.5 transition ${
                      theme === 'dark'
                        ? 'bg-purple-600/10 border-purple-500/30 text-purple-400 font-bold'
                        : 'bg-black/10 border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Moon className="w-6 h-6" />
                    <span className="text-xs">Focus Dark</span>
                  </button>

                  <button
                    onClick={() => setTheme('light')}
                    className={`p-4 rounded-xl border flex flex-col items-center gap-2.5 transition ${
                      theme === 'light'
                        ? 'bg-purple-600/10 border-purple-500/30 text-purple-400 font-bold'
                        : 'bg-black/10 border-transparent text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <Sun className="w-6 h-6" />
                    <span className="text-xs">Clarity Light</span>
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
