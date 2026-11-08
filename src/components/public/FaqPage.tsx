/**
 * @file FaqPage.tsx
 * Frequently Asked Questions page for HambakTech Enterprise.
 * Features search filter, category tabs, and accordion panels powered by dynamic CMS data.
 */

import React, { useState } from 'react';
import { useCms } from '../../context/CmsContext';
import { HelpCircle, ChevronDown, Search, ArrowRight, MessageCircle } from 'lucide-react';

interface FaqPageProps {
  onNavigate: (page: string) => void;
}

export const FaqPage: React.FC<FaqPageProps> = ({ onNavigate }) => {
  const { faqs } = useCms();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({
    faq_1: true,
    faq_2: true,
  });

  const toggleAccordion = (id: string) => {
    setOpenIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const categories = [
    { id: 'all', label: 'All Questions' },
    { id: 'general', label: 'General' },
    { id: 'verification', label: 'Identity (NIN/BVN)' },
    { id: 'telecom', label: 'Data & Telecom' },
    { id: 'wallet', label: 'Wallet & Billing' },
    { id: 'api', label: 'Developer API' },
  ];

  const filteredFaqs = (faqs || []).filter(faq => {
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-12 py-4">
      {/* Header */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <span>Knowledge &amp; Support</span>
          <span className="text-slate-600">&bull;</span>
          <span>HambakTech Help Desk</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Frequently Asked Questions
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          Everything you need to know about NIN and BVN slip verification, SME data packages, Flutterwave wallet funding, and our developer APIs.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="relative max-w-xl">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search questions (e.g. NIN slip, MTN SME, wallet, API)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Categories Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
                selectedCategory === cat.id
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-3">
        {filteredFaqs.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800 p-8 text-center text-slate-400 text-xs">
            No questions matching your search criteria. Try a different search term or contact support.
          </div>
        ) : (
          filteredFaqs.map(faq => {
            const isOpen = Boolean(openIds[faq.id]);
            return (
              <div
                key={faq.id}
                className="rounded-2xl bg-slate-900 border border-slate-800 transition-colors overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(faq.id)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 hover:bg-slate-850 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">{faq.question}</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-emerald-400' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 pb-6 sm:px-6 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-4 animate-in fade-in">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Still Have Questions Banner */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white">Still have questions or need technical support?</h3>
          <p className="text-xs text-slate-400">
            Our support desk is available 24/7 with an average response time of under 2 hours.
          </p>
        </div>
        <button
          onClick={() => onNavigate('contact')}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-2 self-start sm:self-auto shrink-0"
        >
          <span>Contact Support Desk</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
