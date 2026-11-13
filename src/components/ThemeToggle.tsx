import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact = false, className = '' }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Night Mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Night Mode'}
      className={`inline-flex items-center gap-1.5 rounded-xl border transition-colors font-medium text-xs ${
        compact ? 'p-2' : 'px-3 py-1.5'
      } bg-white hover:bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-200 dark:border-slate-700 ${className}`}
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 text-amber-400" />
          {!compact && <span>Light</span>}
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-blue-700" />
          {!compact && <span>Night</span>}
        </>
      )}
    </button>
  );
};
