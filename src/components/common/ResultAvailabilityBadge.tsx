import React from 'react';
import { ResultAvailabilityState } from '../../types';

interface ResultAvailabilityBadgeProps {
  state?: ResultAvailabilityState | string | null;
  className?: string;
}

export const ResultAvailabilityBadge: React.FC<ResultAvailabilityBadgeProps> = ({
  state,
  className = '',
}) => {
  const normalized = String(state || '').toLowerCase();
  if (!normalized || normalized === 'none') return null;

  const map: Record<string, { label: string; classes: string }> = {
    document_available: {
      label: 'Official PDF Ready',
      classes:
        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    },
    result_available: {
      label: 'Result Available',
      classes: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25',
    },
    document_unavailable: {
      label: 'PDF Unavailable',
      classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
    },
    processing: {
      label: 'In Progress',
      classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
    },
    failed_or_rejected: {
      label: 'Failed / Rejected',
      classes: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
    },
  };

  const spec = map[normalized];
  if (!spec) return null;

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${spec.classes} ${className}`}
    >
      {spec.label}
    </span>
  );
};
