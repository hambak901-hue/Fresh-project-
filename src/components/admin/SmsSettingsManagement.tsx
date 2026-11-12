import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Settings, Save, Send, ShieldCheck, CheckCircle2, 
  AlertCircle, RefreshCw, Key, Smartphone, FileText, Check, Layers
} from 'lucide-react';
import { api } from '../../lib/api';
import { SmsConfig, SmsTemplateItem, SmsLogItem } from '../../types';

export const SmsSettingsManagement: React.FC = () => {
  const [config, setConfig] = useState<SmsConfig>({
    provider: 'termii',
    api_key: '',
    sender_id: 'HAMBAKTECH',
    route: 'generic',
    enabled: false,
    balance_units: 0,
    templates: [],
    logs: []
  });

  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Selected Template for editing
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateForm, setTemplateForm] = useState({
    title: '',
    content: '',
    is_active: true
  });

  // Test SMS State
  const [testRecipient, setTestRecipient] = useState('+2348012345678');
  const [testMessage, setTestMessage] = useState('HambakTech: Your OTP is 894218. Valid for 10 minutes. Do not share.');

  const loadSmsConfig = async () => {
    setLoading(true);
    try {
      const res = await api.getSmsConfigAdmin();
      if (res.success && res.config) {
        setConfig(res.config);
        if (res.config.templates && res.config.templates.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(res.config.templates[0].id);
          setTemplateForm({
            title: res.config.templates[0].title,
            content: res.config.templates[0].content,
            is_active: res.config.templates[0].is_active
          });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load SMS settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSmsConfig();
  }, []);

  const handleSelectTemplate = (tpl: SmsTemplateItem) => {
    setSelectedTemplateId(tpl.id);
    setTemplateForm({
      title: tpl.title,
      content: tpl.content,
      is_active: tpl.is_active
    });
    setFeedback(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setFeedback(null);
    try {
      const res = await api.updateSmsConfigAdmin({
        provider: config.provider,
        api_key: config.api_key,
        sender_id: config.sender_id,
        route: config.route,
        webhook_url: config.webhook_url,
        enabled: config.enabled,
        balance_units: config.balance_units
      });
      if (res.success) {
        setFeedback({ type: 'success', message: 'SMS Gateway configuration updated successfully' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save SMS config' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) return;
    setSavingTemplate(true);
    setFeedback(null);
    try {
      const res = await api.updateSmsTemplateAdmin(selectedTemplateId, templateForm);
      if (res.success) {
        setFeedback({ type: 'success', message: `SMS template "${templateForm.title}" saved` });
        loadSmsConfig();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save template' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient || !testMessage) return;
    setSendingTest(true);
    setFeedback(null);
    try {
      const res = await api.sendTestSmsAdmin({
        recipient: testRecipient,
        message: testMessage
      });
      if (res.success) {
        setFeedback({ 
          type: 'success', 
          message: `SMS dispatched to ${testRecipient}! Units consumed: ${res.log?.units || 1}. Status: ${(res.log?.status || 'delivered').toUpperCase()}` 
        });
        loadSmsConfig();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to dispatch test SMS' });
    } finally {
      setSendingTest(false);
    }
  };

  const charCount = testMessage.length;
  const pageCount = Math.max(1, Math.ceil(charCount / 160));
  const selectedTemplate = config.templates?.find(t => t.id === selectedTemplateId);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Smartphone className="w-3.5 h-3.5" />
            Phase 8 • SMS Communication System
          </div>
          <h2 className="text-2xl font-bold text-white">SMS Gateway & Message Templates</h2>
          <p className="text-slate-400 text-sm mt-1">
            Configure Nigerian SMS provider gateways (Termii, BulkSMS Nigeria), DND routing, alphanumeric sender ID, and automated message templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSmsConfig}
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

      {/* GATEWAY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Gateway Service</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white capitalize flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${config.enabled ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            {config.provider.replace('_', ' ')}
          </p>
          <p className="text-[11px] text-slate-500">Route: {config.route.toUpperCase()} (Bypasses DND restrictions)</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Available Units</span>
            <MessageSquare className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-xl font-bold font-mono text-cyan-400">
            {config.balance_units.toLocaleString()} units
          </p>
          <p className="text-[11px] text-slate-500">~{Math.floor(config.balance_units / 2.5)} Nigerian GSM SMS</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Sender Identity</span>
            <Smartphone className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-xl font-bold font-mono text-white">
            {config.sender_id}
          </p>
          <p className="text-[11px] text-slate-500">Approved 11-char Alphanumeric Mask</p>
        </div>
      </div>

      {/* CONFIGURATION & TEST FORMS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* GATEWAY CONFIG (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">SMS Gateway Parameters</h3>
              <p className="text-xs text-slate-400">Direct integration with licensed telecom aggregators</p>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Provider Gateway</label>
                <select
                  value={config.provider}
                  onChange={(e) => setConfig({ ...config, provider: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-medium focus:outline-none focus:border-emerald-500"
                >
                  <option value="termii">Termii Nigeria (Recommended)</option>
                  <option value="bulksms_nigeria">BulkSMS Nigeria</option>
                  <option value="twilio">Twilio Global</option>
                  <option value="custom_webhook">Custom HTTP Webhook</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Approved Sender ID (Max 11 Chars)</label>
                <input
                  type="text"
                  maxLength={11}
                  required
                  placeholder="HambakTech"
                  value={config.sender_id}
                  onChange={(e) => setConfig({ ...config, sender_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Gateway API Secret Key</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter live gateway API key (leave masked to keep existing)"
                  value={config.api_key}
                  onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Delivery Route</label>
                <select
                  value={config.route}
                  onChange={(e) => setConfig({ ...config, route: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="generic">Generic (High deliverability)</option>
                  <option value="dnd">DND Override (Financial transactional)</option>
                  <option value="whatsapp">WhatsApp Business API</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Balance Units Top-Up</label>
                <input
                  type="number"
                  min="0"
                  value={config.balance_units}
                  onChange={(e) => setConfig({ ...config, balance_units: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-800 text-emerald-600 focus:ring-0"
                />
                <span className="text-slate-300 font-medium">Enable SMS dispatching globally</span>
              </label>

              <button
                type="submit"
                disabled={savingConfig}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-600/20"
              >
                <Save className="w-4 h-4" />
                {savingConfig ? 'Saving...' : 'Save Gateway Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* TEST SMS DISPATCH (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Dispatch Test SMS</h3>
              <p className="text-xs text-slate-400">Send instant test message to any Nigerian number</p>
            </div>
          </div>

          <form onSubmit={handleSendTest} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Recipient Phone (International Format)</label>
              <input
                type="text"
                required
                placeholder="+2348012345678"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-400 font-medium">Message Body</label>
                <span className={`font-mono text-[11px] ${charCount > 160 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {charCount} chars • {pageCount} SMS {pageCount > 1 ? `(${pageCount * 2} units)` : '(2 units)'}
                </span>
              </div>
              <textarea
                rows={4}
                required
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={sendingTest}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-600/20"
            >
              <Send className={`w-4 h-4 ${sendingTest ? 'animate-bounce' : ''}`} />
              {sendingTest ? 'Sending...' : 'Send Live SMS'}
            </button>
          </form>
        </div>
      </div>

      {/* SMS MESSAGE TEMPLATES */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Automated SMS Message Templates</h3>
              <p className="text-xs text-slate-400">Configured messages for OTP, instant credit alerts, and failures</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Templates List */}
          <div className="lg:col-span-4 space-y-2">
            {config.templates?.map((t) => {
              const isSelected = t.id === selectedTemplateId;
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-purple-600/10 border-purple-500 text-white'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-white">{t.title}</span>
                    <span className={`w-2 h-2 rounded-full ${t.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-1">{t.content}</p>
                </button>
              );
            })}
          </div>

          {/* Template Editor */}
          <div className="lg:col-span-8 bg-slate-950/60 rounded-xl p-5 border border-slate-800 space-y-4">
            {selectedTemplate ? (
              <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Template Title</label>
                  <input
                    type="text"
                    required
                    value={templateForm.title}
                    onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-400 font-medium">SMS Text Content</label>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {templateForm.content.length} chars
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    required
                    value={templateForm.content}
                    onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[11px]">Supported Variables:</span>
                  {selectedTemplate.variables?.map(v => (
                    <span key={v} className="px-2 py-0.5 rounded bg-slate-900 text-purple-300 font-mono text-[10px] border border-slate-800">
                      &#123;&#123;{v}&#125;&#125;
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateForm.is_active}
                      onChange={(e) => setTemplateForm({ ...templateForm, is_active: e.target.checked })}
                      className="rounded bg-slate-900 border-slate-800 text-purple-600 focus:ring-0"
                    />
                    <span className="text-slate-300 font-medium">Active (Send for system trigger)</span>
                  </label>

                  <button
                    type="submit"
                    disabled={savingTemplate}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-purple-600/20"
                  >
                    <Save className="w-4 h-4" />
                    {savingTemplate ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-12 text-center text-slate-500">
                Select a template to configure.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RECENT SMS DISPATCH LOGS */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">SMS Gateway Dispatch Logs</h3>
              <p className="text-xs text-slate-400">Live delivery and carrier acknowledgment records</p>
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
                <th className="pb-3">Message Snippet</th>
                <th className="pb-3 text-center">Units</th>
                <th className="pb-3 pr-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {!config.logs || config.logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No SMS messages dispatched yet.
                  </td>
                </tr>
              ) : (
                config.logs.map((log: SmsLogItem) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-2 font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 font-mono font-medium text-white">{log.recipient}</td>
                    <td className="py-3 text-slate-300 line-clamp-1">{log.message}</td>
                    <td className="py-3 text-center font-mono text-slate-400">{log.units} units</td>
                    <td className="py-3 pr-2 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        log.status === 'delivered'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : log.status === 'simulated'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {log.status.toUpperCase()}
                      </span>
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
