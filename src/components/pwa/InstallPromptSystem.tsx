/**
 * @file InstallPromptSystem.tsx
 * Multi-Platform App Installation Experience for HAMBAK TECH & SERVICES
 * Renders:
 * 1. Non-intrusive bottom installation pop-up (dismissible with TTL)
 * 2. Platform-aware Installation Modal (Android Signed APK + iOS Safari Guide + Desktop PWA)
 * 3. Permanent "Install App" button component for navbars, sidebars & footer
 * 4. Offline connectivity & controlled app update notifications
 */

import React, { useState, useContext, createContext } from 'react';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  MonitorDown,
  X,
  CheckCircle2,
  WifiOff,
  RefreshCw,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Info,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

type PwaContextValue = ReturnType<typeof usePWAInstall>;

const PwaInstallContext = createContext<PwaContextValue | null>(null);

export const PwaInstallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = usePWAInstall();
  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      <InstallSystemOverlays />
    </PwaInstallContext.Provider>
  );
};

export function usePwaInstallContext(): PwaContextValue | null {
  return useContext(PwaInstallContext);
}

/**
 * Reusable permanent "Install App" trigger button for Navbar, Sidebars, and Footer.
 * Automatically stays hidden if the user is already running inside the native Android APK or installed standalone PWA.
 */
export const InstallAppButton: React.FC<{
  variant?: 'navbar' | 'sidebar' | 'footer' | 'mobile-drawer';
  onAfterClick?: () => void;
}> = ({ variant = 'navbar', onAfterClick }) => {
  const ctx = usePwaInstallContext();
  if (!ctx || ctx.isStandalone || ctx.isAndroidAppShell) {
    return null;
  }

  const label =
    ctx.platform === 'android'
      ? 'Get Android App'
      : ctx.platform === 'ios'
      ? 'Add to iPhone'
      : 'Install App';

  const handleClick = () => {
    ctx.openInstallModal();
    onAfterClick?.();
  };

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/25 transition"
      >
        <div className="flex items-center gap-2">
          <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>{label}</span>
        </div>
        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
          {ctx.platform === 'android' ? 'APK' : 'App'}
        </span>
      </button>
    );
  }

  if (variant === 'mobile-drawer') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors"
      >
        <Download className="w-4 h-4" />
        <span>{label}</span>
      </button>
    );
  }

  if (variant === 'footer') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install HAMBAKTECH App</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/30 text-xs font-semibold text-emerald-800 dark:text-emerald-300 transition-colors whitespace-nowrap shrink-0"
    >
      <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      <span className="hidden xl:inline">{label}</span>
      <span className="xl:hidden">App</span>
    </button>
  );
};

