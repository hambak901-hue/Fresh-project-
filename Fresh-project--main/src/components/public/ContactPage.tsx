/**
 * @file ContactPage.tsx
 * Official Contact & Support page for HAMBAK TECH & SERVICES (HAMBAKTECH).
 * Clearly displays the 3 labeled phone numbers (WhatsApp, Business/Upline, Office),
 * Support/Info/Academy emails, Lekki LCDA address, and contact inquiry form.
 */

import React, { useState } from 'react';
import { useCms } from '../../context/CmsContext';
import { api } from '../../lib/api';
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  GraduationCap,
} from 'lucide-react';

export const ContactPage: React.FC = () => {
  const { branding, cmsSections } = useCms();

  const companyName = branding?.company_name || 'HAMBAK TECH & SERVICES';
  const regNo = branding?.business_reg_number || 'BN 9284726';
  const address = branding?.office_address || 'Origanrigan, Cele Area, Lekki LCDA, Lagos State, Nigeria';
  const whatsappPhone = branding?.whatsapp_number || '09155104724';
  const businessPhone = branding?.business_phone || '08147837664';
  const officePhone = branding?.support_phone || '09127469686';
  const supportEmail = branding?.support_email || 'support@hambaktech.com.ng';
  const infoEmail = branding?.info_email || 'info@hambaktech.com.ng';
  const officeHours = cmsSections?.customerServiceInfo?.officeHours || 'Monday – Saturday, 8:00 AM – 6:00 PM WAT';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError('Your full name is required.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('A valid email address is required.');
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      setError('Please provide a message of at least 10 characters.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.submitContact({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });

      if (res.success) {
        setSuccess(res.message || 'Thank you! Your message has been received.');
        setName('');
        setEmail('');
        setPhone('');
        setSubject('');
        setMessage('');
      } else {
        setError('Could not submit inquiry. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || `Failed to submit inquiry. Please email ${supportEmail} directly.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12 py-4">
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-amber-400">
          <span>{companyName}</span>
          <span className="text-slate-400">&bull;</span>
          <span>{regNo}</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          Contact Support &amp; Office Desk
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Reach our support team, business &amp; upline desk, or Digital Training Academy directly using the official channels below.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Direct Channels */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Official Contact Lines
            </h2>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 font-medium">
                    WhatsApp Support Line
                  </div>
                  <a
                    href={`https://wa.me/234${whatsappPhone.replace(/^0/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-900 dark:text-white font-bold font-mono text-sm hover:text-blue-700 dark:hover:text-emerald-400 transition-colors"
                  >
                    {whatsappPhone}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 font-medium">
                    Business / Upline Contact
                  </div>
                  <a
                    href={`tel:${businessPhone}`}
                    className="text-slate-900 dark:text-white font-bold font-mono text-sm hover:text-blue-700 dark:hover:text-amber-400 transition-colors"
                  >
                    {businessPhone}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 font-medium">
                    Customer Service / Office Line
                  </div>
                  <a
                    href={`tel:${officePhone}`}
                    className="text-slate-900 dark:text-white font-bold font-mono text-sm hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                  >
                    {officePhone}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="text-slate-500 dark:text-slate-400 font-medium">Official Emails</div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Support: </span>
                    <a
                      href={`mailto:${supportEmail}`}
                      className="text-slate-900 dark:text-white font-semibold hover:text-blue-700 dark:hover:text-blue-400"
                    >
                      {supportEmail}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">General Info: </span>
                    <a
                      href={`mailto:${infoEmail}`}
                      className="text-slate-900 dark:text-white font-semibold hover:text-blue-700 dark:hover:text-blue-400"
                    >
                      {infoEmail}
                    </a>
                  </div>
                  <div className="flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-slate-500 dark:text-slate-400">Academy: </span>
                    <a
                      href="mailto:hambak901@gmail.com"
                      className="text-slate-900 dark:text-white font-semibold hover:text-blue-700 dark:hover:text-amber-400"
                    >
                      hambak901@gmail.com
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 font-medium">Office &amp; Academy Address</div>
                  <div className="text-slate-900 dark:text-white font-semibold">{address}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 font-medium">Office Hours</div>
                  <div className="text-slate-900 dark:text-white font-semibold">{officeHours}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Send Us a Direct Message
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Include your transaction reference or Academy application reference if your inquiry relates to an existing request.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{error}</div>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2.5 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="font-bold">Inquiry Submitted Successfully</div>
                  <div>{success}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Your Name <span className="text-blue-700 dark:text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address <span className="text-blue-700 dark:text-amber-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@email.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08012345678"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Inquiry Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Service or Academy Inquiry"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Message Details <span className="text-blue-700 dark:text-amber-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we assist you today?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600 resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-6 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md"
              >
                {loading ? (
                  <span>Submitting Inquiry...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Message</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
