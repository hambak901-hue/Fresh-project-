/**
 * @file RootErrorBoundary.tsx
 * Production-grade React Error Boundary ensuring runtime UI exceptions never render a blank white screen.
 * Provides instant section retry, soft reload, and Service Worker / Workbox cache repair recovery.
 */

import React from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

interface RootErrorBoundaryProps {
  children: React.ReactNode;
  scopeLabel?: string;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class RootErrorBoundary extends React.Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected application rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[HAMBAKTECH ${this.props.scopeLabel || 'App'} ErrorBoundary]`, error, info);
  }

  private handleResetView = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  private handleRepairAndReload = async () => {
    try {
      const clearFn = (window as any).__hambakClearCacheAndReload;
      if (typeof clearFn === 'function') {
        clearFn();
        return;
      }
      if ('caches' in window && typeof caches.keys === 'function') {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
      }
    } catch {
      // Fallback to standard reload
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>HAMBAK TECH &amp; SERVICES</span>
            </div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              Display Recovery Needed
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              A temporary interface error prevented this screen from rendering cleanly. Your account, wallet balance, and transactions remain safe.
            </p>
            {this.state.errorMessage && (
              <p className="text-[11px] font-mono bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-rose-600 dark:text-rose-400 break-words">
                {this.state.errorMessage}
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => void this.handleRepairAndReload()}
              className="w-full py-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Repair App Cache &amp; Reload</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={this.handleResetView}
                className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition"
              >
                Retry View
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
