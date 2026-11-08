import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Shield,
  Edit,
  DollarSign,
  Plus,
  Minus,
  Mail,
  Send,
  FileText,
  Clock,
  RefreshCw,
  X,
  ExternalLink,
  Loader2,
  Check,
  Ban,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { User, Transaction, TelecomOrder } from '../../types';

export function CustomerManagement() {
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');

  // Selected customer for inspection drawer/modal
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [customerDetail, setCustomerDetail] = useState<{
    customer: User;
    transactions: Transaction[];
    orders: TelecomOrder[];
    verifications: any[];
    auditLogs: any[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Active drawer sub-tab: 'profile' | 'wallet' | 'kyc' | 'transactions' | 'orders' | 'notify'
  const [activeDrawerTab, setActiveDrawerTab] = useState<'profile' | 'wallet' | 'kyc' | 'transactions' | 'orders' | 'notify'>('profile');

  // Wallet adjustment state
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustAmount, setAdjustAmount] = useState<number>(1000);
  const [adjustReason, setAdjustReason] = useState('Bank transfer reconciliation');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // KYC review state
  const [kycDecision, setKycDecision] = useState<'verified' | 'rejected'>('verified');
  const [kycAssignedTier, setKycAssignedTier] = useState<number>(2);
  const [kycNotes, setKycNotes] = useState('Verified against NIMC official database');
  const [kycLoading, setKycLoading] = useState(false);

  // Notification dispatch state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState<'info' | 'success' | 'warning' | 'alert'>('info');
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState<string | null>(null);

  // Profile edit state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTier, setEditTier] = useState<number>(1);
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminCustomers({
        search,
        status: statusFilter,
        tier: tierFilter,
      });
      setCustomers(res.customers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search, statusFilter, tierFilter]);

  const openCustomerDetail = async (user: User) => {
    setSelectedUser(user);
    setDetailLoading(true);
    setActiveDrawerTab('profile');
    setEditName(user.full_name);
    setEditPhone(user.phone_number);
    setEditTier(user.tier);
    setAdjustSuccess(null);
    setNotifSuccess(null);
    setEditSuccess(null);

    try {
      const detail = await api.getAdminCustomerDetail(user.id);
      setCustomerDetail(detail);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    const reason = window.prompt(
      `Enter reason for ${nextStatus.toUpperCase()} account for ${user.full_name}:`,
      nextStatus === 'suspended' ? 'Audit violation / suspicious chargeback' : 'Account restored after audit'
    );
    if (reason === null) return;

    try {
      const res = await api.setCustomerStatus(user.id, nextStatus, reason);
      await fetchCustomers();
      if (selectedUser && selectedUser.id === user.id) {
        setSelectedUser(res.customer);
      }
    } catch (e: any) {
      alert(e.message || 'Status change failed');
    }
  };

  const handleAdjustWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setAdjustLoading(true);
    setAdjustSuccess(null);
    try {
      const res = await api.adjustCustomerWallet(selectedUser.id, {
        type: adjustType,
        amount: adjustAmount,
        reason: adjustReason,
      });
      setAdjustSuccess(res.message);
      // Refresh customer in list & detail
      setSelectedUser(prev => prev ? { ...prev, wallet_balance: res.newBalance } : null);
      await fetchCustomers();
      const updatedDetail = await api.getAdminCustomerDetail(selectedUser.id);
      setCustomerDetail(updatedDetail);
    } catch (err: any) {
      alert(err.message || 'Wallet adjustment failed');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleKycReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setKycLoading(true);
    try {
      const res = await api.reviewCustomerKyc(selectedUser.id, {
        status: kycDecision,
        tier: kycAssignedTier,
        review_notes: kycNotes,
      });
      setSelectedUser(res.customer);
      await fetchCustomers();
      const updatedDetail = await api.getAdminCustomerDetail(selectedUser.id);
      setCustomerDetail(updatedDetail);
      alert(res.message);
    } catch (err: any) {
      alert(err.message || 'KYC review failed');
    } finally {
      setKycLoading(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setNotifLoading(true);
    setNotifSuccess(null);
    try {
      const res = await api.sendCustomerNotification(selectedUser.id, {
        title: notifTitle,
        message: notifMessage,
        type: notifType,
      });
      setNotifSuccess(res.message);
      setNotifTitle('');
      setNotifMessage('');
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch notification');
    } finally {
      setNotifLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setEditSaving(true);
    setEditSuccess(null);
    try {
      const res = await api.updateAdminCustomer(selectedUser.id, {
        full_name: editName,
        phone_number: editPhone,
        tier: editTier as any,
      });
      setSelectedUser(res.customer);
      setEditSuccess(res.message);
      await fetchCustomers();
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <Users className="w-3.5 h-3.5" />
              <span>Customer Registry &amp; Compliance Hub</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Customer Account Management
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Search, audit, adjust balances, review submitted KYC documents, and enforce security policies.
            </p>
          </div>
          <button
            onClick={fetchCustomers}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Table</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search customer by name, email, phone number, or referral code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>

          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Tiers</option>
            <option value="1">Tier 1 (Basic)</option>
            <option value="2">Tier 2 (NIN / BVN)</option>
            <option value="3">Tier 3 (Enterprise)</option>
          </select>
        </div>
      </div>

      {/* Customer Registry Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {customers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <Users className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="font-semibold text-slate-300">No customers match query</p>
            <p className="text-xs text-slate-500">Try loosening your search terms or filter constraints</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Contact &amp; Referral</th>
                  <th className="py-3.5 px-4 text-right">Wallet Balance</th>
                  <th className="py-3.5 px-4 text-center">Tier</th>
                  <th className="py-3.5 px-4 text-center">KYC Status</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {customers.map(user => {
                  const isSuspended = user.status === 'suspended';
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-800/40 transition"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                            alt={user.full_name}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                          />
                          <div>
                            <p className="font-medium text-white">{user.full_name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-mono text-slate-300">{user.phone_number}</p>
                        <p className="text-[10px] text-slate-500 font-mono">Ref: {user.referral_code}</p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 tabular-nums">
                        ₦{user.wallet_balance.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                          Tier {user.tier}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                            user.kyc_status === 'verified'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : user.kyc_status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {user.kyc_status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                            user.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {user.status === 'active' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Ban className="w-3 h-3 text-red-400" />
                          )}
                          <span>{user.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openCustomerDetail(user)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold flex items-center gap-1 transition"
                            title="Inspect &amp; Manage"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Manage</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(user)}
                            className={`p-1.5 rounded-lg text-xs font-semibold transition ${
                              isSuspended
                                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'
                                : 'bg-red-500/20 hover:bg-red-500/30 text-red-300'
                            }`}
                            title={isSuspended ? 'Activate Account' : 'Suspend Account'}
                          >
                            {isSuspended ? <Check className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Full Inspection & Management Drawer Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative shadow-2xl">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <img
                  src={selectedUser.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                  alt={selectedUser.full_name}
                  className="w-10 h-10 rounded-xl object-cover border border-slate-700"
                />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{selectedUser.full_name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                      Tier {selectedUser.tier}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedUser.email} &bull; {selectedUser.phone_number}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tab Navigation */}
            <div className="flex border-b border-slate-800 px-5 gap-4 text-xs font-semibold overflow-x-auto bg-slate-950/40">
              {(['profile', 'wallet', 'kyc', 'transactions', 'orders', 'notify'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveDrawerTab(tab)}
                  className={`py-3 capitalize border-b-2 whitespace-nowrap transition-colors ${
                    activeDrawerTab === tab
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {tab === 'wallet' ? 'Wallet Float' : tab === 'notify' ? 'Send Alert' : tab}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
              {/* TAB 1: PROFILE EDIT & STATUS */}
              {activeDrawerTab === 'profile' && (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  {editSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{editSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-slate-400">Full Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">Phone Number</label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">Account Tier</label>
                      <select
                        value={editTier}
                        onChange={e => setEditTier(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      >
                        <option value={1}>Tier 1 (Unverified / ₦50k daily)</option>
                        <option value={2}>Tier 2 (NIN / BVN Verified - ₦500k daily)</option>
                        <option value={3}>Tier 3 (Enterprise Partner - ₦5M daily)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">Account Status</label>
                      <div className="flex items-center gap-2 pt-1">
                        <span className={`px-2.5 py-1 rounded font-semibold capitalize ${
                          selectedUser.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {selectedUser.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(selectedUser)}
                          className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                        >
                          {selectedUser.status === 'active' ? 'Suspend Account' : 'Reactivate'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={editSaving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-2"
                  >
                    {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Save Customer Changes</span>
                  </button>
                </form>
              )}

              {/* TAB 2: WALLET FLOAT ADJUSTMENT */}
              {activeDrawerTab === 'wallet' && (
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-slate-400">Current Ledger Balance</p>
                      <p className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                        ₦{selectedUser.wallet_balance.toLocaleString()}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 text-slate-300">
                      ID: {selectedUser.id}
                    </span>
                  </div>

                  {adjustSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{adjustSuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleAdjustWallet} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <h4 className="font-bold text-white text-xs">Administrative Manual Adjustment</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400">Action Type</label>
                        <select
                          value={adjustType}
                          onChange={e => setAdjustType(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                        >
                          <option value="credit">Credit (+) User Wallet</option>
                          <option value="debit">Debit (-) User Wallet</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400">Amount (₦)</label>
                        <input
                          type="number"
                          min={100}
                          value={adjustAmount}
                          onChange={e => setAdjustAmount(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-slate-400">Reason (Required for Audit Trail)</label>
                      <input
                        type="text"
                        required
                        value={adjustReason}
                        onChange={e => setAdjustReason(e.target.value)}
                        placeholder="e.g. Bank transfer reconciliation / Manual promo"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={adjustLoading}
                      className={`w-full py-2.5 rounded-xl text-white font-bold transition flex items-center justify-center gap-2 ${
                        adjustType === 'credit' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                      }`}
                    >
                      {adjustLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                      <span>Execute {adjustType.toUpperCase()} (₦{adjustAmount.toLocaleString()})</span>
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 3: KYC REVIEW */}
              {activeDrawerTab === 'kyc' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400">Current KYC Verification Status</p>
                      <p className="text-base font-bold text-white capitalize">{selectedUser.kyc_status}</p>
                    </div>
                  </div>

                  {/* Submitted documents */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-xs">Submitted Verification Documents</h4>
                    {selectedUser.kyc_documents && selectedUser.kyc_documents.length > 0 ? (
                      selectedUser.kyc_documents.map(doc => (
                        <div key={doc.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">{doc.id_type}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono capitalize bg-slate-800 text-slate-300">
                              {doc.status}
                            </span>
                          </div>
                          <p className="font-mono text-slate-300">ID Number: {doc.id_number}</p>
                          {doc.doc_url && (
                            <a
                              href={doc.doc_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:underline flex items-center gap-1 text-[11px]"
                            >
                              <span>Inspect Document Image</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <p className="text-slate-500 text-[10px]">Submitted: {new Date(doc.submitted_at).toLocaleString()}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 italic">No verification documents submitted yet by this customer.</p>
                    )}
                  </div>

                  {/* KYC Compliance Action */}
                  <form onSubmit={handleKycReview} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <h4 className="font-bold text-white text-xs">Compliance Officer Determination</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400">Decision</label>
                        <select
                          value={kycDecision}
                          onChange={e => setKycDecision(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                        >
                          <option value="verified">Approve &amp; Upgrade Tier</option>
                          <option value="rejected">Reject Documentation</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400">Assigned Tier</label>
                        <select
                          value={kycAssignedTier}
                          onChange={e => setKycAssignedTier(Number(e.target.value))}
                          disabled={kycDecision === 'rejected'}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white disabled:opacity-50"
                        >
                          <option value={2}>Tier 2 (NIN / BVN Verified)</option>
                          <option value={3}>Tier 3 (Enterprise Partner)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-slate-400">Review Notes (Sent to Customer)</label>
                      <input
                        type="text"
                        value={kycNotes}
                        onChange={e => setKycNotes(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={kycLoading}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition flex items-center justify-center gap-2"
                    >
                      {kycLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                      <span>Submit KYC Review</span>
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 4: TRANSACTIONS HISTORY */}
              {activeDrawerTab === 'transactions' && (
                <div className="space-y-2">
                  <h4 className="font-bold text-white text-xs">Customer Ledger Journal</h4>
                  {customerDetail?.transactions?.length ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {customerDetail.transactions.map(t => (
                        <div key={t.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">{t.description}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{t.reference} &bull; {new Date(t.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-bold ${t.type === 'credit' ? 'text-emerald-400' : 'text-slate-200'}`}>
                              {t.type === 'credit' ? '+' : '-'}₦{t.amount.toLocaleString()}
                            </span>
                            <p className="text-[10px] text-slate-500 font-mono">{t.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">No transactions recorded for this user.</p>
                  )}
                </div>
              )}

              {/* TAB 5: ORDERS HISTORY */}
              {activeDrawerTab === 'orders' && (
                <div className="space-y-2">
                  <h4 className="font-bold text-white text-xs">Telecom &amp; Digital Fulfillment Orders</h4>
                  {customerDetail?.orders?.length ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {customerDetail.orders.map(o => (
                        <div key={o.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">{o.plan} to {o.phone}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{o.provider_ref} &bull; {o.network}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-white">₦{o.amount.toLocaleString()}</span>
                            <p className="text-[10px] text-emerald-400 font-mono">{o.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">No telecom orders recorded.</p>
                  )}
                </div>
              )}

              {/* TAB 6: DIRECT NOTIFICATION */}
              {activeDrawerTab === 'notify' && (
                <form onSubmit={handleSendNotification} className="space-y-3">
                  <h4 className="font-bold text-white text-xs">Dispatch Notification to Customer</h4>
                  {notifSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{notifSuccess}</span>
                    </div>
                  )}
                  <div>
                    <label className="text-slate-400">Subject / Title</label>
                    <input
                      type="text"
                      required
                      value={notifTitle}
                      onChange={e => setNotifTitle(e.target.value)}
                      placeholder="e.g. Account Security Update / KYC Action Required"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400">Severity Type</label>
                    <select
                      value={notifType}
                      onChange={e => setNotifType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      <option value="info">Information (Blue)</option>
                      <option value="success">Success (Green)</option>
                      <option value="warning">Warning (Amber)</option>
                      <option value="alert">Critical Alert (Red)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400">Message Content</label>
                    <textarea
                      rows={3}
                      required
                      value={notifMessage}
                      onChange={e => setNotifMessage(e.target.value)}
                      placeholder="Enter direct notification message..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={notifLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-2"
                  >
                    {notifLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Dispatch Notification</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
