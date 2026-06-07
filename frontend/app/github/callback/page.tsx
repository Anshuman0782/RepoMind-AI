'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { githubLoginUser, linkGitHubUser } from '../../../lib/api';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your GitHub authorization...');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setStatus('error');
      setMessage('Authorization code is missing from GitHub redirect. Please try logging in again.');
      return;
    }

    const token = localStorage.getItem('repomind_token');
    
    if (token) {
      // Linking GitHub to existing session
      linkGitHubUser(code)
        .then(() => {
          setStatus('success');
          setMessage('GitHub account linked successfully! Returning to dashboard...');
          setTimeout(() => {
            router.push('/');
          }, 1500);
        })
        .catch((err) => {
          setStatus('error');
          setMessage(err?.message || 'GitHub linking failed. Please try again.');
        });
    } else {
      // Logging in with GitHub
      githubLoginUser(code)
        .then(() => {
          setStatus('success');
          setMessage('Logged in with GitHub successfully! Preparing your workspace...');
          setTimeout(() => {
            router.push('/');
          }, 1500);
        })
        .catch((err) => {
          setStatus('error');
          setMessage(err?.message || 'GitHub OAuth login failed. Please try again.');
        });
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 relative overflow-hidden" 
         style={{ background: 'var(--color-brand-bg)' }}>
      {/* Background orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-md glass-panel rounded-2xl border border-line p-8 flex flex-col items-center gap-6 relative z-10 text-center"
           style={{ 
             background: 'var(--color-glass-panel-bg)',
             borderColor: 'var(--color-glass-panel-border)',
             boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)'
           }}>
        
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all"
             style={{ 
               background: status === 'error' 
                 ? 'linear-gradient(135deg, #ef4444, #b91c1c)' 
                 : status === 'success'
                 ? 'linear-gradient(135deg, #10b981, #047857)'
                 : 'linear-gradient(135deg, var(--color-accent), #a78bfa)',
               boxShadow: status === 'error'
                 ? '0 8px 24px -6px rgba(239, 68, 68, 0.4)'
                 : status === 'success'
                 ? '0 8px 24px -6px rgba(16, 185, 129, 0.4)'
                 : '0 8px 24px -6px var(--color-accent)'
             }}>
          {status === 'loading' && <Loader2 className="w-7 h-7 text-white animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-7 h-7 text-white" />}
          {status === 'error' && <AlertCircle className="w-7 h-7 text-white" />}
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)', fontFamily: 'Outfit' }}>
            {status === 'loading' && 'Verifying Session'}
            {status === 'success' && 'Connection Successful'}
            {status === 'error' && 'Verification Failed'}
          </h2>
          <p className="text-sm font-medium leading-relaxed px-2" style={{ color: 'var(--color-text-secondary)' }}>
            {message}
          </p>
        </div>

        {status === 'error' && (
          <button
            onClick={() => router.push('/')}
            className="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98]"
          >
            Return to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6" style={{ background: 'var(--color-brand-bg)' }}>
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
