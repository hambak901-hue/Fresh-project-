/**
 * @file ContactPage.tsx
 * Contact Us page for HambakTech Enterprise.
 * Features an accessible, validated inquiry form submitting to /api/cms/contact and direct support channels.
 */

import React, { useState } from 'react';
import { useCms } from '../../context/CmsContext';
import { api } from '../../lib/api';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';

export const ContactPage: React.FC = () => {
  const { branding } = useCms();

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
      setError(err.message || 'Failed to submit inquiry. Please email support directly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12 py-4">
      {/* Header */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
          <span>Support &amp; Inquiries</span>
          <span className="text-slate-600">&bull;</span>
          <span>24/7 Dedicated Help Desk</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Get in Touch with HambakTech
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          Have questions about our identity verification services, wholesale telecom bundles, or developer API integrations? Our support specialists are on standby to assist you.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Direct Channels */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-bold text-white">Direct Communication Channels</h2>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-400 font-medium">Official Support Email</div>
                  <a
                    href={`mailto:${branding?.support_email || 'support@hambaktech.com.ng'}`}
                    className="text-white font-semibold hover:text-emerald-400 transition-colors"
                  >
                    {branding?.support_email || 'support@hambaktech.com.ng'}
                  </a>
                  <div className="text-[11px] text-slate-500 mt-0.5">Average response time: &lt; 2 hours</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-400 font-medium">Telephone &amp; WhatsApp Hotline</div>
                  <a
                    href={`tel:${branding?.support_phone || '+2348030001122'}`}
                    className="text-white font-semibold hover:text-sky-400 transition-colors"
                  >
                    {branding?.support_phone || '+234 803 000 1122'}
                  </a>
                  <div className="text-[11px] text-slate-500 mt-0.5">Available Monday &ndash; Saturday, 8AM &ndash; 8PM WAT</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-400 font-medium">Headquarters Address</div>
                  <div className="text-white font-semibold">
                    {branding?.office_address || 'Plot 14, Commercial Avenue, Ikeja, Lagos, Nigeria'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-400 font-medium">System Processing Operations</div>
                  <div className="text-white font-semibold">24 Hours / 7 Days a Week</div>
                  <div className="text-[11px] text-emerald-400 mt-0.5">Automated Carrier Vending Active</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-2 text-xs">
            <div className="font-bold text-slate-300">Technical Support Protocol:</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              For transaction reconciliations or API webhook verification inquiries, please include your unique <code>Reference ID</code> in the message body for instantaneous resolution.
            </p>
          </div>
        </div>

        {/* Right Column: Interactive Form */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Send Us a Direct Message</h2>
              <p className="text-xs text-slate-400 mt-1">
                Fill in the form below and an enterprise account specialist will respond promptly.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{error}</div>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="font-bold text-white">Inquiry Submitted Successfully</div>
                  <div>{success}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Your Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Babatunde Adeleke"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email Address <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. name@company.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Phone Number <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="08031234567"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Inquiry Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Reseller API Pricing Inquiry"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Message Details <span className="text-emerald-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="How can our technical support or sales team assist you today?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                  required
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                {loading ? (
                  <span>Dispatching Message...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Message to Support</span>
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
