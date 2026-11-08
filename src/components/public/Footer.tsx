/**
 * @file Footer.tsx
 * Quiet, professional footer adhering to Frontend Design specifications:
 * Wordmark, navigation mirror, dynamic contact info, regulatory compliance notice, and copyright.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { ShieldCheck, Mail, Phone, MapPin, ExternalLink, Globe } from 'lucide-react';

interface FooterProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenAuth }) => {
  const { branding, cmsSections } = useCms();
  const companyName = branding?.company_name || 'HambakTech Enterprise';

  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Column 1: Brand & Tagline */}
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-white">
                {companyName}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {branding?.footer_text ||
                "Nigeria's premier digital infrastructure provider for NIMC/BVN identity verification, SME telecoms vending, and digital payments on TrueHost LON110."}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>NIMC & NIBSS Compliant Enterprise Gateway</span>
            </div>
          </div>

          {/* Column 2: Navigation Mirror */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Solutions</div>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate('services')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  NIN Identity Verification
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('services')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  BVN Biometrics Validation
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('services')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  MTN & Airtel SME Data Vending
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('rates')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Live Rates & Fee Calculator
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('services')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Hambak Academy Courses
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Company & Trust */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Company</div>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  About HambakTech
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('announcements')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Official Announcements
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('faq')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Help & Frequently Asked Questions
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('contact')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Contact Support Desk
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('terms')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Terms & Conditions
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('privacy')}
                  className="hover:text-emerald-400 transition-colors"
                >
                  NDPR Privacy Policy
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Infrastructure & Direct Contact */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Direct Contact</div>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span className="text-slate-300">{branding?.office_address || 'Plot 14, Commercial Avenue, Ikeja, Lagos, Nigeria'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                <a
                  href={`mailto:${branding?.support_email || 'support@hambaktech.com.ng'}`}
                  className="text-slate-300 hover:text-emerald-400 transition-colors"
                >
                  {branding?.support_email || 'support@hambaktech.com.ng'}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                <a
                  href={`tel:${branding?.support_phone || '+2348030001122'}`}
                  className="text-slate-300 hover:text-emerald-400 transition-colors"
                >
                  {branding?.support_phone || '+234 803 000 1122'}
                </a>
              </div>
            </div>

            {/* Social links */}
            <div className="pt-2 flex items-center gap-3">
              {branding?.social_links?.twitter && (
                <a
                  href={branding.social_links.twitter}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-white transition-colors"
                  aria-label="Twitter / X"
                >
                  <Globe className="w-4 h-4" />
                </a>
              )}
              {branding?.social_links?.whatsapp && (
                <a
                  href={branding.social_links.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-emerald-400 transition-colors"
                  aria-label="WhatsApp"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bottom separator and copyright */}
        <div className="mt-12 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            {branding?.copyright_text ||
              '© 2026 Hambak Technologies Enterprise. All Rights Reserved. Infrastructure hosted on TrueHost LON110 (51.89.153.183:1624).'}
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <button onClick={() => onNavigate('privacy')} className="hover:text-slate-200">
              Privacy
            </button>
            <span>&bull;</span>
            <button onClick={() => onNavigate('terms')} className="hover:text-slate-200">
              Terms
            </button>
            <span>&bull;</span>
            <button onClick={() => onNavigate('contact')} className="hover:text-slate-200">
              Support
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
