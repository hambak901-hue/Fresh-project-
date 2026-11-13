import React, { useState } from 'react';
import { 
  Sparkles, Mail, MessageSquare, Shield, Lock, Tv, ShoppingBag, 
  GraduationCap, BarChart3, CheckCircle2, ArrowRight, Server, KeyRound, ExternalLink
} from 'lucide-react';
import { DigitalServicesManagement } from './admin/DigitalServicesManagement';
import { StoreManagement } from './admin/StoreManagement';
import { AcademyManagement } from './admin/AcademyManagement';
import { ReportsManagement } from './admin/ReportsManagement';
import { SmtpSettings } from './admin/SmtpSettings';
import { EmailTemplatesManagement } from './admin/EmailTemplatesManagement';
import { SmsSettingsManagement } from './admin/SmsSettingsManagement';
import { TransactionPinModal } from './customer/TransactionPinModal';
import { api } from '../lib/api';

interface Phase8ConsoleProps {
  onSwitchToCustomer: () => void;
  onSwitchToAdmin: () => void;
}

export function Phase8Console({ onSwitchToCustomer, onSwitchToAdmin }: Phase8ConsoleProps) {
  const [activeTab, setActiveTab] = useState<
    'smtp' | 'email_templates' | 'sms' | 'pin_security' | 'digital' | 'store' | 'academy' | 'reports'
  >('smtp');

  // Test PIN Modal
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinSuccessNotice, setPinSuccessNotice] = useState(false);

  // Quick Change PIN Form
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setPinFeedback({ type: 'error', message: 'New PIN must be exactly 4 digits' });
      return;
    }
    if (newPin !== confirmPin) {
      setPinFeedback({ type: 'error', message: 'New PIN and confirmation do not match' });
      return;
    }

    setSavingPin(true);
    setPinFeedback(null);
    try {
      const res = await api.setTransactionPin(currentPin, newPin);
      if (res.success) {
        setPinFeedback({ type: 'success', message: 'Transaction PIN updated and secured in database' });
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
      }
    } catch (err: any) {
      setPinFeedback({ type: 'error', message: err.message || 'Failed to update PIN' });
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Phase 8 • Additional Modules &amp; Communication System
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Phase 08 Unified Console &amp; Verification Suite
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl">
              Complete implementation of Digital Services, Staged Hardware Store, Academy, Reports, SMTP server settings, 12 email templates, SMS gateway, customer messages, and secure PIN verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onSwitchToAdmin}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Open Admin Desk</span>
            </button>
            <button
              onClick={onSwitchToCustomer}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Open Customer Portal</span>
            </button>
          </div>
        </div>

        {/* Phase 8 Modules Tabs */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-1 pt-1 border-t border-slate-800/80 text-xs">
          {[
            { id: 'smtp', label: '1. SMTP Settings', icon: Server },
            { id: 'email_templates', label: '2. Email Templates (12)', icon: Mail },
            { id: 'sms', label: '3. SMS Gateway & Templates', icon: MessageSquare },
            { id: 'pin_security', label: '4. PIN Management', icon: Lock },
            { id: 'digital', label: '5. Digital Services', icon: Tv },
            { id: 'store', label: '6. Store (Coming Soon)', icon: ShoppingBag },
            { id: 'academy', label: '7. Academy (Coming Soon)', icon: GraduationCap },
            { id: 'reports', label: '8. Reports (Coming Soon)', icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-xl font-medium whitespace-nowrap flex items-center gap-1.5 transition ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'bg-slate-950/70 text-slate-400 hover:text-white border border-slate-800/80 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* VIEW SWITCHER */}
      <div className="bg-slate-950 rounded-2xl">
        {activeTab === 'smtp' && <SmtpSettings />}

        {activeTab === 'email_templates' && <EmailTemplatesManagement />}

        {activeTab === 'sms' && <SmsSettingsManagement />}

        {activeTab === 'pin_security' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Transaction PIN Management &amp; Security</h3>
                    <p className="text-xs text-slate-400">Secure 4-digit PIN configuration, change, verification, and protected SHA-256 storage</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPinModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Launch PIN Keypad Test Modal</span>
                </button>
              </div>

              {pinSuccessNotice && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span className="font-medium">Transaction PIN successfully authorized! Service request approved.</span>
                </div>
              )}

              {pinFeedback && (
                <div className={`p-4 rounded-xl border text-xs flex items-center gap-2 ${
                  pinFeedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <span className="font-medium">{pinFeedback.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Change PIN Form */}
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4 text-xs">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-indigo-400" />
                    <span>Change Transaction PIN</span>
                  </h4>

                  <form onSubmit={handleUpdatePin} className="space-y-3">
                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">Current PIN (Default: 1234)</label>
                      <input
                        type="password"
                        maxLength={4}
                        required
                        placeholder="••••"
                        value={currentPin}
                        onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">New 4-Digit PIN</label>
                        <input
                          type="password"
                          maxLength={4}
                          required
                          placeholder="••••"
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1 font-medium">Confirm New PIN</label>
                        <input
                          type="password"
                          maxLength={4}
                          required
                          placeholder="••••"
                          value={confirmPin}
                          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingPin}
                      className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                    >
                      {savingPin ? 'Updating PIN...' : 'Save New Transaction PIN'}
                    </button>
                  </form>
                </div>

                {/* PIN Security Specs */}
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3 text-xs text-slate-400">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span>Security Architecture &amp; Protected Storage</span>
                  </h4>
                  <ul className="space-y-2 leading-relaxed">
                    <li>• <strong>SHA-256 Hashing:</strong> PINs are never stored in plaintext. Passwords and PINs are protected with one-way cryptographical hashes.</li>
                    <li>• <strong>Applicable Services Enforced:</strong> Sensitive operations (Cable TV renewals, Prepaid Electricity Tokens, and large manual fundings) require numeric keypad PIN authorization.</li>
                    <li>• <strong>Brute-Force Shield:</strong> Verification calls validate against `transaction_pin_hash` with audit logging of authorization failures.</li>
                    <li>• <strong>Default Preview PIN:</strong> Demo customer and admin accounts are bootstrapped with PIN <code className="text-emerald-400 font-mono font-bold">1234</code>.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Test PIN Modal */}
            <TransactionPinModal
              isOpen={pinModalOpen}
              onClose={() => setPinModalOpen(false)}
              onSuccess={() => {
                setPinModalOpen(false);
                setPinSuccessNotice(true);
                setTimeout(() => setPinSuccessNotice(false), 5000);
              }}
              title="Test Transaction PIN Verification"
              description="Enter your 4-digit security PIN to simulate transaction authorization."
              amount={12500}
            />
          </div>
        )}

        {activeTab === 'digital' && <DigitalServicesManagement />}

        {activeTab === 'store' && <StoreManagement />}

        {activeTab === 'academy' && <AcademyManagement />}

        {activeTab === 'reports' && <ReportsManagement />}
      </div>
    </div>
  );
}
