import React, { useState, useEffect } from 'react';
import { useCms } from '../../context/CmsContext';
import {
  Globe,
  Palette,
  Layout,
  Eye,
  Megaphone,
  HelpCircle,
  Menu,
  FileText,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Image as ImageIcon,
  Compass,
  Check,
  ExternalLink,
} from 'lucide-react';
import { BrandSettings, CmsSections, AnnouncementItem, FaqItem, NavMenuItem } from '../../types';
import { LogoUploader } from './LogoUploader';

export function WebsiteManagement() {
  const {
    branding,
    cmsSections,
    announcements,
    faqs,
    navigation,
    updateBranding,
    updateSections,
    updateVisibility,
    saveAnnouncement,
    deleteAnnouncement,
    saveFaq,
    deleteFaq,
    updateNavigation,
  } = useCms();

  const [activeTab, setActiveTab] = useState<'branding' | 'landing' | 'visibility' | 'announcements' | 'faqs' | 'navigation'>('branding');

  // Local form states
  const [brandForm, setBrandForm] = useState<Partial<BrandSettings>>({});
  const [sectionForm, setSectionForm] = useState<Partial<CmsSections>>({});
  const [visibilityForm, setVisibilityForm] = useState<Record<string, boolean>>({});
  const [navItems, setNavItems] = useState<NavMenuItem[]>([]);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Announcement modal / form
  const [editingAnnouncement, setEditingAnnouncement] = useState<Partial<AnnouncementItem> | null>(null);
  // FAQ modal / form
  const [editingFaq, setEditingFaq] = useState<Partial<FaqItem> | null>(null);

  useEffect(() => {
    if (branding) setBrandForm({ ...branding });
    if (cmsSections) {
      setSectionForm({ ...cmsSections });
      setVisibilityForm({ ...(cmsSections.pageVisibility || {}) });
    }
    if (navigation) setNavItems([...navigation]);
  }, [branding, cmsSections, navigation]);

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const ok = await updateBranding(brandForm);
      if (ok) {
        setSaveSuccess('Branding and SEO configurations updated live!');
        setTimeout(() => setSaveSuccess(null), 3500);
      } else {
        setErrorMessage('Failed to save branding updates. Please retry.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save branding');
    }
  };

  const handleSaveLanding = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const ok = await updateSections(sectionForm);
      if (ok) {
        setSaveSuccess('Landing page content & banners updated live!');
        setTimeout(() => setSaveSuccess(null), 3500);
      } else {
        setErrorMessage('Failed to update sections. Please check input.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save sections');
    }
  };

  const handleToggleVisibility = async (key: string, current: boolean) => {
    const next = !current;
    const updated = { ...visibilityForm, [key]: next };
    setVisibilityForm(updated);
    setErrorMessage(null);
    try {
      const ok = await updateVisibility({ [key]: next } as any);
      if (ok) {
        setSaveSuccess(`Page visibility for "${key}" updated.`);
        setTimeout(() => setSaveSuccess(null), 2500);
      } else {
        setErrorMessage(`Failed to update visibility for "${key}".`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update visibility');
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnnouncement || !editingAnnouncement.title || !editingAnnouncement.content) return;
    setErrorMessage(null);
    try {
      const ok = await saveAnnouncement(editingAnnouncement);
      if (ok) {
        setEditingAnnouncement(null);
        setSaveSuccess('Announcement saved and published live.');
        setTimeout(() => setSaveSuccess(null), 3000);
      } else {
        setErrorMessage('Failed to publish announcement.');
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to save announcement');
    }
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaq || !editingFaq.question || !editingFaq.answer) return;
    setErrorMessage(null);
    try {
      const ok = await saveFaq(editingFaq);
      if (ok) {
        setEditingFaq(null);
        setSaveSuccess('FAQ saved and updated live.');
        setTimeout(() => setSaveSuccess(null), 3000);
      } else {
        setErrorMessage('Failed to save FAQ.');
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to save FAQ');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Globe className="w-3.5 h-3.5" />
              <span>Global Web CMS &amp; Brand Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Website Management
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Edit public landing page sections, banners, dynamic colors, navigation menus, announcements, and legal policies without touching code.
            </p>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex gap-2 mt-6 pt-6 border-t border-slate-800 text-xs overflow-x-auto">
          {[
            { id: 'branding', label: 'Brand & SEO', icon: Palette },
            { id: 'landing', label: 'Landing & Banners', icon: Layout },
            { id: 'visibility', label: 'Page Visibility', icon: Eye },
            { id: 'announcements', label: 'Announcements', icon: Megaphone },
            { id: 'faqs', label: 'FAQs Engine', icon: HelpCircle },
            { id: 'navigation', label: 'Navigation Menu', icon: Compass },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
          <button onClick={() => setSaveSuccess(null)} className="text-emerald-400 hover:text-emerald-200 text-xs">Dismiss</button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 text-xs text-rose-300 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200 text-xs">Dismiss</button>
        </div>
      )}

      {/* TAB 1: BRANDING & SEO */}
      {activeTab === 'branding' && (
        <form onSubmit={handleSaveBranding} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-400" />
                <span>Enterprise Identity &amp; Meta Settings</span>
              </h2>
              <p className="text-slate-400 mt-0.5">Controls browser title, OpenGraph cards, header logos, and brand pallete.</p>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5 transition"
            >
              <Save className="w-4 h-4" />
              <span>Save Branding</span>
            </button>
          </div>

          <LogoUploader
            currentLogoUrl={brandForm.logo_url || '/logo.svg'}
            onLogoUpdated={(newUrl) => setBrandForm(prev => ({ ...prev, logo_url: newUrl }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Company Name</label>
              <input
                type="text"
                value={brandForm.company_name || ''}
                onChange={e => setBrandForm({ ...brandForm, company_name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Tagline / Motto</label>
              <input
                type="text"
                value={brandForm.tagline || ''}
                onChange={e => setBrandForm({ ...brandForm, tagline: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Logo URL</label>
              <input
                type="text"
                value={brandForm.logo_url || ''}
                onChange={e => setBrandForm({ ...brandForm, logo_url: e.target.value })}
                placeholder="https://... (leave blank for wordmark)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Primary Accent Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={brandForm.primary_color || '#10b981'}
                  onChange={e => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                  className="w-10 h-8 rounded-lg bg-transparent cursor-pointer border border-slate-800"
                />
                <input
                  type="text"
                  value={brandForm.primary_color || '#10b981'}
                  onChange={e => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Support Email</label>
              <input
                type="email"
                value={brandForm.support_email || ''}
                onChange={e => setBrandForm({ ...brandForm, support_email: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Support Phone</label>
              <input
                type="text"
                value={brandForm.support_phone || ''}
                onChange={e => setBrandForm({ ...brandForm, support_phone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
          </div>

          {/* SEO fields */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="font-bold text-white text-xs">Search Engine Optimization (SEO Meta Tags)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-400">SEO Meta Title</label>
                <input
                  type="text"
                  value={brandForm.seo_title || ''}
                  onChange={e => setBrandForm({ ...brandForm, seo_title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400">SEO Keywords (Comma-separated)</label>
                <input
                  type="text"
                  value={brandForm.seo_keywords || ''}
                  onChange={e => setBrandForm({ ...brandForm, seo_keywords: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">SEO Meta Description</label>
              <textarea
                rows={2}
                value={brandForm.seo_description || ''}
                onChange={e => setBrandForm({ ...brandForm, seo_description: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              />
            </div>
          </div>

          {/* Office address & footer */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="font-bold text-white text-xs">Physical Address &amp; Footer Copyright</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-400">Headquarters Address</label>
                <input
                  type="text"
                  value={brandForm.office_address || ''}
                  onChange={e => setBrandForm({ ...brandForm, office_address: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400">Footer Copyright Text</label>
                <input
                  type="text"
                  value={brandForm.copyright_text || ''}
                  onChange={e => setBrandForm({ ...brandForm, copyright_text: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: LANDING & BANNERS */}
      {activeTab === 'landing' && (
        <form onSubmit={handleSaveLanding} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layout className="w-4 h-4 text-indigo-400" />
                <span>Landing Page Hero &amp; Banners</span>
              </h2>
              <p className="text-slate-400 mt-0.5">Modify main headlines, subtext, CTA links, and company stats.</p>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5 transition"
            >
              <Save className="w-4 h-4" />
              <span>Save Content</span>
            </button>
          </div>

          {/* Hero Section */}
          <div className="space-y-3">
            <h3 className="font-bold text-white text-xs text-indigo-400">Hero Section Banners</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-400">Badge Text</label>
                <input
                  type="text"
                  value={sectionForm.hero?.badge || ''}
                  onChange={e => setSectionForm({
                    ...sectionForm,
                    hero: { ...sectionForm.hero!, badge: e.target.value },
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400">Primary Headline</label>
                <input
                  type="text"
                  value={sectionForm.hero?.headline || ''}
                  onChange={e => setSectionForm({
                    ...sectionForm,
                    hero: { ...sectionForm.hero!, headline: e.target.value },
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Subheadline Text</label>
              <textarea
                rows={2}
                value={sectionForm.hero?.subheadline || ''}
                onChange={e => setSectionForm({
                  ...sectionForm,
                  hero: { ...sectionForm.hero!, subheadline: e.target.value },
                })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Hero Banner Background Image URL</label>
              <input
                type="text"
                value={sectionForm.hero?.bannerImage || ''}
                onChange={e => setSectionForm({
                  ...sectionForm,
                  hero: { ...sectionForm.hero!, bannerImage: e.target.value },
                })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
          </div>

          {/* Company Intro & Stats */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="font-bold text-white text-xs text-indigo-400">Company Introduction &amp; Infrastructure</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-400">Title</label>
                <input
                  type="text"
                  value={sectionForm.companyIntro?.title || ''}
                  onChange={e => setSectionForm({
                    ...sectionForm,
                    companyIntro: { ...sectionForm.companyIntro!, title: e.target.value },
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400">Founded Year</label>
                <input
                  type="text"
                  value={sectionForm.companyIntro?.founded || ''}
                  onChange={e => setSectionForm({
                    ...sectionForm,
                    companyIntro: { ...sectionForm.companyIntro!, founded: e.target.value },
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400">Company Bio</label>
              <textarea
                rows={3}
                value={sectionForm.companyIntro?.description || ''}
                onChange={e => setSectionForm({
                  ...sectionForm,
                  companyIntro: { ...sectionForm.companyIntro!, description: e.target.value },
                })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              />
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: PAGE VISIBILITY */}
      {activeTab === 'visibility' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              <span>Public Page Visibility Toggles</span>
            </h2>
            <p className="text-slate-400 mt-0.5">Instantly hide or reveal pages on the live public portal without redeploying code.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {[
              { key: 'home', label: 'Landing / Home Page', path: '/' },
              { key: 'about', label: 'About Us Page', path: '/about' },
              { key: 'services', label: 'Services Catalogue', path: '/services' },
              { key: 'ratesCalculator', label: 'Pricing Calculator', path: '/rates' },
              { key: 'announcements', label: 'Announcements Feed', path: '/announcements' },
              { key: 'faq', label: 'Frequently Asked Questions', path: '/faq' },
              { key: 'contact', label: 'Contact Us', path: '/contact' },
              { key: 'terms', label: 'Terms and Conditions', path: '/terms' },
              { key: 'privacy', label: 'Privacy Policy', path: '/privacy' },
            ].map(p => {
              const isVisible = visibilityForm[p.key] !== false;
              return (
                <div
                  key={p.key}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-white">{p.label}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{p.path}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility(p.key, isVisible)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                      isVisible
                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {isVisible ? 'Visible (Live)' : 'Hidden (Offline)'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="space-y-4 text-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-indigo-400" />
                <span>Broadcast Announcements</span>
              </h2>
              <p className="text-slate-400 mt-0.5">Publish maintenance warnings, service updates, and discount campaigns.</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingAnnouncement({ title: '', content: '', category: 'general', status: 'published', is_pinned: false })}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Announcement</span>
            </button>
          </div>

          {editingAnnouncement && (
            <form onSubmit={handleSaveAnnouncement} className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 space-y-3">
              <h3 className="font-bold text-white text-sm">
                {editingAnnouncement.id ? 'Edit Announcement' : 'Create New Announcement'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400">Title</label>
                  <input
                    type="text"
                    required
                    value={editingAnnouncement.title || ''}
                    onChange={e => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Category</label>
                  <select
                    value={editingAnnouncement.category || 'general'}
                    onChange={e => setEditingAnnouncement({ ...editingAnnouncement, category: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="general">General Broadcast</option>
                    <option value="update">Platform Update</option>
                    <option value="maintenance">Maintenance Notice</option>
                    <option value="offer">Promo / Offer</option>
                    <option value="security">Security Alert</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-slate-400">Content</label>
                <textarea
                  rows={4}
                  required
                  value={editingAnnouncement.content || ''}
                  onChange={e => setEditingAnnouncement({ ...editingAnnouncement, content: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold"
                >
                  Save &amp; Publish
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAnnouncement(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {announcements?.map(ann => (
              <div key={ann.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-800 text-indigo-400 uppercase">
                      {ann.category}
                    </span>
                    <span className="font-semibold text-white text-sm">{ann.title}</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{ann.content}</p>
                  <p className="text-[10px] text-slate-500 font-mono">Published: {new Date(ann.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingAnnouncement(ann)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this announcement?')) deleteAnnouncement(ann.id);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 text-red-400 hover:bg-red-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: FAQS */}
      {activeTab === 'faqs' && (
        <div className="space-y-4 text-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                <span>Frequently Asked Questions</span>
              </h2>
              <p className="text-slate-400 mt-0.5">Manage help center answers for customers and API resellers.</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingFaq({ question: '', answer: '', category: 'general', order: 1 })}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add FAQ</span>
            </button>
          </div>

          {editingFaq && (
            <form onSubmit={handleSaveFaq} className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 space-y-3">
              <h3 className="font-bold text-white text-sm">
                {editingFaq.id ? 'Edit FAQ' : 'Create FAQ Item'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400">Category</label>
                  <select
                    value={editingFaq.category || 'general'}
                    onChange={e => setEditingFaq({ ...editingFaq, category: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="general">General</option>
                    <option value="verification">NIN &amp; BVN Verification</option>
                    <option value="telecom">Telecommunications &amp; VTU</option>
                    <option value="wallet">Wallet &amp; Payments</option>
                    <option value="api">Developer API</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400">Display Order</label>
                  <input
                    type="number"
                    value={editingFaq.order || 1}
                    onChange={e => setEditingFaq({ ...editingFaq, order: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400">Question</label>
                <input
                  type="text"
                  required
                  value={editingFaq.question || ''}
                  onChange={e => setEditingFaq({ ...editingFaq, question: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400">Answer</label>
                <textarea
                  rows={3}
                  required
                  value={editingFaq.answer || ''}
                  onChange={e => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold"
                >
                  Save FAQ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingFaq(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {faqs?.map(faq => (
              <div key={faq.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-800 text-indigo-400 uppercase">
                      {faq.category}
                    </span>
                    <span className="font-semibold text-white">{faq.question}</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{faq.answer}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingFaq(faq)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this FAQ?')) deleteFaq(faq.id);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 text-red-400 hover:bg-red-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: NAVIGATION MENU */}
      {activeTab === 'navigation' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-xs">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-400" />
              <span>Public Navigation Bar Menus</span>
            </h2>
            <p className="text-slate-400 mt-0.5">Control the links displayed on the top public navigation bar.</p>
          </div>

          <div className="space-y-2 pt-2">
            {navItems.map((item, idx) => (
              <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-slate-800 font-mono text-slate-400 flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-white">{item.label}</p>
                    <p className="text-[11px] text-slate-500 font-mono">Page: {item.pageKey}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const updated = navItems.map(n => n.id === item.id ? { ...n, enabled: !n.enabled } : n);
                      setNavItems(updated);
                      updateNavigation(updated);
                    }}
                    className={`px-3 py-1 rounded-lg font-semibold transition ${
                      item.enabled
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {item.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
