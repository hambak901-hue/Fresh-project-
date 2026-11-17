/**
 * @file Footer.tsx
 * Official public footer displaying HAMBAK TECH & SERVICES registered identity (BN 9284726),
 * properly labeled WhatsApp / Business / Office phone lines, official emails,
 * dynamic optional social links, and full Light/Night mode support.
 */

import React from 'react';
import { useCms } from '../../context/CmsContext';
import { Mail, Phone, MapPin, MessageCircle, Globe, Building2 } from 'lucide-react';

interface FooterProps {
  onNavigate: (page: string) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const { branding } = useCms();
  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const brandShort = branding?.short_brand_name || 'HAMBAKTECH';
  const slogan = branding?.tagline || 'Where Technology Meets Services';
  const regNumber = branding?.business_reg_number || 'BN 9284726';
  const address = branding?.office_address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';
  const supportEmail = branding?.support_email || 'support@hambaktech.com.ng';
  const infoEmail = branding?.info_email || 'info@hambaktech.com.ng';
  const whatsappPhone = branding?.whatsapp_number || '09155104724';
  const businessPhone = branding?.business_phone || '08147837664';
  const officePhone = branding?.support_phone || '09127469686';

  const socials = branding?.social_links || {};
  const activeSocials = [
    { key: 'tiktok', label: 'TikTok', url: socials.tiktok },
    { key: 'facebook', label: 'Facebook', url: socials.facebook },
    { key: 'telegram', label: 'Telegram', url: socials.telegram },
    { key: 'x', label: 'X', url: socials.x || socials.twitter },
    { key: 'linkedin', label: 'LinkedIn', url: socials.linkedin },
    { key: 'youtube', label: 'YouTube', url: socials.youtube },
    { key: 'whatsapp_channel', label: 'WhatsApp Channel', url: socials.whatsapp_channel },
  ].filter((item) => item.url && String(item.url).trim().length > 0);

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
          {/* Column 1: Registered Identity */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <img
                src={branding?.logo_url || '/logo.png'}
                alt={companyName}
                className="h-7 w-auto object-contain rounded"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div>
                <div className="text-sm font-extrabold tracking-tight text-blue-900 dark:text-white">
                  {companyName}
                </div>
                <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  {brandShort} &bull; {slogan}
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {branding?.footer_text ||
                'HAMBAK TECH & SERVICES provides digital identity verification, telecommunication VTU services, automated bill payments, and practical ICT & software skills training across Nigeria.'}
            </p>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>Reg No: {regNumber} &bull; Est. {branding?.founded_year || '2024'}</span>
            </div>
          </div>

          {/* Column 2: Solutions & Academy */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
              Services &amp; Academy
            </div>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('services')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Digital Services Catalog
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('rates')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Rates &amp; Fee Calculator
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('howItWorks')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('academy')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Digital Training Academy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('verify-student')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Verify Student ID Card
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Company & Policies */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
              Company &amp; Policies
            </div>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('about')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  About {brandShort}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('announcements')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Announcements
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('faq')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Frequently Asked Questions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('contact')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Contact Support
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('terms')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Terms &amp; Conditions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('privacy')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Privacy Policy (NDPA)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('refundPolicy')}
                  className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  Refund &amp; Dispute Policy
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Official Labeled Contacts */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
              Official Contact Lines
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span className="text-slate-700 dark:text-slate-300">{address}</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>WhatsApp:</strong>{' '}
                  <a
                    href={`https://wa.me/234${whatsappPhone.replace(/^0/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono hover:text-blue-700 dark:hover:text-blue-400"
                  >
                    {whatsappPhone}
                  </a>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>Business / Upline:</strong>{' '}
                  <a
                    href={`tel:${businessPhone}`}
                    className="font-mono hover:text-blue-700 dark:hover:text-blue-400"
                  >
                    {businessPhone}
                  </a>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>Customer Service / Office:</strong>{' '}
                  <a
                    href={`tel:${officePhone}`}
                    className="font-mono hover:text-blue-700 dark:hover:text-blue-400"
                  >
                    {officePhone}
                  </a>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="flex flex-col">
                  <a
                    href={`mailto:${supportEmail}`}
                    className="text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400"
                  >
                    {supportEmail}
                  </a>
                  <a
                    href={`mailto:${infoEmail}`}
                    className="text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400"
                  >
                    {infoEmail}
                  </a>
                </div>
              </div>
            </div>

            {/* Dynamic Optional Social Links (shown only when configured in Admin CMS) */}
            {activeSocials.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center gap-2">
                {activeSocials.map((s) => (
                  <a
                    key={s.key}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-blue-500"
                  >
                    <Globe className="w-3 h-3" />
                    <span>{s.label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            {branding?.copyright_text ||
              `© ${new Date().getFullYear()} ${companyName} (${regNumber}). All Rights Reserved.`}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-400">
            <button type="button" onClick={() => onNavigate('privacy')} className="hover:text-blue-700 dark:hover:text-white">
              Privacy
            </button>
            <span>&bull;</span>
            <button type="button" onClick={() => onNavigate('terms')} className="hover:text-blue-700 dark:hover:text-white">
              Terms
            </button>
            <span>&bull;</span>
            <button type="button" onClick={() => onNavigate('refundPolicy')} className="hover:text-blue-700 dark:hover:text-white">
              Refund Policy
            </button>
            <span>&bull;</span>
            <button type="button" onClick={() => onNavigate('contact')} className="hover:text-blue-700 dark:hover:text-white">
              Support
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
