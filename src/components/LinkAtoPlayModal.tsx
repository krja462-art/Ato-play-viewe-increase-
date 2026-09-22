import React, { useState } from 'react';
import { X, CheckCircle2, UserCheck, AlertCircle, Sparkles, ExternalLink } from 'lucide-react';
import { User } from '../types';
import { AtoPlayBadge } from './AtoPlayBadge';
import { apiFetch } from '../lib/api';
import { saveUserAtoPlayUsernameToFirestore } from '../lib/firebase';

interface LinkAtoPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSuccess: (updatedUser: User) => void;
  title?: string;
  description?: string;
}

export const LinkAtoPlayModal: React.FC<LinkAtoPlayModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
  title = "Link Your AtoPlay Username",
  description = "Please link your AtoPlay channel name / username to verify follow actions and claim follow bonus coins."
}) => {
  const [username, setUsername] = useState(user.atoPlayUsername || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = username.trim().replace(/^@+/, '');
    if (!clean) {
      setErrorMsg('Please enter your exact AtoPlay channel name or username.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      // 1. Update in Backend
      const res = await apiFetch('/api/user/atoplay-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ username: clean })
      });

      // 2. Persist to Cloud Firestore
      await saveUserAtoPlayUsernameToFirestore(user.id, clean);

      // 3. Update local state
      const updated: User = {
        ...user,
        atoPlayUsername: clean
      };

      try {
        localStorage.setItem('atoviewer_user', JSON.stringify(updated));
      } catch {}

      setSuccessMsg(`Linked successfully as @${clean}!`);
      setTimeout(() => {
        onSuccess(updated);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Failed to link username:', err);
      // Resilient fallback: save locally & Firestore
      await saveUserAtoPlayUsernameToFirestore(user.id, clean).catch(() => {});
      const fallbackUser: User = { ...user, atoPlayUsername: clean };
      try {
        localStorage.setItem('atoviewer_user', JSON.stringify(fallbackUser));
      } catch {}
      onSuccess(fallbackUser);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h3 className="font-extrabold text-base text-zinc-900">{title}</h3>
                <AtoPlayBadge size="sm" />
              </div>
              <p className="text-xs text-zinc-500">Channel Verification & Anti-Fraud</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning / Explanation Banner */}
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
          <div className="flex items-center space-x-1.5 font-bold">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Why is this required?</span>
          </div>
          <p className="text-amber-800 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 block">
              Your AtoPlay Channel Name / Username
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-zinc-400 font-bold text-sm select-none">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="MyChannelName"
                autoFocus
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm font-semibold text-zinc-800"
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              Enter the exact name of your channel on atoplay.com so creators can verify your follow.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-bold text-xs cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !username.trim()}
              className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md shadow-red-500/20 transition-all hover:scale-101 cursor-pointer disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center space-x-1.5"
            >
              {submitting ? (
                <span>Linking...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save & Continue</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
