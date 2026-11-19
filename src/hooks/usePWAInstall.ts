/**
 * @file usePWAInstall.ts
 * Multi-platform App Installation, Standalone Detection, Network Status & Controlled SW Update Hook
 * Supports:
 * - Android Direct Signed APK download + optional PWA install
 * - iPhone/iPad (iOS & iPadOS) Safari Add to Home Screen guided flow
 * - Windows / macOS Chromium beforeinstallprompt + honest manual browser guidance
 * - Controlled VitePWA service worker updates + online/offline monitoring
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type AppPlatform = 'android' | 'ios' | 'windows' | 'macos' | 'other';
export type AppBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'opera' | 'other';

export interface AndroidReleaseInfo {
  version_code: number;
  version_name: string;
  download_url: string;
  sha256?: string;
  size_label: string;
  min_android: string;
  force_update: boolean;
  release_notes: string;
}

export interface AppVersionMetadata {
  available: boolean;
  android: AndroidReleaseInfo;
  pwa: {
    version: string;
  };
}

const DEFAULT_VERSION_METADATA: AppVersionMetadata = {
  available: true,
  android: {
    version_code: 2,
    version_name: '1.0.1',
    download_url: '/downloads/hambaktech-v1.0.1.apk',
    size_label: 'Signed Release APK',
    min_android: 'Android 7.0+',
    force_update: false,
    release_notes:
      'Official HAMBAK TECH & SERVICES Android App with native printing support, instant wallet funding, NIN/BVN verification & PDF slip downloads, Telecom VTU, Printing Services, and KYC document uploads.',
  },
  pwa: {
    version: '1.0.1',
  },
};

const DISMISS_STORAGE_KEY = 'hambak_app_install_dismiss_until';

function detectPlatform(): AppPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) {
    return 'android';
  }
  if (/windows|win32|win64/i.test(ua)) {
    return 'windows';
  }
  if (/macintosh|mac os x/i.test(ua)) {
    return 'macos';
  }
  return 'other';
}

function detectBrowser(platform: AppPlatform): AppBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/samsungbrowser/i.test(ua)) return 'samsung';
  if (/edg|edga|edgios/i.test(ua)) return 'edge';
  if (/opr|opera|opios/i.test(ua)) return 'opera';
  if (/fxios|firefox/i.test(ua)) return 'firefox';
  if (/crios|chrome/i.test(ua)) return 'chrome';
  if (platform === 'ios' && /safari/i.test(ua)) return 'safari';
  if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return 'safari';
  return 'other';
}

function checkIsAndroidAppShell(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /HambakTechAndroidApp/i.test(ua) || Boolean((window as any).HambakAndroidBridge);
}

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (checkIsAndroidAppShell()) return true;
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = Boolean((window.navigator as any).standalone === true);
  return displayStandalone || iosStandalone;
}

export function usePWAInstall() {
  const [platform] = useState<AppPlatform>(() => detectPlatform());
  const [browser] = useState<AppBrowser>(() => detectBrowser(detectPlatform()));
  const [isAndroidAppShell, setIsAndroidAppShell] = useState<boolean>(() => checkIsAndroidAppShell());
  const [isStandalone, setIsStandalone] = useState<boolean>(() => checkIsStandalone());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [needRefresh, setNeedRefresh] = useState<boolean>(false);
  const [bannerVisible, setBannerVisible] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [installingPwa, setInstallingPwa] = useState<boolean>(false);
  const [justInstalled, setJustInstalled] = useState<boolean>(false);
  const [versionInfo, setVersionInfo] = useState<AppVersionMetadata>(DEFAULT_VERSION_METADATA);
  const updateSwRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastUpdateCheckRef = useRef<number>(0);

  const checkServiceWorkerUpdate = useCallback(() => {
    const reg = swRegistrationRef.current;
    if (!reg) return;
    const now = Date.now();
    if (now - lastUpdateCheckRef.current < 60 * 1000) return;
    lastUpdateCheckRef.current = now;
    reg.update().catch(() => {});
  }, []);

  // Register Service Worker cleanly with auto-healing update sync + resume/online checks
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let intervalId: number | undefined;
    const bootTimestamp = Date.now();
    const hadControllerAtBoot = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      if (!hadControllerAtBoot) return;
      // If an older installed PWA receives a new SW within 6s of opening, reload once cleanly so stale bundles are replaced immediately
      if (Date.now() - bootTimestamp < 6000) {
        try {
          const lastSwReload = Number(sessionStorage.getItem('hambak_sw_reloaded_at') || '0');
          if (!lastSwReload || Date.now() - lastSwReload > 30000) {
            sessionStorage.setItem('hambak_sw_reloaded_at', String(Date.now()));
            window.location.reload();
            return;
          }
        } catch {
          // Fallback to non-disruptive prompt if sessionStorage is unavailable
        }
      }
      setNeedRefresh(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          setNeedRefresh(true);
        },
        onRegisteredSW(_swUrl, registration) {
          if (registration) {
            swRegistrationRef.current = registration;
            lastUpdateCheckRef.current = Date.now();
            // Trigger immediate background check so existing PWAs pick up new SW builds right away
            registration.update().catch(() => {});
            intervalId = window.setInterval(() => {
              checkServiceWorkerUpdate();
            }, 15 * 60 * 1000);
          }
        },
        onRegisterError() {
          // Non-fatal in unsupported / private contexts
        },
      });
      updateSwRef.current = updateSW;
    } catch {
      // Ignore registration failure
    }

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkServiceWorkerUpdate();
      }
    };
    const onOnlineSync = () => {
      checkServiceWorkerUpdate();
    };

    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);
    window.addEventListener('online', onOnlineSync);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
      window.removeEventListener('online', onOnlineSync);
    };
  }, [checkServiceWorkerUpdate]);

  // Capture browser beforeinstallprompt + display-mode + online/offline listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setBannerVisible(false);
      setJustInstalled(true);
      setTimeout(() => setJustInstalled(false), 6000);
    };

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const onDisplayModeChange = () => {
      setIsStandalone(checkIsStandalone());
      setIsAndroidAppShell(checkIsAndroidAppShell());
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    mediaQuery?.addEventListener?.('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      mediaQuery?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  // Fetch live Android APK / App version metadata (and re-fetch when reconnecting)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true;
    const loadVersion = async () => {
      try {
        const res = await fetch('/api/app/version', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (active && data?.android?.download_url) {
            setVersionInfo({
              available: data.android.available !== false,
              android: {
                ...DEFAULT_VERSION_METADATA.android,
                ...data.android,
              },
              pwa: data.pwa || DEFAULT_VERSION_METADATA.pwa,
            });
            return;
          }
        }
      } catch {
        // Fallback to static metadata JSON
      }
      try {
        const resStatic = await fetch('/downloads/app-version.json', { cache: 'no-store' });
        if (resStatic.ok) {
          const dataStatic = await resStatic.json();
          if (active && dataStatic?.android?.download_url) {
            setVersionInfo({
              available: dataStatic.android.available !== false,
              android: {
                ...DEFAULT_VERSION_METADATA.android,
                ...dataStatic.android,
              },
              pwa: dataStatic.pwa || DEFAULT_VERSION_METADATA.pwa,
            });
          }
        }
      } catch {
        // Keep built-in defaults
      }
    };
    void loadVersion();
    const onOnlineRefreshVersion = () => {
      void loadVersion();
    };
    window.addEventListener('online', onOnlineRefreshVersion);
    return () => {
      active = false;
      window.removeEventListener('online', onOnlineRefreshVersion);
    };
  }, []);

  // Smart non-intrusive delayed popup for un-installed visitors
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone || isAndroidAppShell) {
      setBannerVisible(false);
      return;
    }

    try {
      const dismissedUntil = Number(localStorage.getItem(DISMISS_STORAGE_KEY) || '0');
      if (dismissedUntil && Date.now() < dismissedUntil) {
        return;
      }
    } catch {
      // Ignore storage block
    }

    const timer = window.setTimeout(() => {
      if (!checkIsStandalone()) {
        setBannerVisible(true);
      }
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [isStandalone, isAndroidAppShell]);

  const dismissBanner = useCallback((days: number = 7) => {
    setBannerVisible(false);
    try {
      const until = Date.now() + days * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_STORAGE_KEY, String(until));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const openInstallModal = useCallback(() => {
    setBannerVisible(false);
    setModalOpen(true);
  }, []);

  const closeInstallModal = useCallback((suppressDays?: number) => {
    setModalOpen(false);
    if (typeof suppressDays === 'number' && suppressDays > 0) {
      try {
        localStorage.setItem(
          DISMISS_STORAGE_KEY,
          String(Date.now() + suppressDays * 24 * 60 * 60 * 1000)
        );
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const triggerPwaInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    setInstallingPwa(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        setModalOpen(false);
        setBannerVisible(false);
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    } finally {
      setInstallingPwa(false);
    }
  }, [deferredPrompt]);

  const applyAppUpdate = useCallback(async () => {
    setNeedRefresh(false);
    if (updateSwRef.current) {
      await updateSwRef.current(true);
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const dismissUpdatePrompt = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  const canOneClickInstallPwa = Boolean(deferredPrompt);

  return {
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
    dismissUpdatePrompt,
  };
}
