/**
 * @file AnnouncementsPage.tsx
 * Official announcements & advisories board for HAMBAK TECH & SERVICES.
 * Full Light & Night mode contrast support.
 */

import React, { useState } from 'react';
import { useCms } from '../../context/CmsContext';
import { AnnouncementItem } from '../../types';
import { Bell, Pin, Calendar, User, ChevronRight, X, AlertTriangle, Sparkles, Wrench } from 'lucide-react';

export const AnnouncementsPage: React.FC = () => {
  const { announcements, branding } = useCms();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeModalItem, setActiveModalItem] = useState<AnnouncementItem | null>(null);

  const categories = [
    { id: 'all', label: 'All Notices' },
    { id: 'update', label: 'System Updates' },
    { id: 'offer', label: 'Pricing & Promos' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'security', label: 'Security Alerts' },
  ];

  const filtered = (announcements || []).filter((item) => {
    if (selectedCategory === 'all') return true;
    return item.category === selectedCategory;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'offer':
        return <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
      case 'maintenance':
        return <Wrench className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />;
      case 'security':
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
      default:
        return <Bell className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />;
    }
  };

  return (
    <div className="space-y-10 py-4">
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
          <span>Official Notice Board</span>
          <span className="text-slate-400">&bull;</span>
          <span>{branding?.company_name || 'HAMBAK TECH & SERVICES'}</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          Announcements &amp; Advisories
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Official updates on service availability, tariff adjustments, Academy admission windows, and scheduled maintenance.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
              selectedCategory === cat.id
                ? 'bg-blue-700 border-blue-700 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-500 dark:text-slate-400 text-xs">
            No announcements found in this category.
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setActiveModalItem(item)}
              className={`rounded-2xl p-6 sm:p-7 border cursor-pointer transition-all shadow-sm ${
                item.is_pinned
                  ? 'bg-blue-50/70 dark:bg-slate-900 border-blue-300 dark:border-blue-500/40'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 text-xs">
                  {item.is_pinned && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-700 text-white text-[10px] font-bold">
                      <Pin className="w-3 h-3" />
                      <span>PINNED</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    {getCategoryIcon(item.category)}
                    <span>{item.category}</span>
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {new Date(item.created_at).toLocaleDateString('en-NG', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </span>
                  <span>&bull;</span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>{item.author}</span>
                  </span>
                </div>
              </div>

              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{item.title}</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-2 leading-relaxed">
                {item.content}
              </p>

              <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1">
                  <span>Read full notice</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {activeModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 space-y-4">
            <button
              type="button"
              onClick={() => setActiveModalItem(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-[11px] font-semibold text-blue-700 dark:text-amber-400 uppercase tracking-wider">
              {activeModalItem.category}
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight pr-6">
              {activeModalItem.title}
            </h3>

            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-3">
              <span>
                Author: <strong className="text-slate-800 dark:text-slate-200">{activeModalItem.author}</strong>
              </span>
              <span>&bull;</span>
              <span>{new Date(activeModalItem.created_at).toLocaleString('en-NG')}</span>
            </div>

            <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap pt-2">
              {activeModalItem.content}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModalItem(null)}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-xs font-semibold text-white"
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
