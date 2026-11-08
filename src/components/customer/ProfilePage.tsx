import React, { useState } from 'react';
import { User as UserIcon, Mail, Phone, MapPin, Shield, Copy, Check, CheckCircle2, AlertCircle, Loader2, Sparkles, Camera } from 'lucide-react';
import { api } from '../../lib/api';
import { User } from '../../types';

interface ProfilePageProps {
  user: User;
  onUpdateUser: (updated: User) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
];

export function ProfilePage({ user, onUpdateUser }: ProfilePageProps) {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phone_number || '');
  const [address, setAddress] = useState(user.address || '');
  const [state, setState] = useState(user.state || 'Kano');
  const [lga, setLga] = useState(user.lga || 'Nassarawa');
  const [bio, setBio] = useState(user.bio || 'HambakTech Enterprise Agent & Telecom Reseller');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || PRESET_AVATARS[0]);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(user.referral_code);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.updateCustomerProfile({
        full_name: fullName,
        phone_number: phoneNumber,
        address,
        state,
        lga,
        bio,
        avatar_url: avatarUrl,
      });
      if (res?.user) {
        onUpdateUser(res.user);
        setSuccessMsg('Your profile biodata has been updated successfully.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative group">
              <img
                src={avatarUrl}
                alt={user.full_name}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-500/40 shadow-xl"
              />
              <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                  {user.full_name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold capitalize">
                  Tier {user.tier} Account
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">{user.email}</p>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                    user.kyc_status === 'verified'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  <span>KYC {user.kyc_status}</span>
                </span>
                <span className="text-slate-400 font-mono">
                  Role: <span className="text-white capitalize">{user.role}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Referral Card */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 sm:min-w-[240px]">
            <p className="text-xs text-slate-400">Your Referral Code</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-base font-bold font-mono text-emerald-400 tracking-wider">
                {user.referral_code}
              </span>
              <button
                type="button"
                onClick={handleCopyReferral}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                title="Copy Referral Code"
              >
                {copiedRef ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Earn ₦50 on every referee's first data top-up.
            </p>
          </div>
        </div>
      </div>

      {/* Profile Form & Avatar Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSave} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-indigo-400" />
            <span>Personal & Business Biodata</span>
          </h2>

          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Full Legal Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-400 cursor-not-allowed font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                State of Residence
              </label>
              <input
                type="text"
                value={state}
                onChange={e => setState(e.target.value)}
                placeholder="e.g. Kano, Lagos, Abuja"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                LGA / City
              </label>
              <input
                type="text"
                value={lga}
                onChange={e => setLga(e.target.value)}
                placeholder="e.g. Nassarawa, Ikeja"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                NIN Record
              </label>
              <input
                type="text"
                value={user.nin ? `${user.nin.slice(0, 3)}****${user.nin.slice(-3)}` : 'Not linked'}
                disabled
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-400 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Physical Office / Residential Address
            </label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Plot Number, Street Name, Commercial Quarter"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Professional Bio
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={e => setBio(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <span>Save Profile Updates</span>
            )}
          </button>
        </form>

        {/* Avatar Preset Picker & Account Status Box */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-indigo-400" />
              <span>Choose Profile Avatar</span>
            </h3>
            <p className="text-xs text-slate-400">
              Select one of the official avatar presets or input a custom image URL:
            </p>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_AVATARS.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAvatarUrl(url)}
                  className={`rounded-xl overflow-hidden border-2 transition ${
                    avatarUrl === url
                      ? 'border-indigo-500 ring-2 ring-indigo-500/40 scale-105'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <img src={url} alt="preset" className="w-full h-12 object-cover" />
                </button>
              ))}
            </div>
            <div className="space-y-1 pt-2">
              <label className="text-[11px] text-slate-400">Custom Image URL</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Account Tier Privileges */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Tier {user.tier} Privileges</span>
            </h3>
            <ul className="space-y-2 text-slate-400">
              <li className="flex items-center justify-between">
                <span>Daily Telecom Limit:</span>
                <span className="font-mono text-white">₦500,000</span>
              </li>
              <li className="flex items-center justify-between">
                <span>NIN Verification Slips:</span>
                <span className="font-mono text-white">Unlimited</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Dedicated Moniepoint VA:</span>
                <span className="text-emerald-400 font-semibold">Active</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Airtime Discount:</span>
                <span className="font-mono text-white">2.5%</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
