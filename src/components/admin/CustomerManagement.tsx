import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  Shield,
  Edit,
  DollarSign,
  Send,
  RefreshCw,
  X,
  ExternalLink,
  Loader2,
  Check,
  Ban,
  UserPlus,
  Trash2,
  Sparkles,
  ShieldCheck,
  FileText,
  Clock,
  Fingerprint,
  Activity,
  LifeBuoy,
  Key,
  Megaphone,
  Mail,
} from 'lucide-react';
import { api } from '../../lib/api';
import { getInitialsAvatar } from '../../lib/avatar';
import { User, Transaction, TelecomOrder, AdminCreateCustomerPayload } from '../../types';

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

type DrawerTab = 'profile' | 'wallet' | 'kyc' | 'transactions' | 'orders' | 'verifications' | 'audit' | 'notify';

export function CustomerManagement() {
  const [customers, setCustomers] = useState<User[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    suspended: 0,
    pending_kyc: 0,
    verified_kyc: 0,
    new_registrations: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [kycStatusFilter, setKycStatusFilter] = useState('all');
  const [newFilter, setNewFilter] = useState<'all' | 'new'>('all');

  // Selected customer for inspection drawer/modal
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [customerDetail, setCustomerDetail] = useState<{
    customer: User;
    transactions: Transaction[];
    orders: TelecomOrder[];
    verifications: any[];
    auditLogs: any[];
    kyc?: any;
    kyc_submissions?: any[];
    support_tickets?: any[];
    stats?: {
      total_funded: number;
      total_spent: number;
      tx_count: number;
      orders_count: number;
      verifications_count: number;
      tickets_count: number;
    };
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>('profile');

  // Wallet adjustment state
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustAmount, setAdjustAmount] = useState<number>(1000);
  const [adjustReason, setAdjustReason] = useState('Bank transfer reconciliation');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // KYC review state
  const [kycDecision, setKycDecision] = useState<'verified' | 'rejected'>('verified');
  const [kycAssignedTier, setKycAssignedTier] = useState<number>(2);
  const [kycNotes, setKycNotes] = useState('Verified against official identity registry');
  const [kycLoading, setKycLoading] = useState(false);
  const [kycSuccess, setKycSuccess] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);

  // Notification dispatch state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState<'info' | 'success' | 'warning' | 'alert'>('info');
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState<string | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);

  // Profile edit state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTier, setEditTier] = useState<number>(1);
  const [editKycStatus, setEditKycStatus] = useState<string>('pending');
  const [editDob, setEditDob] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editState, setEditState] = useState('');
  const [editLga, setEditLga] = useState('');
  const [editNin, setEditNin] = useState('');
  const [editBvn, setEditBvn] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [tableFeedback, setTableFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Status Change Modal (replaces window.prompt)
  const [statusModalTarget, setStatusModalTarget] = useState<User | null>(null);
  const [statusModalReason, setStatusModalReason] = useState('');
  const [statusModalSaving, setStatusModalSaving] = useState(false);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteForce, setDeleteForce] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Publish Announcement Modal (User Management)
  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [announceCategory, setAnnounceCategory] = useState<'general' | 'update' | 'maintenance' | 'offer' | 'security'>('general');
  const [announceAudience, setAnnounceAudience] = useState('all_customers');
  const [announceActive, setAnnounceActive] = useState(true);
  const [announcePinned, setAnnouncePinned] = useState(false);
  const [announceSaving, setAnnounceSaving] = useState(false);
  const [announceError, setAnnounceError] = useState<string | null>(null);

  // Create User modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<AdminCreateCustomerPayload>({
    full_name: '',
    email: '',
    phone_number: '',
    role: 'customer',
    status: 'active',
    tier: 2,
    password: '',
    initial_balance: 0,
    notify_customer: true,
    date_of_birth: '',
    residential_address: '',
    state: '',
    lga: '',
    id_type: 'nin_slip',
    id_number: '',
    nin: '',
    bvn: '',
    kyc_consent: true,
    consent_obtained: true,
  });

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreateForm(prev => ({ ...prev, password: pwd }));
  };

  const resetCreateForm = () => {
    setCreateForm({
      full_name: '',
      email: '',
      phone_number: '',
      role: 'customer',
      status: 'active',
      tier: 1,
      password: '',
      initial_balance: 0,
      notify_customer: true,
      date_of_birth: '',
      residential_address: '',
      state: '',
      lga: '',
      id_type: 'nin_slip',
      id_number: '',
      nin: '',
      bvn: '',
      kyc_consent: true,
      consent_obtained: true,
    });
  };

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    const requiresTier2Docs = (createForm.role === 'customer' || createForm.role === 'agent') && Number(createForm.tier) >= 2;
    const cleanNin = (createForm.nin || '').replace(/\D/g, '');
    const cleanBvn = (createForm.bvn || '').replace(/\D/g, '');
    const effectiveIdNumber = createForm.id_number?.trim() || cleanNin || cleanBvn;

    if (cleanNin && !/^\d{11}$/.test(cleanNin)) {
      setCreateError('NIN must be exactly 11 numeric digits.');
      return;
    }
    if (cleanBvn && !/^\d{11}$/.test(cleanBvn)) {
      setCreateError('BVN must be exactly 11 numeric digits.');
      return;
    }
    if (requiresTier2Docs && !cleanNin && !cleanBvn && !effectiveIdNumber) {
      setCreateError('Selecting Tier 2 or Tier 3 verified requires an 11-digit NIN, BVN, or ID document number (or leave at Tier 1 Basic Profile).');
      return;
    }

    setCreateLoading(true);
    try {
      const payload: AdminCreateCustomerPayload = {
        ...createForm,
        nin: cleanNin || undefined,
        bvn: cleanBvn || undefined,
        id_number: effectiveIdNumber || undefined,
        consent_obtained: Boolean(createForm.kyc_consent),
      };
      const res = await api.createAdminCustomer(payload);
      setCreateSuccess(res.message || `User created successfully at KYC Level ${createForm.tier || 1}!`);
      await fetchCustomers();
      setTimeout(() => {
        setIsCreateModalOpen(false);
        setCreateSuccess(null);
        resetCreateForm();
      }, 1200);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create customer');
    } finally {
      setCreateLoading(false);
    }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminCustomers({
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        tier: tierFilter !== 'all' ? tierFilter : undefined,
        kyc_status: kycStatusFilter !== 'all' ? kycStatusFilter : undefined,
        filter: newFilter === 'new' ? 'new' : undefined,
      });
      setCustomers(res.customers || []);
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch (e: any) {
      setTableFeedback({ type: 'error', message: e?.message || 'Failed to fetch customer records.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search, statusFilter, tierFilter, kycStatusFilter, newFilter]);

  const populateEditFields = (u: User, kyc?: any) => {
    setEditName(u.full_name || '');
    setEditEmail(u.email || '');
    setEditPhone(u.phone_number || '');
    setEditTier(Number(u.tier || 1));
    setEditKycStatus(u.kyc_status || 'pending');
    setEditDob(u.date_of_birth || kyc?.date_of_birth || '');
    setEditAddress(u.address || kyc?.residential_address || '');
    setEditState(u.state || kyc?.state || '');
    setEditLga(u.lga || kyc?.lga || '');
    setEditNin(u.nin || kyc?.nin || '');
    setEditBvn(u.bvn || kyc?.bvn || '');
    setEditNewPassword('');
  };

  const openCustomerDetail = async (user: User) => {
    setSelectedUser(user);
    setDetailLoading(true);
    setActiveDrawerTab('profile');
    populateEditFields(user);
    setAdjustSuccess(null);
    setAdjustError(null);
    setKycSuccess(null);
    setKycError(null);
    setNotifSuccess(null);
    setNotifError(null);
    setEditSuccess(null);
    setEditError(null);
    setStatusError(null);

    try {
      const detail = await api.getAdminCustomerDetail(user.id);
      setCustomerDetail(detail);
      if (detail.customer) {
        setSelectedUser(detail.customer);
        populateEditFields(detail.customer, detail.kyc);
      }
    } catch (e: any) {
      setEditError(e?.message || 'Failed to load full customer history.');
    } finally {
      setDetailLoading(false);
    }
  };

  const openStatusModal = (user: User) => {
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    setStatusModalTarget(user);
    setStatusModalReason(
      nextStatus === 'suspended'
        ? 'Account placed under compliance review'
        : 'Account restored after administrative verification'
    );
    setStatusError(null);
  };

  const handleConfirmToggleStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalTarget) return;
    const nextStatus = statusModalTarget.status === 'active' ? 'suspended' : 'active';
    setStatusModalSaving(true);
    setStatusError(null);
    try {
      const res = await api.setCustomerStatus(statusModalTarget.id, nextStatus, statusModalReason.trim());
      await fetchCustomers();
      if (selectedUser && selectedUser.id === statusModalTarget.id && res.customer) {
        setSelectedUser(res.customer);
      }
      setTableFeedback({ type: 'success', message: `${statusModalTarget.full_name} account marked as ${nextStatus}.` });
      setStatusModalTarget(null);
    } catch (err: any) {
      setStatusError(err?.message || 'Status update failed.');
    } finally {
      setStatusModalSaving(false);
    }
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await api.deleteAdminCustomer(deleteTarget.id, deleteForce);
      setTableFeedback({ type: 'success', message: res.message || 'Customer account deleted permanently.' });
      if (selectedUser && selectedUser.id === deleteTarget.id) {
        setSelectedUser(null);
        setCustomerDetail(null);
      }
      setDeleteTarget(null);
      setDeleteForce(false);
      await fetchCustomers();
    } catch (err: any) {
      setDeleteError(err?.message || 'Unable to delete customer.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAdjustWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setAdjustLoading(true);
    setAdjustSuccess(null);
    setAdjustError(null);
    try {
      const res = await api.adjustCustomerWallet(selectedUser.id, {
        type: adjustType,
        amount: adjustAmount,
        reason: adjustReason,
      });
      setAdjustSuccess(res.message);
      setSelectedUser(prev => (prev ? { ...prev, wallet_balance: res.newBalance } : null));
      await fetchCustomers();
      const updatedDetail = await api.getAdminCustomerDetail(selectedUser.id);
      setCustomerDetail(updatedDetail);
    } catch (err: any) {
      setAdjustError(err.message || 'Wallet adjustment failed');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleKycReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setKycLoading(true);
    setKycSuccess(null);
    setKycError(null);
    try {
      const res = await api.reviewCustomerKyc(selectedUser.id, {
        status: kycDecision,
        tier: kycAssignedTier,
        review_notes: kycNotes,
      });
      if (res.customer) setSelectedUser(res.customer);
      await fetchCustomers();
      const updatedDetail = await api.getAdminCustomerDetail(selectedUser.id);
      setCustomerDetail(updatedDetail);
      setKycSuccess(res.message || 'KYC status updated successfully.');
    } catch (err: any) {
      setKycError(err.message || 'KYC review failed');
    } finally {
      setKycLoading(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setNotifLoading(true);
    setNotifSuccess(null);
    setNotifError(null);
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
      setNotifError(err.message || 'Failed to dispatch notification');
    } finally {
      setNotifLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setEditSaving(true);
    setEditSuccess(null);
    setEditError(null);

    if (editNewPassword && editNewPassword.length < 8) {
      setEditError('New password must be at least 8 characters long.');
      setEditSaving(false);
      return;
    }

    try {
      const res = await api.updateAdminCustomer(selectedUser.id, {
        full_name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone_number: editPhone.trim(),
        tier: editTier as any,
        kyc_status: editKycStatus as any,
        date_of_birth: editDob || undefined,
        address: editAddress.trim(),
        state: editState.trim(),
        lga: editLga.trim(),
        nin: editNin.replace(/\D/g, '') || undefined,
        bvn: editBvn.replace(/\D/g, '') || undefined,
        ...(editNewPassword ? { new_password: editNewPassword } : {}),
      });
      if (res.customer) {
        setSelectedUser(res.customer);
      }
      setEditNewPassword('');
      setEditSuccess(res.message || 'Customer account updated successfully.');
      await fetchCustomers();
      const updatedDetail = await api.getAdminCustomerDetail(selectedUser.id);
      setCustomerDetail(updatedDetail);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update profile');
    } finally {
      setEditSaving(false);
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceTitle.trim() || !announceMessage.trim()) return;
    setAnnounceSaving(true);
    setAnnounceError(null);
    try {
      const res = await api.saveAdminAnnouncement({
        title: announceTitle.trim(),
        content: announceMessage.trim(),
        message: announceMessage.trim(),
        category: announceCategory,
        target_audience: announceAudience,
        status: announceActive ? 'published' : 'draft',
        is_active: announceActive ? 1 : 0,
        is_pinned: announcePinned,
      });
      setIsAnnounceModalOpen(false);
      setAnnounceTitle('');
      setAnnounceMessage('');
      setAnnounceCategory('general');
      setAnnounceAudience('all_customers');
      setAnnounceActive(true);
      setAnnouncePinned(false);
      setTableFeedback({
        type: 'success',
        message: res.message || 'Announcement published successfully.',
      });
    } catch (err: any) {
      setAnnounceError(err?.message || 'Failed to publish announcement.');
    } finally {
      setAnnounceSaving(false);
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
              Create customer accounts, inspect full customer history, adjust wallets, review KYC, and control account status.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setAnnounceError(null);
                setIsAnnounceModalOpen(true);
              }}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold shadow-lg shadow-amber-600/20"
            >
              <Megaphone className="w-4 h-4" />
              <span>Publish Announcement</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetCreateForm();
                generateRandomPassword();
                setCreateError(null);
                setCreateSuccess(null);
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold shadow-lg shadow-indigo-600/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Create Customer</span>
            </button>

            <button
              type="button"
              onClick={fetchCustomers}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-2 text-xs font-semibold"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => {
            setNewFilter('all');
            setStatusFilter('all');
            setKycStatusFilter('all');
          }}
          className="text-left bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xl transition"
        >
          <p className="text-[11px] font-medium text-slate-400">Total Customers</p>
          <p className="text-xl font-bold font-mono text-white mt-1 tabular-nums">{summary.total}</p>
        </button>

        <button
          type="button"
          onClick={() => setNewFilter(newFilter === 'new' ? 'all' : 'new')}
          className={`text-left p-4 rounded-xl border transition ${
            newFilter === 'new'
              ? 'bg-emerald-950/40 border-emerald-500/60'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-emerald-400">New Registrations (72h)</p>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">NEW</span>
          </div>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">{summary.new_registrations}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
          className="text-left bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xl transition"
        >
          <p className="text-[11px] font-medium text-slate-400">Active Accounts</p>
          <p className="text-xl font-bold font-mono text-sky-400 mt-1 tabular-nums">{summary.active}</p>
        </button>

        <button
          type="button"
          onClick={() => setKycStatusFilter(kycStatusFilter === 'pending' ? 'all' : 'pending')}
          className="text-left bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xl transition"
        >
          <p className="text-[11px] font-medium text-amber-400">Pending KYC Review</p>
          <p className="text-xl font-bold font-mono text-amber-400 mt-1 tabular-nums">{summary.pending_kyc}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'suspended' ? 'all' : 'suspended')}
          className="text-left bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xl transition"
        >
          <p className="text-[11px] font-medium text-rose-400">Suspended</p>
          <p className="text-xl font-bold font-mono text-rose-400 mt-1 tabular-nums">{summary.suspended}</p>
        </button>
      </div>

      {tableFeedback && (
        <div
          className={`p-3.5 rounded-xl flex items-center justify-between text-xs font-medium ${
            tableFeedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {tableFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{tableFeedback.message}</span>
          </div>
          <button type="button" onClick={() => setTableFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, phone, NIN, BVN, or referral code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newFilter}
            onChange={e => setNewFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Registrations</option>
            <option value="new">New Only (72h)</option>
          </select>

          <select
            value={kycStatusFilter}
            onChange={e => setKycStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All KYC Status</option>
            <option value="pending">Pending KYC</option>
            <option value="verified">Verified KYC</option>
            <option value="rejected">Rejected KYC</option>
            <option value="unverified">Unverified</option>
          </select>

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
            <option value="2">Tier 2 (Level 2 KYC)</option>
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
                  <th className="py-3.5 px-4">Contact &amp; Location</th>
                  <th className="py-3.5 px-4 text-right">Wallet Balance</th>
                  <th className="py-3.5 px-4 text-center">Activity</th>
                  <th className="py-3.5 px-4 text-center">KYC Status</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {customers.map(user => {
                  const isSuspended = user.status === 'suspended';
                  const createdMs = user.created_at ? new Date(user.created_at).getTime() : 0;
                  const isNewReg = Boolean(user.is_new) || (createdMs > 0 && Date.now() - createdMs <= 72 * 3600 * 1000);
                  return (
                    <tr key={user.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatar_url || getInitialsAvatar(user.full_name)}
                            alt={user.full_name}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-white">{user.full_name}</p>
                              {isNewReg && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold uppercase tracking-wider">
                                  NEW
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 font-mono">{user.email}</p>
                            <p className="text-[10px] text-slate-500">
                              Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'} &bull; Tier {user.tier}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-mono text-slate-300">{user.phone_number}</p>
                        <p className="text-[10px] text-slate-400">
                          {[user.lga, user.state].filter(Boolean).join(', ') || `Ref: ${user.referral_code}`}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 tabular-nums">
                        ₦{(Number(user.wallet_balance) || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                          {(user.tx_count ?? 0)} tx &bull; {(user.orders_count ?? 0)} ord
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                            user.kyc_status === 'verified'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : user.kyc_status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : user.kyc_status === 'rejected'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
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
                            title="Inspect & Manage"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Manage</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openStatusModal(user)}
                            className={`p-1.5 rounded-lg text-xs font-semibold transition ${
                              isSuspended
                                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'
                                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                            }`}
                            title={isSuspended ? 'Activate Account' : 'Suspend Account'}
                          >
                            {isSuspended ? <Check className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(user);
                              setDeleteForce(false);
                              setDeleteError(null);
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 transition"
                            title="Delete Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden relative shadow-2xl">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <img
                  src={selectedUser.avatar_url || getInitialsAvatar(selectedUser.full_name)}
                  alt={selectedUser.full_name}
                  className="w-11 h-11 rounded-xl object-cover border border-slate-700"
                />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>{selectedUser.full_name}</span>
                    {selectedUser.is_new && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                        NEW REGISTRATION
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                      Tier {selectedUser.tier}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded capitalize ${
                      selectedUser.kyc_status === 'verified' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
                    }`}>
                      KYC: {selectedUser.kyc_status}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {selectedUser.email} &bull; {selectedUser.phone_number} &bull; Ref: {selectedUser.referral_code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stats Strip inside Drawer */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 bg-slate-950/30 border-b border-slate-800 text-[11px]">
              <div className="bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2">
                <span className="text-slate-400 block">Wallet Float</span>
                <span className="font-mono font-bold text-emerald-400">₦{(Number(selectedUser.wallet_balance) || 0).toLocaleString()}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2">
                <span className="text-slate-400 block">Total Funded</span>
                <span className="font-mono font-bold text-sky-400">₦{(customerDetail?.stats?.total_funded ?? 0).toLocaleString()}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2">
                <span className="text-slate-400 block">Total Spent</span>
                <span className="font-mono font-bold text-white">₦{(customerDetail?.stats?.total_spent ?? 0).toLocaleString()}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-2">
                <span className="text-slate-400 block">Orders / Verifications</span>
                <span className="font-mono font-bold text-indigo-300">
                  {customerDetail?.stats?.orders_count ?? 0} / {customerDetail?.stats?.verifications_count ?? 0}
                </span>
              </div>
            </div>

            {/* Sub-tab Navigation */}
            <div className="flex border-b border-slate-800 px-5 gap-4 text-xs font-semibold overflow-x-auto bg-slate-950/40">
              {(
                [
                  { id: 'profile', label: 'Profile & Edit' },
                  { id: 'kyc', label: 'KYC & Identity' },
                  { id: 'wallet', label: 'Wallet Float' },
                  { id: 'transactions', label: `Transactions (${customerDetail?.transactions?.length ?? 0})` },
                  { id: 'orders', label: `Orders (${customerDetail?.orders?.length ?? 0})` },
                  { id: 'verifications', label: `Verifications (${customerDetail?.verifications?.length ?? 0})` },
                  { id: 'audit', label: 'Audit & Tickets' },
                  { id: 'notify', label: 'Send Alert' },
                ] as Array<{ id: DrawerTab; label: string }>
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDrawerTab(tab.id)}
                  className={`py-3 border-b-2 whitespace-nowrap transition-colors ${
                    activeDrawerTab === tab.id
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
              {detailLoading && (
                <div className="flex items-center gap-2 text-indigo-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading full customer records...</span>
                </div>
              )}

              {/* TAB 1: PROFILE EDIT, PASSWORD RESET & CONTROLS */}
              {activeDrawerTab === 'profile' && (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  {editSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{editSuccess}</span>
                    </div>
                  )}
                  {editError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{editError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-slate-400">Full Legal Name</label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">Email Address</label>
                      <input
                        type="email"
                        required
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">Phone Number</label>
                      <input
                        type="text"
                        required
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">Date of Birth</label>
                      <input
                        type="date"
                        value={editDob}
                        onChange={e => setEditDob(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-slate-400">Residential Address</label>
                      <input
                        type="text"
                        value={editAddress}
                        onChange={e => setEditAddress(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">State</label>
                      <input
                        type="text"
                        value={editState}
                        onChange={e => setEditState(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">LGA</label>
                      <input
                        type="text"
                        value={editLga}
                        onChange={e => setEditLga(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">NIN (11 Digits)</label>
                      <input
                        type="text"
                        maxLength={11}
                        value={editNin}
                        onChange={e => setEditNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">BVN (11 Digits)</label>
                      <input
                        type="text"
                        maxLength={11}
                        value={editBvn}
                        onChange={e => setEditBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
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
                        <option value={1}>Tier 1 (₦50k daily)</option>
                        <option value={2}>Tier 2 (Level 2 KYC - ₦500k daily)</option>
                        <option value={3}>Tier 3 (Enterprise Partner - ₦5M daily)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">KYC Status</label>
                      <select
                        value={editKycStatus}
                        onChange={e => setEditKycStatus(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      >
                        <option value="pending">Pending</option>
                        <option value="verified">Verified</option>
                        <option value="rejected">Rejected</option>
                        <option value="unverified">Unverified</option>
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-slate-400 flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span>Reset Customer Password (Optional, min 8 chars)</span>
                      </label>
                      <input
                        type="text"
                        value={editNewPassword}
                        onChange={e => setEditNewPassword(e.target.value)}
                        placeholder="Leave blank to keep existing password"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openStatusModal(selectedUser)}
                        className={`px-3 py-2 rounded-xl font-semibold ${
                          selectedUser.status === 'active'
                            ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {selectedUser.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(selectedUser);
                          setDeleteForce(false);
                          setDeleteError(null);
                        }}
                        className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-semibold flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Account</span>
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={editSaving}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-2"
                    >
                      {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>Save Customer Changes</span>
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: KYC REVIEW & FULL SUBMISSION DATA */}
              {activeDrawerTab === 'kyc' && (
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <span className="text-slate-400 block">Current KYC Status</span>
                      <span className="font-bold text-white capitalize">{selectedUser.kyc_status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">NIN</span>
                      <span className="font-mono text-white">{selectedUser.nin || customerDetail?.kyc?.nin || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">BVN</span>
                      <span className="font-mono text-white">{selectedUser.bvn || customerDetail?.kyc?.bvn || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Date of Birth</span>
                      <span className="font-mono text-white">{selectedUser.date_of_birth || customerDetail?.kyc?.date_of_birth || '—'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Residential Address</span>
                      <span className="text-white">
                        {[
                          selectedUser.address || customerDetail?.kyc?.residential_address,
                          selectedUser.lga || customerDetail?.kyc?.lga,
                          selectedUser.state || customerDetail?.kyc?.state,
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </span>
                    </div>
                  </div>

                  {kycSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{kycSuccess}</span>
                    </div>
                  )}
                  {kycError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{kycError}</span>
                    </div>
                  )}

                  {/* Submitted KYC Records */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-xs">KYC Submissions &amp; Documents</h4>
                    {selectedUser.kyc_documents && selectedUser.kyc_documents.length > 0 ? (
                      selectedUser.kyc_documents.map(doc => (
                        <div key={doc.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white uppercase">
                              {String(doc.id_type || 'NIN_SLIP').replace(/_/g, ' ')}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono capitalize bg-slate-800 text-slate-300">
                              {doc.status}
                            </span>
                          </div>
                          <p className="font-mono text-slate-300">ID Number: {doc.id_number}</p>
                          {doc.review_notes && <p className="text-slate-400 text-[11px]">Notes: {doc.review_notes}</p>}
                          {doc.doc_url && (
                            <a
                              href={doc.doc_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:underline inline-flex items-center gap-1 text-[11px]"
                            >
                              <span>Inspect Document</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <p className="text-slate-500 text-[10px]">
                            Submitted: {doc.submitted_at ? new Date(doc.submitted_at).toLocaleString() : '—'}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 italic">No verification documents recorded yet.</p>
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
                          <option value={2}>Tier 2 (Level 2 KYC Verified)</option>
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

              {/* TAB 3: WALLET FLOAT ADJUSTMENT */}
              {activeDrawerTab === 'wallet' && (
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-slate-400">Current Ledger Balance</p>
                      <p className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                        ₦{(Number(selectedUser.wallet_balance) || 0).toLocaleString()}
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
                  {adjustError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                      <span>{adjustError}</span>
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
                        placeholder="e.g. Bank transfer reconciliation"
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
                      <span>Execute {adjustType.toUpperCase()} (₦{(Number(adjustAmount) || 0).toLocaleString()})</span>
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 4: TRANSACTIONS HISTORY */}
              {activeDrawerTab === 'transactions' && (
                <div className="space-y-2">
                  <h4 className="font-bold text-white text-xs">Customer Ledger Journal</h4>
                  {customerDetail?.transactions?.length ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {customerDetail.transactions.map(t => (
                        <div key={t.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">{t.description}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {t.reference} &bull; {String(t.category || 'general').replace(/_/g, ' ')} &bull; {new Date(t.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-bold ${t.type === 'credit' ? 'text-emerald-400' : 'text-slate-200'}`}>
                              {t.type === 'credit' ? '+' : '-'}₦{(Number(t.amount) || 0).toLocaleString()}
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
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {customerDetail.orders.map((o: any) => (
                        <div key={o.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">{o.plan || o.service_type || 'Order'} &rarr; {o.phone}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {o.provider_ref || o.id} &bull; {o.network} &bull; {new Date(o.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-white">₦{(Number(o.amount) || 0).toLocaleString()}</span>
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

              {/* TAB 6: IDENTITY VERIFICATIONS */}
              {activeDrawerTab === 'verifications' && (
                <div className="space-y-2">
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-indigo-400" />
                    <span>Identity Verification History</span>
                  </h4>
                  {customerDetail?.verifications?.length ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {customerDetail.verifications.map((v: any) => (
                        <div key={v.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">
                              {String(v.service_key || v.type || 'Identity Lookup').replace(/_/g, ' ').toUpperCase()} &bull; {v.search_value}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {v.reference || v.id} &bull; Provider: {v.provider} &bull; {new Date(v.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-white">₦{(Number(v.cost) || 0).toLocaleString()}</span>
                            <p className="text-[10px] text-emerald-400 font-mono capitalize">{v.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">No identity verification lookups recorded.</p>
                  )}
                </div>
              )}

              {/* TAB 7: AUDIT LOGS & SUPPORT TICKETS */}
              {activeDrawerTab === 'audit' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <LifeBuoy className="w-4 h-4 text-indigo-400" />
                      <span>Support Tickets ({customerDetail?.support_tickets?.length ?? 0})</span>
                    </h4>
                    {customerDetail?.support_tickets?.length ? (
                      <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                        {customerDetail.support_tickets.map((t: any) => (
                          <div key={t.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                            <div>
                              <p className="font-medium text-white">{t.subject}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                {t.ticket_number} &bull; {String(t.category || 'general').replace(/_/g, ' ')}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] uppercase">
                              {t.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic">No support tickets opened by this customer.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      <span>Audit Trail ({customerDetail?.auditLogs?.length ?? 0})</span>
                    </h4>
                    {customerDetail?.auditLogs?.length ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {customerDetail.auditLogs.map((a: any) => (
                          <div key={a.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                            <div>
                              <p className="font-mono font-semibold text-indigo-300">{a.action}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                {a.user_email} &bull; IP: {a.ip_address || '—'}
                              </p>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic">No audit log events linked to this customer.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 8: DIRECT NOTIFICATION */}
              {activeDrawerTab === 'notify' && (
                <form onSubmit={handleSendNotification} className="space-y-3">
                  <h4 className="font-bold text-white text-xs">Dispatch Notification to Customer</h4>
                  {notifSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{notifSuccess}</span>
                    </div>
                  )}
                  {notifError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                      <span>{notifError}</span>
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

      {/* CREATE CUSTOMER MODAL (WITH LEVEL 2 KYC REQUIRED FOR CUSTOMER/AGENT) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Provision New Customer Account</h3>
                  <p className="text-xs text-slate-400">Starts at KYC Level 1 by default (optional Level 2 identity details below)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              {createError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {createSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{createSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-slate-300 font-medium block mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.full_name}
                    onChange={e => setCreateForm(prev => ({ ...prev, full_name: e.target.value }))}
                    placeholder="e.g. Alabi Stephen"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={e => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="customer@domain.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={createForm.phone_number}
                    onChange={e => setCreateForm(prev => ({ ...prev, phone_number: e.target.value }))}
                    placeholder="08012345678"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Account Role</label>
                  <select
                    value={createForm.role}
                    onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="customer">Customer (Standard End-User)</option>
                    <option value="agent">Agent (Commercial Reseller)</option>
                    <option value="staff">Staff (Internal Operator)</option>
                    <option value="admin">Administrator (Super Admin Access)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Initial Status</label>
                  <select
                    value={createForm.status}
                    onChange={e => setCreateForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="active">Active (Immediate Portal Access)</option>
                    <option value="pending">Pending Email Verification</option>
                    <option value="suspended">Suspended (Blocked Access)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">KYC Tier</label>
                  <select
                    value={createForm.tier}
                    onChange={e => setCreateForm(prev => ({ ...prev, tier: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={1}>Tier 1 (KYC Level 1 — Basic Profile)</option>
                    <option value={2}>Tier 2 (Level 2 KYC Verified - ₦500k daily)</option>
                    <option value={3}>Tier 3 (Enterprise Partner - ₦5M daily)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Initial Wallet Credit (₦)</label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={createForm.initial_balance}
                    onChange={e => setCreateForm(prev => ({ ...prev, initial_balance: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-bold focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                {(createForm.role === 'customer' || createForm.role === 'agent') && (
                  <div className="sm:col-span-2 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        {Number(createForm.tier) >= 2
                          ? 'Level 2 KYC Identity Details (Required for Tier 2+)'
                          : 'Optional Identity Details (Leave blank for KYC Level 1)'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">CBN / NDPR</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-300 font-medium block mb-1">Date of Birth</label>
                        <input
                          type="date"
                          value={createForm.date_of_birth || ''}
                          onChange={e => setCreateForm(prev => ({ ...prev, date_of_birth: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                        />
                      </div>

                      <div>
                        <label className="text-slate-300 font-medium block mb-1">State</label>
                        <select
                          value={createForm.state || ''}
                          onChange={e => setCreateForm(prev => ({ ...prev, state: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="">Select State (Optional)</option>
                          {NIGERIAN_STATES.map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-slate-300 font-medium block mb-1">LGA</label>
                        <input
                          type="text"
                          value={createForm.lga || ''}
                          onChange={e => setCreateForm(prev => ({ ...prev, lga: e.target.value }))}
                          placeholder="e.g. Ibeju-Lekki (Optional)"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                        />
                      </div>

                      <div>
                        <label className="text-slate-300 font-medium block mb-1">Official ID Type</label>
                        <select
                          value={createForm.id_type || 'nin_slip'}
                          onChange={e => setCreateForm(prev => ({ ...prev, id_type: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                        >
                          <option value="nin_slip">NIN Slip / NIMC Card</option>
                          <option value="drivers_license">Driver&apos;s License</option>
                          <option value="voters_card">Voter&apos;s Card</option>
                          <option value="international_passport">International Passport</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-slate-300 font-medium block mb-1">Residential Address</label>
                        <input
                          type="text"
                          value={createForm.residential_address || ''}
                          onChange={e => setCreateForm(prev => ({ ...prev, residential_address: e.target.value }))}
                          placeholder="Full street address (Optional)"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                        />
                      </div>

                      <div>
                        <label className="text-slate-300 font-medium block mb-1">11-Digit NIN</label>
                        <input
                          type="text"
                          maxLength={11}
                          value={createForm.nin || ''}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 11);
                            setCreateForm(prev => ({
                              ...prev,
                              nin: v,
                              id_number: prev.id_type === 'nin_slip' && (!prev.id_number || prev.id_number === prev.nin) ? v : prev.id_number,
                            }));
                          }}
                          placeholder="Optional 11-digit NIN"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-slate-300 font-medium block mb-1">11-Digit BVN</label>
                        <input
                          type="text"
                          maxLength={11}
                          value={createForm.bvn || ''}
                          onChange={e => setCreateForm(prev => ({ ...prev, bvn: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                          placeholder="Optional 11-digit BVN"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-slate-300 font-medium block mb-1">ID Document Number</label>
                        <input
                          type="text"
                          value={createForm.id_number || ''}
                          onChange={e => setCreateForm(prev => ({ ...prev, id_number: e.target.value }))}
                          placeholder="Optional ID document number"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-medium">Temporary Password</label>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[11px]"
                    >
                      <Sparkles className="w-3 h-3" />
                      Auto-generate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={createForm.password || ''}
                    onChange={e => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Leave blank to auto-generate secure password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-white block">Send Welcome &amp; Credential Email</span>
                    <span className="text-[11px] text-slate-400">Notifies customer &amp; alerts administrator</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={createForm.notify_customer}
                    onChange={e => setCreateForm(prev => ({ ...prev, notify_customer: e.target.checked }))}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {createLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>Provision Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STATUS CHANGE MODAL (Replaces window.prompt) */}
      {statusModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {statusModalTarget.status === 'active' ? 'Suspend Customer Account' : 'Reactivate Customer Account'}
              </h3>
              <button
                type="button"
                onClick={() => setStatusModalTarget(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmToggleStatus} className="space-y-3 text-xs">
              {statusError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
                  {statusError}
                </div>
              )}
              <p className="text-slate-400">
                Target: <span className="text-white font-semibold">{statusModalTarget.full_name}</span> ({statusModalTarget.email})
              </p>
              <div>
                <label className="block text-slate-400 mb-1">Reason for Audit Trail</label>
                <textarea
                  rows={3}
                  required
                  value={statusModalReason}
                  onChange={e => setStatusModalReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusModalTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusModalSaving}
                  className={`px-4 py-2 text-white rounded-xl font-semibold flex items-center gap-1.5 disabled:opacity-50 ${
                    statusModalTarget.status === 'active' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {statusModalSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Confirm {statusModalTarget.status === 'active' ? 'Suspension' : 'Activation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CUSTOMER CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <Trash2 className="w-4 h-4" />
                <span>Permanently Delete Customer</span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
                {deleteError}
              </div>
            )}

            <p className="text-slate-300 leading-relaxed">
              This will permanently remove <strong className="text-white">{deleteTarget.full_name}</strong> ({deleteTarget.email}) along with their profile, KYC records, notifications, and ledger history.
            </p>

            {(Number(deleteTarget.wallet_balance) || 0) > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
                <p>
                  Warning: Account holds a wallet balance of <strong className="font-mono">₦{(Number(deleteTarget.wallet_balance) || 0).toLocaleString()}</strong>.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteForce}
                    onChange={e => setDeleteForce(e.target.checked)}
                    className="rounded border-amber-500/40 bg-slate-900 text-rose-600"
                  />
                  <span>Force delete despite positive wallet balance</span>
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDeleteCustomer}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PUBLISH ANNOUNCEMENT MODAL (USER MANAGEMENT) */}
      {isAnnounceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Publish Customer Announcement</h3>
                  <p className="text-[11px] text-slate-400">Delivers to customer dashboards and registered emails</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAnnounceModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {announceError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{announceError}</span>
              </div>
            )}

            <form onSubmit={handlePublishAnnouncement} className="space-y-3.5">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Announcement Title *</label>
                <input
                  type="text"
                  required
                  value={announceTitle}
                  onChange={e => setAnnounceTitle(e.target.value)}
                  placeholder="e.g. Scheduled Service Update / New Tariff Notice"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Target Audience</label>
                  <select
                    value={announceAudience}
                    onChange={e => setAnnounceAudience(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all_customers">All Active Customers</option>
                    <option value="tier_1">Tier 1 Customers Only</option>
                    <option value="tier_2">Tier 2 KYC Verified Only</option>
                    <option value="tier_3">Tier 3 Enterprise Only</option>
                    <option value="verified_kyc">All Verified KYC Customers</option>
                    <option value="pending_kyc">Pending KYC Customers</option>
                    <option value="all_users">All Users (Customers &amp; Staff)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={announceCategory}
                    onChange={e => setAnnounceCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="general">General Announcement</option>
                    <option value="update">Platform Update</option>
                    <option value="maintenance">Maintenance Notice</option>
                    <option value="offer">Promo / Offer</option>
                    <option value="security">Security Advisory</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Announcement Message *</label>
                <textarea
                  rows={4}
                  required
                  value={announceMessage}
                  onChange={e => setAnnounceMessage(e.target.value)}
                  placeholder="Write the full announcement message for customers..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={announceActive}
                    onChange={e => setAnnounceActive(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Publish Active (Deliver to Dashboard &amp; Email)</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={announcePinned}
                    onChange={e => setAnnouncePinned(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span>Pin Notice</span>
                </label>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-start gap-2 text-[11px]">
                <Mail className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                <span>
                  Active announcements automatically send emails from <strong>HAMBAKTECH Support</strong> (notification@hambaktech.com.ng) with Reply-To set to <strong>support@hambaktech.com.ng</strong>.
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAnnounceModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={announceSaving}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {announceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
                  <span>{announceActive ? 'Publish & Send Email' : 'Save as Draft'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
