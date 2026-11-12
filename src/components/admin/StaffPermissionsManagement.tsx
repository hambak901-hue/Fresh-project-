import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  UserPlus,
  Shield,
  CheckCircle2,
  AlertCircle,
  Lock,
  Key,
  X,
  Loader2,
  RefreshCw,
  Ban,
  Check,
  Edit,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../lib/api';
import { User } from '../../types';

const PERMISSION_OPTIONS = [
  { id: 'customers', label: 'Customer Management (Edit, Suspend, Notify)' },
  { id: 'wallet', label: 'Wallet Adjustments (Manual Credits & Debits)' },
  { id: 'kyc', label: 'KYC Compliance Reviews (Verify Documents & Tiers)' },
  { id: 'services', label: 'Service Pricing & Catalogs (NIN, Telecom, Store, Academy)' },
  { id: 'cms', label: 'Global CMS & Branding (Landing Page, Banners, Announcements)' },
  { id: 'audit', label: 'Audit Log Exploration (Full Activity Journals)' },
  { id: 'staff', label: 'Staff Management (Create & Edit Staff Accounts)' },
];

export function StaffPermissionsManagement() {
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // New staff form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'superadmin'>('admin');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    'customers',
    'wallet',
    'kyc',
    'services',
    'cms',
    'audit',
  ]);

  // Edit staff modal
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<string>('admin');
  const [editSaving, setEditSaving] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminStaff();
      setStaff(res.staff || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setMessage(null);
    try {
      const res = await api.createStaffAccount({
        full_name: fullName,
        email,
        phone_number: phone,
        password,
        role,
        permissions: selectedPermissions,
      });
      setMessage({ type: 'success', text: res.message });
      setCreateModalOpen(false);
      setFullName('');
      setEmail('');
      setPassword('');
      await fetchStaff();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create staff account' });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setEditSaving(true);
    try {
      const res = await api.updateStaffAccount(editingStaff.id, {
        role: editRole as any,
        permissions: editPermissions,
      });
      setMessage({ type: 'success', text: res.message });
      setEditingStaff(null);
      await fetchStaff();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update staff' });
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleStaffStatus = async (staffUser: User) => {
    if (staffUser.role === 'superadmin') {
      setMessage({ type: 'error', text: 'Super Admin accounts cannot be suspended.' });
      return;
    }
    const nextStatus = staffUser.status === 'active' ? 'suspended' : 'active';
    try {
      await api.updateStaffAccount(staffUser.id, { status: nextStatus });
      setMessage({ type: 'success', text: `Staff status updated to ${nextStatus}.` });
      await fetchStaff();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to update staff status' });
    }
  };

  const togglePermission = (permId: string, currentList: string[], setList: (l: string[]) => void) => {
    if (currentList.includes(permId)) {
      setList(currentList.filter(p => p !== permId));
    } else {
      setList([...currentList, permId]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full mb-3">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Role-Based Access Control (RBAC)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Staff &amp; Permissions Management
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              Authorize platform operators, assign granular permission scopes for compliance &amp; finance, and audit staff actions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-600/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Staff Account</span>
            </button>
            <button
              onClick={fetchStaff}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Staff Accounts Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-4">Administrative Role</th>
                <th className="py-3.5 px-4">Granular Permissions</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {staff.map(s => {
                const isSuperAdmin = s.role === 'superadmin';
                const isSuspended = s.status === 'suspended';
                return (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                          isSuperAdmin ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300'
                        }`}>
                          {s.full_name?.charAt(0) || 'S'}
                        </div>
                        <div>
                          <p className="font-bold text-white flex items-center gap-2">
                            <span>{s.full_name}</span>
                            {isSuperAdmin && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                OWNER
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded font-mono text-[10px] font-semibold uppercase ${
                        isSuperAdmin ? 'bg-amber-500/10 text-amber-400' : 'bg-indigo-500/10 text-indigo-400'
                      }`}>
                        {s.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-sm">
                        {isSuperAdmin ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                            ALL PERMISSIONS (FULL ROOT)
                          </span>
                        ) : (s.permissions && s.permissions.length > 0) ? (
                          s.permissions.map(p => (
                            <span key={p} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 italic text-[10px]">Standard Admin Read</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                        s.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {!isSuperAdmin && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStaff(s);
                              setEditRole(s.role);
                              setEditPermissions(s.permissions || ['customers', 'wallet']);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-semibold"
                          >
                            Permissions
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStaffStatus(s)}
                            className={`p-1.5 rounded-lg transition ${
                              isSuspended ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                            }`}
                            title={isSuspended ? 'Reactivate' : 'Suspend Staff'}
                          >
                            {isSuspended ? <Check className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Staff Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateStaff} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <span>Create New Administrative Account</span>
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-400">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Ibrahim Abubakar"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400">Staff Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. ibrahim@hambaktech.com.ng"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-400">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400">Administrative Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="admin">Admin Operator</option>
                  <option value="superadmin">Super Admin (Full Root)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-slate-400 font-semibold">Granted Permission Scopes</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {PERMISSION_OPTIONS.map(opt => (
                  <label key={opt.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(opt.id)}
                      onChange={() => togglePermission(opt.id, selectedPermissions, setSelectedPermissions)}
                      className="accent-indigo-600 rounded"
                    />
                    <span className="text-white text-xs">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={createLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2"
              >
                {createLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Create Staff Account</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Staff Permissions Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleUpdateStaff} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Edit Permissions: {editingStaff.full_name}</h3>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400">Assigned Role</label>
              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
              >
                <option value="admin">Admin Operator</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-slate-400 font-semibold">Active Permission Scopes</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {PERMISSION_OPTIONS.map(opt => (
                  <label key={opt.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700">
                    <input
                      type="checkbox"
                      checked={editPermissions.includes(opt.id)}
                      onChange={() => togglePermission(opt.id, editPermissions, setEditPermissions)}
                      className="accent-indigo-600 rounded"
                    />
                    <span className="text-white text-xs">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={editSaving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2"
              >
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Save Permissions</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
