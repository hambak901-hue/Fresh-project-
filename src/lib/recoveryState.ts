/**
 * @file recoveryState.ts
 * Persists non-sensitive password-reset step metadata across tab refreshes,
 * mobile app switching (email OTP copy), and service worker updates.
 * Never stores plaintext passwords.
 */

export type RecoveryStep = 'forgot' | 'verify_otp' | 'reset_password';
export type RecoverySurface = 'modal' | 'login_screen';

export interface PasswordRecoveryState {
  step: RecoveryStep;
  surface: RecoverySurface;
  email: string;
  otpCode?: string;
  resetToken?: string;
  updatedAt: number;
}

const STORAGE_KEY = 'hambak_password_recovery_state';
const RECOVERY_TTL_MS = 15 * 60 * 1000;

export function getRecoveryState(): PasswordRecoveryState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PasswordRecoveryState;
    if (!parsed || !parsed.step || !parsed.updatedAt) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (Date.now() - parsed.updatedAt > RECOVERY_TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRecoveryState(
  state: Omit<PasswordRecoveryState, 'updatedAt'>
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PasswordRecoveryState = {
      ...state,
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage unavailability
  }
}

export function clearRecoveryState(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage unavailability
  }
}

export function hasActiveAuthRecoveryFlow(): boolean {
  if (typeof window === 'undefined') return false;
  if (getRecoveryState() !== null) return true;
  const path = (window.location.pathname || '').toLowerCase();
  const hash = (window.location.hash || '').toLowerCase();
  const search = (window.location.search || '').toLowerCase();
  return (
    path.includes('reset-password') ||
    hash.startsWith('#reset-password') ||
    search.includes('reset_token=') ||
    search.includes('mode=reset_password') ||
    search.includes('payment=verify')
  );
}
