'use client';

import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  Mail, 
  User as UserIcon, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  Lock, 
  ArrowLeft,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  signupUser, 
  loginUser, 
  githubLoginUser, 
  forgotPassword, 
  resetPassword, 
  AuthResponse, 
  User 
} from '../../lib/api';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

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

interface AuthViewProps {
  onSuccess: (user: User) => void;
}

export default function AuthView({ onSuccess }: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  
  // Form fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Check URL query parameters for GitHub OAuth callback or Reset Password on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    
    // 1. GitHub Callback processing
    const code = urlParams.get('code');
    const isGithubCallback = window.location.pathname === '/github/callback' || urlParams.has('code');
    
    if (code && isGithubCallback) {
      handleGitHubCallback(code);
    }

    // 2. Forgot Password reset link callback
    const resetEmail = urlParams.get('email');
    const resetOtp = urlParams.get('otp');
    if (resetEmail && resetOtp) {
      setEmail(resetEmail);
      setOtp(resetOtp);
      setMode('reset');
      setInfo('Reset link detected. Please enter your new password.');
      // Clean query params so refresh doesn't lock it
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleGitHubCallback = async (code: string) => {
    setGithubLoading(true);
    setError(null);
    try {
      // Clean query parameters from address bar
      window.history.replaceState({}, document.title, window.location.pathname);
      const res: AuthResponse = await githubLoginUser(code);
      setInfo('GitHub authentication successful!');
      setTimeout(() => {
        onSuccess(res.user);
      }, 800);
    } catch (err: any) {
      setError(err?.message || 'GitHub authentication failed. Please try again.');
    } finally {
      setGithubLoading(false);
    }
  };

  const handleGitHubLoginClick = () => {
    setGithubLoading(true);
    setError(null);
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || 'Ov23liakfpajpVfVMrhG';
    // Direct browser to GitHub OAuth
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user:email`;
  };

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!email || !password) throw new Error('Please enter all credentials.');
        const res = await loginUser(email, password);
        setInfo('Logged in successfully!');
        setTimeout(() => {
          onSuccess(res.user);
        }, 800);
      } 
      
      else if (mode === 'signup') {
        if (!username || !email || !password || !confirmPassword) {
          throw new Error('Please fill in all details.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        await signupUser(username, email, password);
        setInfo('Account registered successfully! You can now log in.');
        setTimeout(() => {
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }, 1500);
      } 
      
      else if (mode === 'forgot') {
        if (!email) throw new Error('Please enter your email address.');
        await forgotPassword(email);
        setInfo('OTP and reset link have been successfully sent to your registered email address!');
        setTimeout(() => {
          setMode('reset');
        }, 2500);
      } 
      
      else if (mode === 'reset') {
        if (!email || !otp || !password) {
          throw new Error('Please provide email, OTP, and new password.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        await resetPassword({ email, otp, new_password: password });
        setInfo('Password reset successful! Redirecting to login...');
        setTimeout(() => {
          setMode('login');
          setPassword('');
          setOtp('');
        }, 1500);
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-height-viewport flex items-center justify-center p-6 select-none bg-brand-bg relative overflow-hidden" 
         style={{ minHeight: '100vh', background: 'var(--color-brand-bg)' }}>
      
      {/* Dynamic Background Glow Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-md glass-panel rounded-2xl border border-line shadow-2xl p-8 relative z-10 transition-all duration-300"
           style={{ 
             background: 'var(--color-glass-panel-bg)',
             borderColor: 'var(--color-glass-panel-border)',
             boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)'
           }}>
        
        {/* App Logo & Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-500 hover:rotate-12"
               style={{ 
                 background: 'linear-gradient(135deg, var(--color-accent), #a78bfa)',
                 boxShadow: '0 8px 24px -6px var(--color-accent)'
               }}>
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'Outfit' }}>
            RepoMind AI
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Elevate your repository comprehension
          </p>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs mb-5 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {info && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs mb-5 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="font-medium">{info}</p>
          </div>
        )}



        {/* Main form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* USERNAME FIELD (Sign-up only) */}
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                Username
              </label>
              <div className="relative group">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors group-focus-within:text-purple-400" 
                          style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type="text"
                  required
                  placeholder="john_doe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border bg-black/20 focus:outline-none transition-all text-sm"
                  style={{ 
                    borderColor: 'var(--color-glass-panel-border)', 
                    color: 'var(--color-text-primary)'
                  }}
                />
              </div>
            </div>
          )}

          {/* EMAIL/LOGIN FIELD */}
          {mode !== 'reset' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                {mode === 'login' ? 'Email or Username' : 'Email Address'}
              </label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors group-focus-within:text-purple-400" 
                      style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type={mode === 'login' ? 'text' : 'email'}
                  required
                  placeholder={mode === 'login' ? 'Enter username or email' : 'you@example.com'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border bg-black/20 focus:outline-none transition-all text-sm"
                  style={{ 
                    borderColor: 'var(--color-glass-panel-border)', 
                    color: 'var(--color-text-primary)'
                  }}
                />
              </div>
            </div>
          )}

          {/* OTP FIELD (Reset only) */}
          {mode === 'reset' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={email}
                  className="w-full px-4 py-2.5 rounded-xl border bg-black/40 text-sm focus:outline-none opacity-60"
                  style={{ 
                    borderColor: 'var(--color-glass-panel-border)', 
                    color: 'var(--color-text-primary)'
                  }}
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                  OTP Code
                </label>
                <div className="relative group">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                  <input
                    type="text"
                    required
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border bg-black/20 focus:outline-none transition-all text-sm tracking-widest text-center font-bold"
                    style={{ 
                      borderColor: 'var(--color-glass-panel-border)', 
                      color: 'var(--color-text-primary)'
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {/* PASSWORD FIELD */}
          {mode !== 'forgot' && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                  {mode === 'reset' ? 'New Password' : 'Password'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-xs hover:underline focus:outline-none transition-colors"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors group-focus-within:text-purple-400" 
                      style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder={mode === 'signup' ? 'Create a strong password' : mode === 'reset' ? 'Enter new password' : '••••••••'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-2.5 rounded-xl border bg-black/20 focus:outline-none transition-all text-sm"
                  style={{ 
                    borderColor: 'var(--color-glass-panel-border)', 
                    color: 'var(--color-text-primary)'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 hover:text-purple-400 transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* CONFIRM PASSWORD (Sign-up only) */}
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                Confirm Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border bg-black/20 focus:outline-none transition-all text-sm"
                  style={{ 
                    borderColor: 'var(--color-glass-panel-border)', 
                    color: 'var(--color-text-primary)'
                  }}
                />
              </div>
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={loading || githubLoading}
            className="w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition-all duration-300 relative overflow-hidden group shadow-lg hover:shadow-purple-500/20 active:scale-[0.98]"
            style={{ 
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-brand-accent))',
            }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Send OTP Code' : 'Update Password'}
                </span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        {/* Dynamic Navigations Between Credential Screens */}
        <div className="flex justify-center text-xs mt-5">
          {mode === 'login' ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Don't have an account?{' '}
              <button 
                type="button" 
                onClick={() => { setMode('signup'); resetMessages(); }}
                className="font-bold hover:underline focus:outline-none"
                style={{ color: 'var(--color-accent)' }}
              >
                Sign Up
              </button>
            </p>
          ) : mode === 'signup' ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Already have an account?{' '}
              <button 
                type="button" 
                onClick={() => { setMode('login'); resetMessages(); }}
                className="font-bold hover:underline focus:outline-none"
                style={{ color: 'var(--color-accent)' }}
              >
                Sign In
              </button>
            </p>
          ) : (
            <button 
              type="button" 
              onClick={() => { setMode('login'); resetMessages(); }}
              className="flex items-center gap-1 font-semibold hover:underline focus:outline-none"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </button>
          )}
        </div>

        {/* Separator (Show only when not in forgot/reset flow) */}
        {(mode === 'login' || mode === 'signup') && (
          <>
            <div className="relative my-6 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: 'var(--color-glass-panel-border)' }} />
              </div>
              <span className="relative px-3 text-xs uppercase font-semibold tracking-widest bg-brand-bg" 
                    style={{ 
                      color: 'var(--color-text-muted)', 
                      backgroundColor: 'var(--color-brand-card)',
                      borderRadius: '4px' 
                    }}>
                Or Continue With
              </span>
            </div>

            {/* GITHUB LOGIN BUTTON */}
            <button
              type="button"
              disabled={loading || githubLoading}
              onClick={handleGitHubLoginClick}
              className="w-full py-3 px-4 rounded-xl border flex items-center justify-center gap-2.5 font-bold transition-all duration-300 bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98]"
              style={{ 
                borderColor: 'var(--color-glass-panel-border)', 
                color: 'var(--color-text-primary)'
              }}
            >
              {githubLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <GithubIcon className="w-5 h-5 text-purple-400" />
                  <span>Log in with GitHub</span>
                </>
              )}
            </button>
          </>
        )}
        
      </div>
    </div>
  );
}
