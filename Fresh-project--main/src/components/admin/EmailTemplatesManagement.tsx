import React, { useState, useEffect } from 'react';
import { 
  Mail, Edit3, Eye, Send, Save, CheckCircle2, AlertCircle, RefreshCw, 
  Code, Tag, Check, Sparkles, UserCheck, Shield, DollarSign, ArrowRight
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmailTemplateItem } from '../../types';

export const EmailTemplatesManagement: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [testRecipient, setTestRecipient] = useState('admin@hambaktech.com');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Editable Form
  const [formData, setFormData] = useState({
    subject: '',
    html_body: '',
    is_active: true
  });

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.getEmailTemplatesAdmin();
      if (res.success && res.templates) {
        setTemplates(res.templates);
        if (!selectedTemplateId && res.templates.length > 0) {
          setSelectedTemplateId(res.templates[0].id);
          setFormData({
            subject: res.templates[0].subject,
            html_body: res.templates[0].html_body,
            is_active: res.templates[0].is_active,
          });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load email templates' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  const handleSelectTemplate = (t: EmailTemplateItem) => {
    setSelectedTemplateId(t.id);
    setFormData({
      subject: t.subject,
      html_body: t.html_body,
      is_active: t.is_active,
    });
    setFeedback(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.updateEmailTemplate(selectedTemplate.id, formData);
      if (res.success) {
        setFeedback({ type: 'success', message: `Template "${selectedTemplate.name}" updated successfully` });
        setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? { ...t, ...formData } : t));
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save template' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!selectedTemplate || !testRecipient) return;
    setSendingTest(true);
    setFeedback(null);
    try {
      const res = await api.sendTestEmailTemplate(selectedTemplate.id, testRecipient);
      if (res.success) {
        setFeedback({ 
          type: 'success', 
          message: `Sample email for "${selectedTemplate.name}" sent to ${testRecipient}!` 
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to dispatch test template' });
    } finally {
      setSendingTest(false);
    }
  };

  const insertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      html_body: prev.html_body + ` {{${variable}}} `
    }));
  };

  // Sample data interpolation for preview
  const getInterpolatedPreview = () => {
    if (!selectedTemplate) return '';
    let html = formData.html_body;
    const sampleData: Record<string, string> = {
      name: 'Ibrahim Danladi',
      email: 'ibrahim.danladi@example.com',
      verification_link: 'https://hambaktech.com/auth/verify?token=sample_token_8892',
      reset_link: 'https://hambaktech.com/auth/reset-password?token=sample_reset_4821',
      amount: '₦25,000.00',
      new_balance: '₦34,500.00',
      reference: 'TXN-902482-NG',
      channel: 'Flutterwave Card Checkout',
      reason: 'Bank network session timed out',
      service: 'NIN Premium Slip Verification',
      status: 'Successful',
      details: 'Slip rendered in 1080p high resolution with official watermark QR code',
      device_info: 'Chrome on macOS (Lagos, Nigeria)',
      ip_address: '102.89.23.14',
      alert_title: 'Manual Funding Approval Required',
      message: 'Agent has submitted proof of payment for ₦500,000.00 manual bank transfer',
      action_url: 'https://hambaktech.com/admin/fundings'
    };

    for (const [key, val] of Object.entries(sampleData)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), val);
    }
    return html;
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Mail className="w-3.5 h-3.5" />
            Phase 8 • Email Communication Subsystem
          </div>
          <h2 className="text-2xl font-bold text-white">Email Notification Templates</h2>
          <p className="text-slate-400 text-sm mt-1">
            Configure, style, and test the 12 core automated email templates for registrations, transactions, and security alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTemplates}
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

      {/* TEMPLATE MANAGER GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* TEMPLATE SELECTOR LIST (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Templates ({templates.length})
            </span>
            <span className="text-[11px] text-emerald-400 font-medium">12/12 Configured</span>
          </div>

          <div className="space-y-1.5 max-h-[650px] overflow-y-auto pr-1">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplate?.id;
              return (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`w-full text-left p-3 rounded-xl transition-all border ${
                    isSelected
                      ? 'bg-indigo-600/10 border-indigo-500/50 text-white'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {tpl.category}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${tpl.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                  </div>
                  <h4 className="font-semibold text-xs text-white truncate">{tpl.name}</h4>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{tpl.subject}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* TEMPLATE EDITOR & PREVIEW (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          {selectedTemplate ? (
            <>
              {/* Header inside editor */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono font-bold uppercase">
                      {selectedTemplate.category}
                    </span>
                    <h3 className="text-lg font-bold text-white">{selectedTemplate.name}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{selectedTemplate.description}</p>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setActiveTab('editor')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                      activeTab === 'editor' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    HTML Editor
                  </button>
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                      activeTab === 'preview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Live Render
                  </button>
                </div>
              </div>

              {/* Supported Dynamic Variables */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" />
                  Supported Variables (Click to insert):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTemplate.variables.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:border-indigo-500 text-slate-300 hover:text-indigo-300 font-mono text-[11px] transition-colors"
                      title="Click to insert variable"
                    >
                      &#123;&#123;{v}&#125;&#125;
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'editor' ? (
                <form onSubmit={handleSave} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Email Subject Line</label>
                    <input
                      type="text"
                      required
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-medium focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Responsive HTML Body</label>
                    <textarea
                      rows={14}
                      required
                      value={formData.html_body}
                      onChange={(e) => setFormData({ ...formData, html_body: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500 leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                      />
                      <span className="text-slate-300 font-medium">Active (Send for platform triggers)</span>
                    </label>

                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-600/20"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving Template...' : 'Save Template Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                /* LIVE PREVIEW */
                <div className="space-y-4">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500">Subject Preview: </span>
                      <span className="font-semibold text-white">{formData.subject}</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono">Sample Data Populated</span>
                  </div>

                  <div className="bg-white rounded-xl p-4 overflow-hidden border border-slate-800 min-h-[350px]">
                    <div 
                      dangerouslySetInnerHTML={{ __html: getInterpolatedPreview() }}
                      className="text-slate-900"
                    />
                  </div>
                </div>
              )}

              {/* DISPATCH SAMPLE TEST EMAIL */}
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-slate-400 text-xs whitespace-nowrap">Test to:</span>
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full sm:w-64 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={sendingTest}
                  className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center justify-center gap-2 transition-colors border border-slate-700"
                >
                  <Send className={`w-3.5 h-3.5 ${sendingTest ? 'animate-bounce' : ''}`} />
                  {sendingTest ? 'Dispatching...' : 'Send Test Sample'}
                </button>
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-slate-500">
              Select an email template from the list to start editing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
