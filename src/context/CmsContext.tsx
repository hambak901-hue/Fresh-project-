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

export const CmsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<BrandSettings | null>(null);
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
        setBranding(res.branding);
        setCmsSections(res.cms_sections);
        setAnnouncements(res.announcements);
        setFaqs(res.faqs);
        setNavigation(res.navigation);
        setRates(res.rates);

        // Dynamically update document title & meta tags for SEO
        if (res.branding?.seo_title) {
          document.title = res.branding.seo_title;
        } else if (res.branding?.company_name) {
          document.title = `${res.branding.company_name} | Enterprise Portal`;
        }

        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && res.branding?.seo_description) {
          metaDesc.setAttribute('content', res.branding.seo_description);
        }

        // Apply dynamic CSS variables for branding colors
        if (res.branding?.primary_color) {
          document.documentElement.style.setProperty('--brand-primary', res.branding.primary_color);
        }
        if (res.branding?.secondary_color) {
          document.documentElement.style.setProperty('--brand-secondary', res.branding.secondary_color);
        }
        if (res.branding?.font_family) {
          document.body.style.fontFamily = `"${res.branding.font_family}", system-ui, sans-serif`;
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
        setBranding(res.branding);
        if (res.branding.primary_color) {
          document.documentElement.style.setProperty('--brand-primary', res.branding.primary_color);
        }
        if (res.branding.seo_title) {
          document.title = res.branding.seo_title;
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
