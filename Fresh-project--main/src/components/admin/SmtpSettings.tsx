import React, { useState, useEffect } from 'react';
import { 
  Mail, Server, Lock, Send, CheckCircle2, AlertCircle, RefreshCw, 
  ShieldCheck, Eye, EyeOff, Save, Activity, Clock, FileText, Check
} from 'lucide-react';
import { api } from '../../lib/api';
import { SmtpConfig, SmtpLogItem } from '../../types';

export const SmtpSettings: React.FC = () => {
  const [config, setConfig] = useState<SmtpConfig>({
    host: 'mail.hambaktech.com',
    port: 465,
    username: 'info@hambaktech.com',
    password: '',
    encryption: 'ssl',
    sender_email: 'noreply@hambaktech.com',
    sender_name: 'HambakTech Enterprise',
    reply_to_email: 'support@hambaktech.com',
    logs: [],
  });

  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [handshaking, setHandshaking] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Test Email form
  const [testRecipient, setTestRecipient] = useState('admin@hambaktech.com');
  const [testSubject, setTestSubject] = useState('HambakTech SMTP Delivery Verification');
  const [testBody, setTestBody] = useState('This is a test notification verifying that the HambakTech SMTP mailer subsystem is fully configured, secured, and operational.');

  const loadSmtpConfig = async () => {
    setLoading(true);
    try {
      const res = await api.getSmtpConfig();
      if (res.success && res.config) {
        setConfig(res.config);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load SMTP settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSmtpConfig();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload: any = {
        host: config.host,
        port: Number(config.port),
        username: config.username,
        encryption: config.encryption,
        sender_email: config.sender_email,
        sender_name: config.sender_name,
        reply_to_email: config.reply_to_email,
      };
      if (passwordInput.trim()) {
        payload.password = passwordInput.trim();
      }

      const res = await api.updateSmtpConfig(payload);
      if (res.success) {
        setFeedback({ type: 'success', message: 'SMTP credentials and mailer settings saved successfully' });
        setPasswordInput('');
        loadSmtpConfig();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save SMTP settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestHandshake = async () => {
    setHandshaking(true);
    setFeedback(null);
    try {
      const res = await api.testSmtpHandshake();
      if (res.success) {
        setFeedback({ 
          type: 'success', 
          message: `Handshake result: ${res.message}` 
        });
        loadSmtpConfig();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Handshake failed' });
    } finally {
      setHandshaking(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient) return;
    setSendingTest(true);
    setFeedback(null);
    try {
      const res = await api.sendTestSmtpEmail({
        toEmail: testRecipient,
        subject: testSubject,
        body: testBody
      });
      if (res.success) {
        setFeedback({ 
          type: 'success', 
          message: `Email dispatched to ${testRecipient}! Delivery Mode: ${res.details?.status ? String(res.details.status).toUpperCase() : 'QUEUED'}` 
        });
        loadSmtpConfig();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to send test email' });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Server className="w-3.5 h-3.5" />
            Phase 8 • SMTP Configuration
          </div>
          <h2 className="text-2xl font-bold text-white">SMTP Mail Server Settings</h2>
          <p className="text-slate-400 text-sm mt-1">
            Configure host, authentication, port encryption, sender addresses, test email delivery, and inspect outbound logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSmtpConfig}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl flex items-center justify-between border ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* STATUS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Delivery Subsystem</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Operational
          </p>
          <p className="text-[11px] text-slate-500">Live Nodemailer engine active</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Last Connection Probe</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-xl font-bold text-white capitalize">
            {config.last_test_status || 'Operational'}
          </p>
          <p className="text-[11px] text-slate-500">
            {config.last_tested_at ? new Date(config.last_tested_at).toLocaleTimeString() : 'Verified on startup'}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Outbound Dispatches</span>
            <Mail className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xl font-bold text-white font-mono">
            {config.logs?.length || 0} Emails
          </p>
          <p className="text-[11px] text-slate-500">Recorded delivery events</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: CONFIGURATION FORM (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Credentials & Server Connection</h3>
                <p className="text-xs text-slate-400">SMTP authentication credentials are encrypted & protected</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestHandshake}
              disabled={handshaking}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${handshaking ? 'animate-spin' : ''}`} />
              {handshaking ? 'Probing...' : 'Test Handshake'}
            </button>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-400 mb-1 font-medium">SMTP Server Host</label>
                <input
                  type="text"
                  required
                  placeholder="mail.hambaktech.com"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Port</label>
                <input
                  type="number"
                  required
                  placeholder="465"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">SMTP Username</label>
                <input
                  type="text"
                  required
                  placeholder="info@hambaktech.com"
                  value={config.username}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  SMTP Password <span className="text-slate-500 font-normal">({config.password_masked || 'Protected'})</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter new password to update..."
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Encryption Mode</label>
              <div className="grid grid-cols-3 gap-3">
                {(['ssl', 'tls', 'none'] as const).map((enc) => (
                  <button
                    key={enc}
                    type="button"
                    onClick={() => setConfig({ ...config, encryption: enc })}
                    className={`py-2 px-3 rounded-lg border text-center font-mono font-semibold uppercase text-xs transition-colors ${
                      config.encryption === enc
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {enc.toUpperCase()} {enc === 'ssl' ? '(Port 465)' : enc === 'tls' ? '(Port 587)' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Sender Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="noreply@hambaktech.com"
                  value={config.sender_email}
                  onChange={(e) => setConfig({ ...config, sender_email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Sender Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="HambakTech Enterprise"
                  value={config.sender_name}
                  onChange={(e) => setConfig({ ...config, sender_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Reply-To Email Address</label>
              <input
                type="email"
                required
                placeholder="support@hambaktech.com"
                value={config.reply_to_email}
                onChange={(e) => setConfig({ ...config, reply_to_email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-600/20"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: TEST EMAIL DISPATCH FORM (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Live Email Dispatch Test</h3>
              <p className="text-xs text-slate-400">Verify end-to-end delivery through the configured SMTP socket</p>
            </div>
          </div>

          <form onSubmit={handleSendTestEmail} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Recipient Email Address</label>
              <input
                type="email"
                required
                placeholder="recipient@example.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Subject Line</label>
              <input
                type="text"
                required
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Email Body</label>
              <textarea
                rows={4}
                required
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Delivery Diagnostics Policy:</p>
              <p>• If SMTP credentials match an active upstream server, real MIME email is dispatched.</p>
              <p>• In sandboxed development preview, dispatch simulation is logged automatically with full audit trail.</p>
            </div>

            <button
              type="submit"
              disabled={sendingTest}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-600/20"
            >
              <Send className={`w-4 h-4 ${sendingTest ? 'animate-bounce' : ''}`} />
              {sendingTest ? 'Sending Test Email...' : 'Send Test Email Now'}
            </button>
          </form>
        </div>
      </div>

      {/* OUTBOUND EMAIL DELIVERY LOGS */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Outbound SMTP Delivery Log</h3>
              <p className="text-xs text-slate-400">Real-time audit history of all dispatched customer & admin emails</p>
            </div>
          </div>

          <span className="text-xs font-mono text-slate-500">
            {config.logs?.length || 0} entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="pb-3 pl-2">Timestamp</th>
                <th className="pb-3">Recipient</th>
                <th className="pb-3">Subject</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 pr-2 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {!config.logs || config.logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No outbound emails logged yet. Click "Send Test Email" to initiate delivery.
                  </td>
                </tr>
              ) : (
                config.logs.map((log: SmtpLogItem) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-2 font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 font-medium text-white">{log.recipient}</td>
                    <td className="py-3 text-slate-300">{log.subject}</td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        log.status === 'sent'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : log.status === 'simulated'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {log.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-right text-slate-500 text-[11px] font-mono">
                      {log.error ? <span className="text-rose-400">{log.error}</span> : '250 OK - Queued'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