const InstallSystemOverlays: React.FC = () => {
  const ctx = usePwaInstallContext();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<'recommended' | 'all'>('recommended');

  if (!ctx) return null;

  const {
    platform,
    browser,
    isAndroidAppShell,
    isStandalone,
    isOnline,
    needRefresh,
    bannerVisible,
    modalOpen,
    installingPwa,
    justInstalled,
    canOneClickInstallPwa,
    versionInfo,
    dismissBanner,
    openInstallModal,
    closeInstallModal,
    triggerPwaInstall,
    applyAppUpdate,
  } = ctx;

  const androidRelease = versionInfo.android;

  const handleCopySiteUrl = async () => {
    try {
      await navigator.clipboard.writeText('https://hambaktech.com.ng');
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <>
      {/* 1. OFFLINE CONNECTIVITY BANNER */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed top-3 left-1/2 -translate-x-1/2 z-[80] max-w-md w-[calc(100%-1.5rem)] px-4 py-2.5 rounded-2xl bg-amber-950/95 border border-amber-500/50 text-amber-100 shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs"
        >
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">You are offline.</span>{' '}
            <span className="text-amber-200/90">
              Cached pages work, but wallet, VTU &amp; NIN/BVN services require an active connection.
            </span>
          </div>
        </div>
      )}

      {/* 2. CONTROLLED SERVICE WORKER UPDATE TOAST */}
      {needRefresh && (
        <div
          role="alert"
          className="no-print fixed bottom-4 right-4 z-[80] max-w-sm w-[calc(100%-2rem)] p-4 rounded-2xl bg-slate-900 border border-blue-500/40 text-white shadow-2xl flex items-start gap-3"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0">
            <RefreshCw className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs space-y-2">
            <div className="font-bold">Update Available</div>
            <p className="text-slate-300 leading-relaxed">
              A newer version of HAMBAKTECH is ready. Refresh to apply the latest improvements.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={applyAppUpdate}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition"
              >
                Update Now
              </button>
              <button
                type="button"
                onClick={() => applyAppUpdate().catch(() => {})}
                className="sr-only"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. INSTALLATION SUCCESS TOAST */}
      {justInstalled && (
        <div className="no-print fixed bottom-4 right-4 z-[80] max-w-sm px-4 py-3 rounded-2xl bg-emerald-950/95 border border-emerald-500/40 text-emerald-100 shadow-2xl flex items-center gap-2.5 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>HAMBAKTECH App installed successfully on your device!</span>
        </div>
      )}

      {/* 4. NON-INTRUSIVE BOTTOM POP-UP BANNER */}
      {bannerVisible && !modalOpen && !isStandalone && !isAndroidAppShell && (
        <aside
          aria-label="Install HAMBAKTECH App"
          className="no-print fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:max-w-md z-[70] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <img
              src="/pwa-192x192.png"
              alt="HAMBAKTECH"
              className="w-11 h-11 rounded-xl shrink-0 border border-slate-200 dark:border-slate-700 object-cover"
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {platform === 'android'
                      ? 'Install HAMBAK Android App'
                      : platform === 'ios'
                      ? 'Add HAMBAKTECH to iPhone'
                      : 'Install HAMBAKTECH App'}
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug mt-0.5">
                    {platform === 'android'
                      ? 'Download the official signed Android APK for fast one-tap portal access.'
                      : platform === 'ios'
                      ? 'Save HAMBAKTECH directly to your Home Screen via Safari.'
                      : 'Launch HAMBAKTECH from your desktop in app mode with fast access.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissBanner(7)}
                  aria-label="Dismiss install banner"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {platform === 'android' ? (
                  <a
                    href={androidRelease.download_url}
                    download={`hambaktech-v${androidRelease.version_name}.apk`}
                    onClick={() => {
                      dismissBanner(7);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download APK (v{androidRelease.version_name})</span>
                  </a>
                ) : canOneClickInstallPwa ? (
                  <button
                    type="button"
                    disabled={installingPwa}
                    onClick={() => void triggerPwaInstall()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold shadow-sm transition"
                  >
                    <MonitorDown className="w-3.5 h-3.5" />
                    <span>{installingPwa ? 'Installing...' : 'Install Now'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openInstallModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>View Install Steps</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={openInstallModal}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition"
                >
                  Options
                </button>

                <button
                  type="button"
                  onClick={() => dismissBanner(30)}
                  className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-1.5 py-1"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* 5. MULTI-PLATFORM INSTALLATION MODAL */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hambak-install-modal-title"
          className="no-print fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto"
        >
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-6">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-blue-900 via-blue-800 to-slate-900 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/pwa-192x192.png"
                  alt="HAMBAKTECH"
                  className="w-12 h-12 rounded-2xl border border-white/20 bg-white/10 shrink-0"
                />
                <div>
                  <h3 id="hambak-install-modal-title" className="text-base font-extrabold tracking-tight">
                    Install HAMBAKTECH App
                  </h3>
                  <p className="text-xs text-blue-100/90">
                    Direct device installation &bull; No app store required
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => closeInstallModal()}
                aria-label="Close installation dialog"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Platform Switch Tabs */}
            <div className="px-6 pt-4 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab('recommended')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'recommended'
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                For This Device ({platform === 'ios' ? 'iPhone / iPad' : platform === 'android' ? 'Android' : platform === 'macos' ? 'macOS' : platform === 'windows' ? 'Windows' : 'Desktop'})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'all'
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                All Platforms (APK &amp; PWA)
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 text-xs text-slate-700 dark:text-slate-300 max-h-[70vh] overflow-y-auto">
              {(activeTab === 'recommended' && platform === 'android') || activeTab === 'all' ? (
                <section className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          Android Official APK (v{androidRelease.version_name})
                        </h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          Signed Android Package &bull; {androidRelease.min_android} &bull; {androidRelease.size_label}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {androidRelease.release_notes}
                  </p>

                  <a
                    href={androidRelease.download_url}
                    download={`hambaktech-v${androidRelease.version_name}.apk`}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-700/20 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Android App (APK v{androidRelease.version_name})</span>
                  </a>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5 text-[11px]">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>How to install on Android:</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300">
                      <li>Tap <strong>Download Android App</strong> above and wait for download to finish.</li>
                      <li>Tap <strong>Open</strong> on the downloaded <code className="font-mono">hambaktech-v{androidRelease.version_name}.apk</code> file.</li>
                      <li>If prompted, allow <strong>&ldquo;Install unknown apps&rdquo;</strong> for your browser, then tap <strong>Install</strong>.</li>
                    </ol>
                  </div>

                  {canOneClickInstallPwa && (
                    <button
                      type="button"
                      disabled={installingPwa}
                      onClick={() => void triggerPwaInstall()}
                      className="w-full py-2 px-3 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300/70 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[11px] flex items-center justify-center gap-2 transition"
                    >
                      <MonitorDown className="w-3.5 h-3.5" />
                      <span>Or Install Lightweight Web App (PWA) via Browser</span>
                    </button>
                  )}
                </section>
              ) : null}

              {(activeTab === 'recommended' && platform === 'ios') || activeTab === 'all' ? (
                <section className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center shrink-0">
                      <Share className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        iPhone &amp; iPad (Safari Web App)
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Installs to your Home Screen without Apple App Store
                      </p>
                    </div>
                  </div>

                  {platform === 'ios' && browser !== 'safari' && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] space-y-2">
                      <p className="font-semibold flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        <span>Open in Safari to install on iPhone/iPad</span>
                      </p>
                      <p>
                        Apple requires Safari to add apps to your iPhone or iPad Home Screen. Copy the link below and open it in Safari.
                      </p>
                      <button
                        type="button"
                        onClick={handleCopySiteUrl}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                      >
                        {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedUrl ? 'Link Copied!' : 'Copy hambaktech.com.ng Link'}</span>
                      </button>
                    </div>
                  )}

                  <ol className="space-y-2 text-[11px] text-slate-700 dark:text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                        1
                      </span>
                      <span>
                        Open <strong>https://hambaktech.com.ng</strong> in <strong>Safari</strong>, then tap the{' '}
                        <strong className="inline-flex items-center gap-1">
                          Share <Share className="w-3 h-3 inline text-blue-600 dark:text-blue-400" />
                        </strong>{' '}
                        button in Safari&apos;s toolbar.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                        2
                      </span>
                      <span>
                        Scroll down the Share sheet and tap{' '}
                        <strong className="inline-flex items-center gap-1">
                          Add to Home Screen <PlusSquare className="w-3 h-3 inline text-blue-600 dark:text-blue-400" />
                        </strong>
                        .
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                        3
                      </span>
                      <span>
                        Tap <strong>Add</strong> in the top corner. Launch <strong>HAMBAKTECH</strong> from your Home Screen like a native app.
                      </span>
                    </li>
                  </ol>
                </section>
              ) : null}

              {(activeTab === 'recommended' && platform !== 'android' && platform !== 'ios') ||
              activeTab === 'all' ? (
                <section className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                      <MonitorDown className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Windows &amp; macOS Desktop App (PWA)
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Opens HAMBAKTECH in a dedicated desktop window
                      </p>
                    </div>
                  </div>

                  {canOneClickInstallPwa ? (
                    <button
                      type="button"
                      disabled={installingPwa}
                      onClick={() => void triggerPwaInstall()}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition"
                    >
                      <MonitorDown className="w-4 h-4" />
                      <span>{installingPwa ? 'Opening Browser Prompt...' : 'Install Desktop App Now'}</span>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 text-[11px]">
                      {browser === 'safari' ? (
                        <>
                          <div className="font-bold text-slate-900 dark:text-white">
                            macOS Safari Instructions:
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">
                            In macOS Safari (macOS Sonoma+), click <strong>File &rarr; Add to Dock...</strong> or click the Share icon in the toolbar and choose <strong>Add to Dock</strong>.
                          </p>
                        </>
                      ) : browser === 'chrome' || browser === 'edge' ? (
                        <>
                          <div className="font-bold text-slate-900 dark:text-white">
                            Chrome / Edge Desktop Installation:
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">
                            Click the <strong>Install icon</strong> in the right side of the browser address bar, or open the browser menu (&vellip; / &hellip;) &rarr; <strong>Cast, save, and share &rarr; Install HAMBAK TECH &amp; SERVICES</strong>.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Browser App Install Notice</span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">
                            Your current browser does not provide one-click PWA desktop installation. For full desktop app installation on Windows or macOS, open <strong>https://hambaktech.com.ng</strong> in <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>macOS Safari</strong>.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </section>
              ) : null}

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                <span>HAMBAK TECH &amp; SERVICES &bull; Official Build</span>
                <button
                  type="button"
                  onClick={() => closeInstallModal(7)}
                  className="text-slate-600 dark:text-slate-300 hover:underline font-semibold"
                >
                  Remind me later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
