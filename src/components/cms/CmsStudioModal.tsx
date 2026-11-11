/**
 * @file CmsStudioModal.tsx
 * Comprehensive Admin Content Management System (CMS) & Branding Studio.
 * Allows editing branding, hero banners, headings, page visibility, announcements, FAQs,
 * navigation menus, contact info, footer content, and SEO metadata with instant live updates.
 */

import React, { useState, useEffect } from 'react';
import { useCms } from '../../context/CmsContext';
import {
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layout,
  Palette,
  Eye,
  Bell,
  HelpCircle,
  Compass,
  Plus,
  Trash2,
  Edit2,
  Pin,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import { BrandSettings, CmsSections, AnnouncementItem, FaqItem, NavMenuItem } from '../../types';

interface CmsStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CmsStudioModal: React.FC<CmsStudioModalProps> = ({ isOpen, onClose }) => {
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

  const [activeTab, setActiveTab] = useState<'branding' | 'sections' | 'visibility' | 'announcements' | 'faqs' | 'navigation'>('branding');

  // Form states initialized from context
  const [brandForm, setBrandForm] = useState<Partial<BrandSettings>>({});
  const [sectionForm, setSectionForm] = useState<Partial<CmsSections>>({});
  const [visibilityForm, setVisibilityForm] = useState<Record<string, boolean>>({});
  const [navItems, setNavItems] = useState<NavMenuItem[]>([]);

  // Announcement edit state
  const [editingAnnouncement, setEditingAnnouncement] = useState<Partial<AnnouncementItem> | null>(null);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);

  // FAQ edit state
  const [editingFaq, setEditingFaq] = useState<Partial<FaqItem> | null>(null);
  const [faqModalOpen, setFaqModalOpen] = useState(false);

  // Status feedback
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (branding) {
      setBrandForm({ ...branding });
    }
    if (cmsSections) {
      setSectionForm(JSON.parse(JSON.stringify(cmsSections)));
      setVisibilityForm({ ...cmsSections.pageVisibility });
    }
    if (navigation) {
      setNavItems([...navigation]);
    }
  }, [branding, cmsSections, navigation]);

  if (!isOpen) return null;

  const handleSaveBranding = async () => {
    try {
      setSaving(true);
      setErrorMsg(null);
      const ok = await updateBranding(brandForm);
      if (ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        setErrorMsg('Failed to update branding settings.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating branding');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSections = async () => {
    try {
      setSaving(true);
      setErrorMsg(null);
      const ok = await updateSections(sectionForm);
      if (ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        setErrorMsg('Failed to update page sections.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating sections');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisibility = async (key: string) => {
    const nextVal = !visibilityForm[key];
    const next = { ...visibilityForm, [key]: nextVal };
    setVisibilityForm(next);
    await updateVisibility({ [key]: nextVal } as any);
  };

  const handleSaveAnnouncementItem = async () => {
    if (!editingAnnouncement || !editingAnnouncement.title || !editingAnnouncement.content) {
      setErrorMsg('Announcement title and content are required.');
      return;
    }
    setSaving(true);
    const ok = await saveAnnouncement(editingAnnouncement, editingAnnouncement.id);
    setSaving(false);
    if (ok) {
      setAnnouncementModalOpen(false);
      setEditingAnnouncement(null);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  const handleSaveFaqItem = async () => {
    if (!editingFaq || !editingFaq.question || !editingFaq.answer) {
      setErrorMsg('FAQ question and answer are required.');
      return;
    }
    setSaving(true);
    const ok = await saveFaq(editingFaq, editingFaq.id);
    setSaving(false);
    if (ok) {
      setFaqModalOpen(false);
      setEditingFaq(null);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  const handleSaveNavigation = async () => {
    setSaving(true);
    const ok = await updateNavigation(navItems);
    setSaving(false);
    if (ok) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-5xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col h-[92vh] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">CMS &amp; Branding Studio</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  LIVE EDITING
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                All modifications reflect instantly on the public website without code editing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {savedSuccess && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>Saved Live!</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Studio Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-slate-800 bg-slate-950/60 text-xs overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('branding')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'branding' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Palette className="w-4 h-4 text-emerald-400" />
            <span>Branding &amp; Visuals</span>
          </button>
          <button
            onClick={() => setActiveTab('sections')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'sections' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layout className="w-4 h-4 text-sky-400" />
            <span>Page Sections &amp; Hero</span>
          </button>
          <button
            onClick={() => setActiveTab('visibility')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'visibility' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Eye className="w-4 h-4 text-amber-400" />
            <span>Page Visibility</span>
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'announcements' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4 text-purple-400" />
            <span>Announcements</span>
          </button>
          <button
            onClick={() => setActiveTab('faqs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'faqs' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-teal-400" />
            <span>FAQs</span>
          </button>
          <button
            onClick={() => setActiveTab('navigation')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'navigation' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4 text-blue-400" />
            <span>Navigation Menu</span>
          </button>
        </div>

        {/* Tab Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: BRANDING & VISUALS */}
          {activeTab === 'branding' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Visual Identity, Palette &amp; Metadata</h3>
                  <p className="text-[11px] text-slate-400">Configure company name, brand colors, typography, contact details, and SEO metadata.</p>
                </div>
                <button
                  onClick={handleSaveBranding}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Apply Live'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company / Brand Name</label>
                  <input
                    type="text"
                    value={brandForm.company_name || ''}
                    onChange={e => setBrandForm({ ...brandForm, company_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Tagline</label>
                  <input
                    type="text"
                    value={brandForm.tagline || ''}
                    onChange={e => setBrandForm({ ...brandForm, tagline: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Colors & Typography */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-medium mb-1.5">Primary Color (Emerald / Accent)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandForm.primary_color || '#10b981'}
                      onChange={e => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={brandForm.primary_color || ''}
                      onChange={e => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1.5">Secondary Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandForm.secondary_color || '#0284c7'}
                      onChange={e => setBrandForm({ ...brandForm, secondary_color: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={brandForm.secondary_color || ''}
                      onChange={e => setBrandForm({ ...brandForm, secondary_color: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1.5">Website Typography</label>
                  <select
                    value={brandForm.font_family || 'Plus Jakarta Sans'}
                    onChange={e => setBrandForm({ ...brandForm, font_family: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-none"
                  >
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans (Default)</option>
                    <option value="Outfit">Outfit</option>
                    <option value="DM Sans">DM Sans</option>
                    <option value="Manrope">Manrope</option>
                    <option value="Urbanist">Urbanist</option>
                  </select>
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Support Phone</label>
                  <input
                    type="text"
                    value={brandForm.support_phone || ''}
                    onChange={e => setBrandForm({ ...brandForm, support_phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Support Email (Webmail)</label>
                  <input
                    type="email"
                    value={brandForm.support_email || ''}
                    onChange={e => setBrandForm({ ...brandForm, support_email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">WhatsApp Number</label>
                  <input
                    type="text"
                    value={brandForm.whatsapp_number || ''}
                    onChange={e => setBrandForm({ ...brandForm, whatsapp_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Physical Office Address</label>
                <input
                  type="text"
                  value={brandForm.office_address || ''}
                  onChange={e => setBrandForm({ ...brandForm, office_address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              {/* Social Links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Twitter / X Link</label>
                  <input
                    type="text"
                    value={brandForm.social_links?.twitter || ''}
                    onChange={e =>
                      setBrandForm({
                        ...brandForm,
                        social_links: { ...brandForm.social_links, twitter: e.target.value },
                      })
                    }
                    placeholder="https://x.com/hambaktech"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">WhatsApp Community Link</label>
                  <input
                    type="text"
                    value={brandForm.social_links?.whatsapp || ''}
                    onChange={e =>
                      setBrandForm({
                        ...brandForm,
                        social_links: { ...brandForm.social_links, whatsapp: e.target.value },
                      })
                    }
                    placeholder="https://wa.me/2348030001122"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              {/* Footer text & Copyright */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="font-bold text-white">Footer Information</div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Footer Brand Statement</label>
                  <textarea
                    rows={2}
                    value={brandForm.footer_text || ''}
                    onChange={e => setBrandForm({ ...brandForm, footer_text: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Copyright Notice</label>
                  <input
                    type="text"
                    value={brandForm.copyright_text || ''}
                    onChange={e => setBrandForm({ ...brandForm, copyright_text: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  />
                </div>
              </div>

              {/* SEO Metadata */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="font-bold text-white">Search Engine Optimization (SEO) &amp; OpenGraph</div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">SEO Page Title Tag</label>
                  <input
                    type="text"
                    value={brandForm.seo_title || ''}
                    onChange={e => setBrandForm({ ...brandForm, seo_title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Meta Description</label>
                  <textarea
                    rows={2}
                    value={brandForm.seo_description || ''}
                    onChange={e => setBrandForm({ ...brandForm, seo_description: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Meta Keywords</label>
                  <input
                    type="text"
                    value={brandForm.seo_keywords || ''}
                    onChange={e => setBrandForm({ ...brandForm, seo_keywords: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SECTIONS & HERO */}
          {activeTab === 'sections' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Landing Page Sections &amp; Banners</h3>
                  <p className="text-[11px] text-slate-400">Edit hero copy, CTA buttons, banner imagery, and company intro statistics.</p>
                </div>
                <button
                  onClick={handleSaveSections}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Apply Live'}</span>
                </button>
              </div>

              {/* Hero Section */}
              <div className="space-y-4 p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <Layout className="w-4 h-4" />
                  <span>Hero Section Configuration</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Hero Kicker Badge</label>
                  <input
                    type="text"
                    value={sectionForm.hero?.badge || ''}
                    onChange={e =>
                      setSectionForm({
                        ...sectionForm,
                        hero: { ...(sectionForm.hero as any), badge: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Primary Headline</label>
                  <input
                    type="text"
                    value={sectionForm.hero?.headline || ''}
                    onChange={e =>
                      setSectionForm({
                        ...sectionForm,
                        hero: { ...(sectionForm.hero as any), headline: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Subheadline Description</label>
                  <textarea
                    rows={2}
                    value={sectionForm.hero?.subheadline || ''}
                    onChange={e =>
                      setSectionForm({
                        ...sectionForm,
                        hero: { ...(sectionForm.hero as any), subheadline: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Primary CTA Button Text</label>
                    <input
                      type="text"
                      value={sectionForm.hero?.primaryCtaText || ''}
                      onChange={e =>
                        setSectionForm({
                          ...sectionForm,
                          hero: { ...(sectionForm.hero as any), primaryCtaText: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Secondary CTA Button Text</label>
                    <input
                      type="text"
                      value={sectionForm.hero?.secondaryCtaText || ''}
                      onChange={e =>
                        setSectionForm({
                          ...sectionForm,
                          hero: { ...(sectionForm.hero as any), secondaryCtaText: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                    />
                  </div>
                </div>

                {/* Banner image selector */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Banner Image URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sectionForm.hero?.bannerImage || ''}
                      onChange={e =>
                        setSectionForm({
                          ...sectionForm,
                          hero: { ...(sectionForm.hero as any), bannerImage: e.target.value },
                        })
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                    <span>Quick Preset Assets:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSectionForm({
                          ...sectionForm,
                          hero: {
                            ...(sectionForm.hero as any),
                            bannerImage: '/assets/images/hero_fintech_portal_1794097383199.jpg',
                          },
                        })
                      }
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400"
                    >
                      Fintech Ops Hub
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSectionForm({
                          ...sectionForm,
                          hero: {
                            ...(sectionForm.hero as any),
                            bannerImage: '/assets/images/services_identity_telecom_1794097383404.jpg',
                          },
                        })
                      }
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-400"
                    >
                      Biometrics &amp; Telecom
                    </button>
                  </div>
                </div>
              </div>

              {/* Company Introduction */}
              <div className="space-y-4 p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2 text-sky-400 font-bold">
                  <Layout className="w-4 h-4" />
                  <span>Company Introduction &amp; Stats</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Intro Section Title</label>
                  <input
                    type="text"
                    value={sectionForm.companyIntro?.title || ''}
                    onChange={e =>
                      setSectionForm({
                        ...sectionForm,
                        companyIntro: { ...(sectionForm.companyIntro as any), title: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company Description</label>
                  <textarea
                    rows={3}
                    value={sectionForm.companyIntro?.description || ''}
                    onChange={e =>
                      setSectionForm({
                        ...sectionForm,
                        companyIntro: { ...(sectionForm.companyIntro as any), description: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {sectionForm.companyIntro?.stats?.map((st, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <label className="block text-slate-400 text-[10px]">Stat {i + 1} Value</label>
                      <input
                        type="text"
                        value={st.value}
                        onChange={e => {
                          const updated = [...(sectionForm.companyIntro?.stats || [])];
                          updated[i].value = e.target.value;
                          setSectionForm({
                            ...sectionForm,
                            companyIntro: { ...(sectionForm.companyIntro as any), stats: updated },
                          });
                        }}
                        className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono font-bold"
                      />
                      <label className="block text-slate-400 text-[10px] pt-1">Label</label>
                      <input
                        type="text"
                        value={st.label}
                        onChange={e => {
                          const updated = [...(sectionForm.companyIntro?.stats || [])];
                          updated[i].label = e.target.value;
                          setSectionForm({
                            ...sectionForm,
                            companyIntro: { ...(sectionForm.companyIntro as any), stats: updated },
                          });
                        }}
                        className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PAGE VISIBILITY */}
          {activeTab === 'visibility' && (
            <div className="space-y-6">
              <div className="pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Public Page Visibility Controller</h3>
                <p className="text-[11px] text-slate-400">
                  Toggle whether public pages are accessible and rendered in navigation menus.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { key: 'home', label: 'Landing / Home Page', desc: 'Main conversion page' },
                  { key: 'about', label: 'About Us Page', desc: 'Company history & infrastructure' },
                  { key: 'services', label: 'Services Catalog', desc: 'All 6 services in detail' },
                  { key: 'ratesCalculator', label: 'Pricing Calculator', desc: 'Live wholesale rates tool' },
                  { key: 'announcements', label: 'Official Announcements', desc: 'Advisory notice board' },
                  { key: 'faq', label: 'FAQ Page', desc: 'Categorized questions & answers' },
                  { key: 'contact', label: 'Contact Us Page', desc: 'Validated support inquiry form' },
                  { key: 'terms', label: 'Terms and Conditions', desc: 'Sovereign covenants & SLAs' },
                  { key: 'privacy', label: 'Privacy Policy', desc: 'NDPA data protection policy' },
                ].map(page => {
                  const isVisible = visibilityForm[page.key] !== false;
                  return (
                    <div
                      key={page.key}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-bold text-white">{page.label}</div>
                        <div className="text-[11px] text-slate-500">{page.desc}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(page.key)}
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                          isVisible ? 'bg-emerald-500 justify-end' : 'bg-slate-800 justify-start'
                        }`}
                      >
                        <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform"></div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: ANNOUNCEMENTS MANAGER */}
          {activeTab === 'announcements' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Announcements Manager</h3>
                  <p className="text-[11px] text-slate-400">Publish, pin, draft, or delete official notices.</p>
                </div>
                <button
                  onClick={() => {
                    setEditingAnnouncement({
                      title: '',
                      content: '',
                      category: 'update',
                      is_pinned: false,
                      status: 'published',
                      author: 'Operations Team',
                    });
                    setAnnouncementModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Announcement</span>
                </button>
              </div>

              <div className="space-y-3">
                {(announcements || []).map(a => (
                  <div
                    key={a.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {a.is_pinned && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                            PINNED
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            a.status === 'published' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {a.status}
                        </span>
                        <span className="text-[11px] text-slate-500 capitalize">{a.category}</span>
                      </div>
                      <div className="font-bold text-white text-sm">{a.title}</div>
                      <p className="text-xs text-slate-400 line-clamp-1">{a.content}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setEditingAnnouncement({ ...a });
                          setAnnouncementModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteAnnouncement(a.id)}
                        className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: FAQS MANAGER */}
          {activeTab === 'faqs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Frequently Asked Questions Manager</h3>
                  <p className="text-[11px] text-slate-400">Add, reorder, or edit questions displayed on the FAQ page.</p>
                </div>
                <button
                  onClick={() => {
                    setEditingFaq({
                      question: '',
                      answer: '',
                      category: 'general',
                      order: (faqs?.length || 0) + 1,
                    });
                    setFaqModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Question</span>
                </button>
              </div>

              <div className="space-y-3">
                {(faqs || []).map(f => (
                  <div
                    key={f.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-mono">{f.category}</span>
                      <div className="font-bold text-white text-sm">{f.question}</div>
                      <p className="text-xs text-slate-400 line-clamp-1">{f.answer}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setEditingFaq({ ...f });
                          setFaqModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteFaq(f.id)}
                        className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-400"
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
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Navigation Menu Items</h3>
                  <p className="text-[11px] text-slate-400">Control menu item labels, ordering, and visibility in header.</p>
                </div>
                <button
                  onClick={handleSaveNavigation}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Navigation'}</span>
                </button>
              </div>

              <div className="space-y-2">
                {navItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-slate-500 text-xs">#{index + 1}</span>
                      <input
                        type="text"
                        value={item.label}
                        onChange={e => {
                          const updated = [...navItems];
                          updated[index].label = e.target.value;
                          setNavItems(updated);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs font-semibold"
                      />
                      <span className="text-[10px] text-slate-500 font-mono">({item.pageKey})</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={e => {
                            const updated = [...navItems];
                            updated[index].enabled = e.target.checked;
                            setNavItems(updated);
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                        />
                        <span>Enabled</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Bar */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div>HambakTech Enterprise CMS &bull; Changes persist to backend database</div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Close Studio
          </button>
        </div>
      </div>

      {/* Sub-modal: Edit Announcement */}
      {announcementModalOpen && editingAnnouncement && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">
              {editingAnnouncement.id ? 'Edit Announcement' : 'Create New Announcement'}
            </h3>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Title</label>
              <input
                type="text"
                value={editingAnnouncement.title || ''}
                onChange={e => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Category</label>
                <select
                  value={editingAnnouncement.category || 'update'}
                  onChange={e => setEditingAnnouncement({ ...editingAnnouncement, category: e.target.value as any })}
                  className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                >
                  <option value="update">Update</option>
                  <option value="offer">Offer / Price</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="security">Security</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Status</label>
                <select
                  value={editingAnnouncement.status || 'published'}
                  onChange={e => setEditingAnnouncement({ ...editingAnnouncement, status: e.target.value as any })}
                  className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Pinned?</label>
                <select
                  value={editingAnnouncement.is_pinned ? 'true' : 'false'}
                  onChange={e => setEditingAnnouncement({ ...editingAnnouncement, is_pinned: e.target.value === 'true' })}
                  className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                >
                  <option value="false">Normal</option>
                  <option value="true">Pinned</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Content Body</label>
              <textarea
                rows={4}
                value={editingAnnouncement.content || ''}
                onChange={e => setEditingAnnouncement({ ...editingAnnouncement, content: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAnnouncementModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAnnouncementItem}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Save Announcement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-modal: Edit FAQ */}
      {faqModalOpen && editingFaq && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">
              {editingFaq.id ? 'Edit FAQ Item' : 'Add FAQ Item'}
            </h3>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Question</label>
              <input
                type="text"
                value={editingFaq.question || ''}
                onChange={e => setEditingFaq({ ...editingFaq, question: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Category</label>
              <select
                value={editingFaq.category || 'general'}
                onChange={e => setEditingFaq({ ...editingFaq, category: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
              >
                <option value="general">General</option>
                <option value="verification">Identity (NIN/BVN)</option>
                <option value="telecom">Telecom &amp; Data</option>
                <option value="wallet">Wallet &amp; Billing</option>
                <option value="api">Developer API</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Answer</label>
              <textarea
                rows={4}
                value={editingFaq.answer || ''}
                onChange={e => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFaqModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveFaqItem}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Save FAQ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
