import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Smartphone,
  Laptop,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Eye,
  Image as ImageIcon,
  Loader2,
  Save,
  Check,
  FileCheck
} from 'lucide-react';
import { api } from '../../lib/api';

interface LogoUploaderProps {
  currentLogoUrl: string;
  onLogoUpdated: (newLogoUrl: string) => void;
}

export const LogoUploader: React.FC<LogoUploaderProps> = ({ currentLogoUrl, onLogoUpdated }) => {
  const [sourceMode, setSourceMode] = useState<'device' | 'url'>('device');
  const [previewUrl, setPreviewUrl] = useState<string>(currentLogoUrl || '/logo.png');
  const [directUrl, setDirectUrl] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<{
    base64: string;
    name: string;
    mime: string;
    sizeKb: number;
  } | null>(null);

  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_MIMES = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/svg+xml',
    'image/webp',
    'application/pdf',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Selected file exceeds maximum allowed size of 5MB.');
      return;
    }

    if (!ALLOWED_MIMES.includes(file.type.toLowerCase()) && !file.name.match(/\.(png|jpe?g|svg|webp|pdf)$/i)) {
      setErrorMessage('Invalid file format. Supported formats: PNG, JPG, JPEG, SVG, WebP, PDF.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setSelectedFile({
        base64: result,
        name: file.name,
        mime: file.type || 'image/png',
        sizeKb: Math.round(file.size / 1024),
      });

      // If image, preview it directly
      if (file.type.startsWith('image/')) {
        setPreviewUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadAndSave = async () => {
    setUploading(true);
    setUploadProgress(20);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let payload: {
        file_base64?: string;
        file_name?: string;
        mime_type?: string;
        image_url?: string;
      } = {};

      if (sourceMode === 'device') {
        if (!selectedFile) {
          throw new Error('Please select an image file from your device first.');
        }
        setUploadProgress(45);
        payload = {
          file_base64: selectedFile.base64,
          file_name: selectedFile.name,
          mime_type: selectedFile.mime,
        };
      } else {
        if (!directUrl.trim()) {
          throw new Error('Please enter a valid image URL.');
        }
        setUploadProgress(45);
        payload = {
          image_url: directUrl.trim(),
        };
      }

      setUploadProgress(70);
      const res = await api.uploadLogo(payload);

      setUploadProgress(100);
      if (res.success && res.logo_url) {
        setPreviewUrl(res.logo_url);
        setSuccessMessage('Logo published and synchronized across all dashboards!');
        setSelectedFile(null);
        setDirectUrl('');
        onLogoUpdated(res.logo_url);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        throw new Error(res.message || 'Failed to update logo');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Logo upload failed');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const handleResetToDefault = async () => {
    setUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await api.removeLogo();
      if (res.success) {
        setPreviewUrl('/logo.png');
        setSelectedFile(null);
        setDirectUrl('');
        setSuccessMessage('Logo restored to default branding!');
        onLogoUpdated('/logo.png');
        setConfirmRemoveOpen(false);
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to restore default logo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h4 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-indigo-400" />
            <span>Global Logo Uploader &amp; Brand Engine</span>
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Synchronizes official platform branding across the website, authentication portals, and admin sidebars.
          </p>
        </div>

        {/* Source Toggle */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto text-xs">
          <button
            type="button"
            onClick={() => setSourceMode('device')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              sourceMode === 'device'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <Smartphone className="w-3.5 h-3.5" />
            <span>Local / Mobile Storage</span>
          </button>
          <button
            type="button"
            onClick={() => setSourceMode('url')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              sourceMode === 'url'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Direct Image URL</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Upload Progress Bar */}
      {uploading && uploadProgress > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-indigo-300">
            <span>Uploading &amp; publishing logo...</span>
            <span className="font-mono">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Container: Preview + Input */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Preview Card */}
        <div className="md:col-span-1 flex flex-col items-center justify-center p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 text-center space-y-3">
          <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Live Preview</span>
          <div className="w-32 h-20 sm:w-40 sm:h-24 rounded-xl bg-slate-900/90 border border-slate-700/60 p-2 flex items-center justify-center overflow-hidden shadow-inner">
            <img
              src={previewUrl}
              alt="HambakTech Logo Preview"
              className="max-h-full max-w-full object-contain transition-transform hover:scale-105"
              onError={(e) => {
                // Fallback to placeholder wordmark if image fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]" title={previewUrl}>
            {previewUrl}
          </span>
        </div>

        {/* Input / Picker Card */}
        <div className="md:col-span-2 space-y-3">
          {sourceMode === 'device' ? (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-5 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-800/30 transition-all flex flex-col items-center justify-center gap-2"
              >
                <div className="p-2.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    Click to select from your Computer or Mobile Gallery
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Supports PNG, JPG, JPEG, SVG, WebP, PDF (Max 5MB)
                  </p>
                </div>
              </div>

              {selectedFile && (
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <FileCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-slate-200 font-medium truncate">{selectedFile.name}</span>
                    <span className="text-slate-500 font-mono">({selectedFile.sizeKb} KB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(currentLogoUrl || '/logo.png');
                    }}
                    className="text-slate-400 hover:text-rose-400 transition"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-medium block">
                Direct Image URL (HTTPS)
              </label>
              <div className="relative">
                <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="url"
                  value={directUrl}
                  onChange={(e) => {
                    setDirectUrl(e.target.value);
                    if (e.target.value.match(/^https?:\/\//i)) {
                      setPreviewUrl(e.target.value);
                    }
                  }}
                  placeholder="https://example.com/assets/logo.png"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Ensure the image link is publicly accessible with CORS enabled.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setConfirmRemoveOpen(true)}
              className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5 transition py-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset to Default Logo</span>
            </button>

            <button
              type="button"
              onClick={handleUploadAndSave}
              disabled={uploading || (!selectedFile && !directUrl.trim())}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save &amp; Publish Logo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal to Reset */}
      {confirmRemoveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">Reset Logo to Default?</h4>
                <p className="text-xs text-slate-400">This will remove custom branding and restore /logo.png.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to revert to the default HambakTech shield logo across the website and portals?
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveOpen(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={uploading}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Confirm Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
