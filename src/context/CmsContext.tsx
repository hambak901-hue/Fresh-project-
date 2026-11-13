/**
 * @file CmsContext.tsx
 * Dynamic CMS & Branding context for HambakTech Enterprise.
 * Provides public content, live settings, and administrative editing methods.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';
import {
  BrandSettings,
  CmsSections,
  AnnouncementItem,
  FaqItem,
  NavMenuItem,
  PublicRates,
} from '../types';

interface CmsContextType {
  branding: BrandSettings | null;
  cmsSections: CmsSections | null;
  announcements: AnnouncementItem[];
  faqs: FaqItem[];
  navigation: NavMenuItem[];
  rates: PublicRates | null;
  loading: boolean;
  error: string | null;
  refreshCms: () => Promise<void>;
  updateBranding: (updates: Partial<BrandSettings>) => Promise<boolean>;
  updateSections: (updates: Partial<CmsSections>) => Promise<boolean>;
  updateVisibility: (visibility: Partial<CmsSections['pageVisibility']>) => Promise<boolean>;
  saveAnnouncement: (data: Partial<AnnouncementItem>, id?: string) => Promise<boolean>;
  deleteAnnouncement: (id: string) => Promise<boolean>;
  saveFaq: (data: Partial<FaqItem>, id?: string) => Promise<boolean>;
  deleteFaq: (id: string) => Promise<boolean>;
  updateNavigation: (items: NavMenuItem[]) => Promise<boolean>;
}

const CmsContext = createContext<CmsContextType | undefined>(undefined);

const OFFICIAL_DEFAULT_BRANDING: BrandSettings = {
  company_name: 'HAMBAK TECH & SERVICES',
  short_brand_name: 'HAMBAKTECH',
  tagline: 'Where Technology Meets Services',
  logo_url: '/logo.png',
  favicon_url: '/logo.png',
  primary_color: '#1d4ed8',
  secondary_color: '#0f172a',
  font_family: 'Plus Jakarta Sans',
  whatsapp_number: '09155104724',
  business_phone: '08147837664',
  support_phone: '09127469686',
  support_email: 'support@hambaktech.com.ng',
  info_email: 'info@hambaktech.com.ng',
  office_address: 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria',
  business_reg_number: 'BN 9284726',
  founded_year: '2024',
  social_links: {
    tiktok: '',
    facebook: '',
    telegram: '',
    x: '',
    linkedin: '',
    youtube: '',
    whatsapp_channel: '',
  },
  footer_text:
    'HAMBAK TECH & SERVICES provides digital identity verification, telecommunication VTU services, automated bill payments, and practical ICT & software skills training across Nigeria.',
  copyright_text: `© ${new Date().getFullYear()} HAMBAK TECH & SERVICES (BN 9284726). All Rights Reserved.`,
  seo_title: 'HAMBAKTECH | Digital Services, Telecom VTU & Digital Training Academy',
  seo_description:
    'HAMBAK TECH & SERVICES — Digital identity verification, telecom data & airtime VTU, bill payments, and HAMBAKTECH Digital Training Academy in Lekki, Lagos State, Nigeria.',
  seo_keywords:
    'HAMBAKTECH, HAMBAK TECH & SERVICES, NIN verification, BVN verification, Nigerian VTU, Digital Training Academy',
};

export const CmsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<BrandSettings | null>(OFFICIAL_DEFAULT_BRANDING);
  const [cmsSections, setCmsSections] = useState<CmsSections | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [navigation, setNavigation] = useState<NavMenuItem[]>([]);
  const [rates, setRates] = useState<PublicRates | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCms = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPublicCms();
      if (res.success) {
        const mergedBranding = { ...OFFICIAL_DEFAULT_BRANDING, ...(res.branding || {}) };
        setBranding(mergedBranding);
        setCmsSections(res.cms_sections);
        setAnnouncements(res.announcements);
        setFaqs(res.faqs);
        setNavigation(res.navigation);
        setRates(res.rates);

        // Dynamically update document title & meta tags for SEO
        if (mergedBranding.seo_title) {
          document.title = mergedBranding.seo_title;
        } else if (mergedBranding.company_name) {
          document.title = `${mergedBranding.company_name} | ${mergedBranding.short_brand_name || 'HAMBAKTECH'}`;
        }

        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && mergedBranding.seo_description) {
          metaDesc.setAttribute('content', mergedBranding.seo_description);
        }

        // Apply dynamic CSS variables for branding colors
        if (mergedBranding.primary_color) {
          document.documentElement.style.setProperty('--brand-primary', mergedBranding.primary_color);
        }
        if (mergedBranding.secondary_color) {
          document.documentElement.style.setProperty('--brand-secondary', mergedBranding.secondary_color);
        }
        if (mergedBranding.font_family) {
          document.body.style.fontFamily = `"${mergedBranding.font_family}", system-ui, sans-serif`;
        }
      }
    } catch (err: any) {
      console.warn('Could not load dynamic CMS data:', err);
      setError(err.message || 'Failed to load CMS content');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCms();
  }, []);

  const updateBranding = async (updates: Partial<BrandSettings>): Promise<boolean> => {
    try {
      const res = await api.updateBranding(updates);
      if (res.success) {
        const merged = { ...OFFICIAL_DEFAULT_BRANDING, ...(res.branding || {}) };
        setBranding(merged);
        if (merged.primary_color) {
          document.documentElement.style.setProperty('--brand-primary', merged.primary_color);
        }
        if (merged.seo_title) {
          document.title = merged.seo_title;
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update branding:', err);
      return false;
    }
  };

  const updateSections = async (updates: Partial<CmsSections>): Promise<boolean> => {
    try {
      const res = await api.updateCmsSections(updates);
      if (res.success) {
        setCmsSections(res.cms_sections);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update CMS sections:', err);
      return false;
    }
  };

  const updateVisibility = async (visibility: Partial<CmsSections['pageVisibility']>): Promise<boolean> => {
    try {
      const res = await api.updatePageVisibility(visibility);
      if (res.success && cmsSections) {
        setCmsSections({
          ...cmsSections,
          pageVisibility: res.pageVisibility,
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update page visibility:', err);
      return false;
    }
  };

  const saveAnnouncement = async (data: Partial<AnnouncementItem>, id?: string): Promise<boolean> => {
    try {
      if (id) {
        const res = await api.updateAnnouncement(id, data);
        if (res.success) {
          setAnnouncements(prev => prev.map(a => (a.id === id ? res.announcement : a)));
          return true;
        }
      } else {
        const res = await api.createAnnouncement(data as any);
        if (res.success) {
          setAnnouncements(prev => [res.announcement, ...prev]);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Failed to save announcement:', err);
      return false;
    }
  };

  const deleteAnnouncement = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deleteAnnouncement(id);
      if (res.success) {
        setAnnouncements(prev => prev.filter(a => a.id !== id));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete announcement:', err);
      return false;
    }
  };

  const saveFaq = async (data: Partial<FaqItem>, id?: string): Promise<boolean> => {
    try {
      if (id) {
        const res = await api.updateFaq(id, data);
        if (res.success) {
          setFaqs(prev => prev.map(f => (f.id === id ? res.faq : f)));
          return true;
        }
      } else {
        const res = await api.createFaq(data as any);
        if (res.success) {
          setFaqs(prev => [...prev, res.faq]);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Failed to save FAQ:', err);
      return false;
    }
  };

  const deleteFaq = async (id: string): Promise<boolean> => {
    try {
      const res = await api.deleteFaq(id);
      if (res.success) {
        setFaqs(prev => prev.filter(f => f.id !== id));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete FAQ:', err);
      return false;
    }
  };

  const updateNavigation = async (items: NavMenuItem[]): Promise<boolean> => {
    try {
      const res = await api.updateNavigation(items);
      if (res.success) {
        setNavigation(res.navigation);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update navigation:', err);
      return false;
    }
  };

  return (
    <CmsContext.Provider
      value={{
        branding,
        cmsSections,
        announcements,
        faqs,
        navigation,
        rates,
        loading,
        error,
        refreshCms: fetchCms,
        updateBranding,
        updateSections,
        updateVisibility,
        saveAnnouncement,
        deleteAnnouncement,
        saveFaq,
        deleteFaq,
        updateNavigation,
      }}
    >
      {children}
    </CmsContext.Provider>
  );
};

export const useCms = (): CmsContextType => {
  const context = useContext(CmsContext);
  if (!context) {
    throw new Error('useCms must be used within a CmsProvider');
  }
  return context;
};
