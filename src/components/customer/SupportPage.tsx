import React, { useState } from 'react';
import { HelpCircle, MessageSquare, Mail, Phone, ExternalLink, Send, CheckCircle2, AlertCircle, Loader2, Clock, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { User } from '../../types';

interface SupportPageProps {
  user: User;
}

export function SupportPage({ user }: SupportPageProps) {
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketResult, setTicketResult] = useState<{ ticketId: string; message: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) {
      setErrorMsg('Subject and detailed description are required');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setTicketResult(null);

    try {
      const res = await api.submitSupportTicket({
        subject,
        message,
        priority,
      });
      setTicketResult(res);
      setSubject('');
      setMessage('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit support ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>24/7 Enterprise Help Desk</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Customer Support & Resolution Center
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Open a high-priority ticket with our technical operations team or reach out directly across verified instant channels.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Support Ticket Form */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <span>Open Technical Support Ticket</span>
          </h2>

          {ticketResult && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-300 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Ticket Registered: {ticketResult.ticketId}</span>
              </div>
              <p>{ticketResult.message}</p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Issue Category / Subject
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Delayed MTN Data Bundle / Meter token query"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Urgency Priority
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition ${
                      priority === p
                        ? p === 'urgent'
                          ? 'border-red-500 bg-red-500/10 text-red-400'
                          : 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Detailed Message & Transaction Reference
              </label>
              <textarea
                rows={5}
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Include transaction ID, recipient phone number, and any error message displayed..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Dispatching Ticket...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Ticket</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Contact Channels & Direct Desk */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Direct Support Channels</span>
            </h3>

            <div className="space-y-3">
              <a
                href="mailto:support@hambaktech.com.ng"
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-indigo-400" />
                  <div>
                    <p className="font-semibold text-white">Email Help Desk</p>
                    <p className="text-[11px] text-slate-400 font-mono">support@hambaktech.com.ng</p>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>

              <a
                href="https://wa.me/2348039284719?text=Hello%20HambakTech%20Support,%20I%20need%20assistance%20with%20my%20account"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="font-semibold text-white">WhatsApp Agent Desk</p>
                    <p className="text-[11px] text-slate-400 font-mono">+234 803 928 4719</p>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>
            </div>
          </div>

          {/* Operating SLA */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Service Level Agreements</span>
            </h3>
            <ul className="text-slate-400 space-y-2">
              <li className="flex justify-between">
                <span>Critical / Wallet Funding:</span>
                <span className="font-semibold text-white">&lt; 15 mins</span>
              </li>
              <li className="flex justify-between">
                <span>Telecom Dispute / Failed PIN:</span>
                <span className="font-semibold text-white">&lt; 30 mins</span>
              </li>
              <li className="flex justify-between">
                <span>KYC Verification Review:</span>
                <span className="font-semibold text-white">&lt; 2 hours</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
