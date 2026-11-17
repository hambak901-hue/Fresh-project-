import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, Clock, Sparkles, Bell, CheckCircle2, ShieldCheck, 
  Package, Search, Tag, Eye, X, ArrowRight, Check
} from 'lucide-react';
import { api } from '../../lib/api';
import { StoreItem, StoreSettings } from '../../types';

export function StoreComingSoonPage() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  useEffect(() => {
    api.getCustomerStore().then(res => {
      if (res?.success) {
        setItems(res.items || []);
        setSettings(res.settings || null);
      }
    }).catch(err => {
      console.warn('Failed to load store catalog:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const categories = ['all', ...Array.from(new Set(items.map(i => i.category)))];

  const filteredItems = items.filter(i => {
    const matchesCat = selectedCategory === 'all' || i.category === selectedCategory;
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase()) || 
                          i.description.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleJoinWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail) return;
    setWaitlistSuccess(true);
    setTimeout(() => {
      setWaitlistSuccess(false);
      setWaitlistEmail('');
    }, 4000);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/70 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded-full">
              <Clock className="w-3.5 h-3.5" />
              <span>Status: Coming Soon • Phase 8 Staged Module</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {settings?.store_name || 'HambakTech Hardware & Agent Supplies Store'}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {settings?.coming_soon_message || 'Official portal for purchasing NIMC-certified biometric scanners, Agency POS terminals, thermal paper rolls, and PVC card printers.'}
            </p>
          </div>

          {/* Waitlist Box */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 sm:w-80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Bell className="w-4 h-4 text-indigo-400" />
              <span>Launch Notification & Pre-Orders</span>
            </div>
            {waitlistSuccess ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>You're on the priority waitlist!</span>
              </div>
            ) : (
              <form onSubmit={handleJoinWaitlist} className="space-y-2">
                <input
                  type="email"
                  required
                  placeholder="Enter your email address"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-indigo-600/20"
                >
                  Join Store Waitlist
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Catalog Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search equipment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Staged Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition"
          >
            <div className="space-y-4">
              {item.image_url ? (
                <div className="h-44 w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 relative">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 backdrop-blur-sm">
                    Coming Soon
                  </span>
                </div>
              ) : (
                <div className="h-40 w-full rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600">
                  <Package className="w-10 h-10" />
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                  {item.category}
                </span>
                <h3 className="font-bold text-white text-base leading-snug">{item.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{item.description}</p>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-500">Target Retail</p>
                <p className="text-base font-bold font-mono text-emerald-400">
                  ₦{item.price.toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(item)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl font-medium flex items-center gap-1.5 transition border border-slate-700"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>View Specs</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Policy & Stage Notice */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 text-xs text-slate-400">
        <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
        <p>
          {settings?.delivery_policy || 'Standard nationwide courier delivery within 3-5 business days across Nigeria.'} Direct wallet checkout will be authorized upon Phase 8 activation.
        </p>
      </div>

      {/* Product Specs Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white truncate pr-4">{selectedItem.name}</h3>
              <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedItem.image_url && (
              <img
                src={selectedItem.image_url}
                alt={selectedItem.name}
                className="w-full h-44 object-cover rounded-xl bg-slate-950 border border-slate-800"
              />
            )}

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Category:</span>
                <span className="text-white font-medium">{selectedItem.category}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Estimated Price:</span>
                <span className="font-mono text-emerald-400 font-bold text-sm">₦{selectedItem.price.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Current Module Stage:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400">
                  Coming Soon (Pre-Order Open)
                </span>
              </div>
              <div className="pt-2">
                <span className="text-slate-400 block mb-1">Specifications:</span>
                <p className="text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800">
                  {selectedItem.description}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
