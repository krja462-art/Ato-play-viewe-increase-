import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  FileText, 
  Mail, 
  LogOut, 
  Coins, 
  ChevronRight, 
  Send, 
  CheckCircle2, 
  ExternalLink,
  MessageCircle,
  HelpCircle,
  Sparkles,
  Gift,
  Share2,
  Copy,
  Check,
  Users,
  Award,
  Download,
  Smartphone,
  Share,
  PlusSquare,
  Info,
  RefreshCw,
  MessageSquare
} from 'lucide-react';
import { User } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { apiFetch } from '../lib/api';
import { saveSupportMessageToFirestore } from '../lib/firebase';

import { AtoPlayBadge } from './AtoPlayBadge';
import { SubmitFeedbackModal } from './SubmitFeedbackModal';

interface SlideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLogout?: () => void;
  onUserUpdate?: (updatedUser: User) => void;
}

export const SlideDrawer: React.FC<SlideDrawerProps> = ({
  isOpen,
  onClose,
  user,
  onLogout,
  onUserUpdate
}) => {
  const [activeModal, setActiveModal] = useState<'privacy' | 'terms' | 'contact' | 'referral' | 'ios_install' | 'apk_bundle' | 'feedback' | null>(null);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // Referral State
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [redeemInputCode, setRedeemInputCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Contact Form State
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactName, setContactName] = useState(user?.name || '');
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);

  React.useEffect(() => {
    if (user?.name && !contactName) setContactName(user.name);
    if (user?.email && !contactEmail) setContactEmail(user.email);
  }, [user]);

  const referralCode = user?.referralCode || 'REF-A482';
  const referralLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/?ref=${referralCode}`
    : `https://atoplaybooster.app/?ref=${referralCode}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (e) {
      console.error('Failed to copy code', e);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      console.error('Failed to copy link', e);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AtoPlay Booster - Earn 250 Free Coins',
          text: `Join AtoPlay Booster to boost your AtoPlay channel views & watch time! Use my referral code ${referralCode} to get 250 Free Coins:`,
          url: referralLink,
        });
      } catch (err) {
        // Ignored if cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `🚀 Join AtoPlay Booster to get real views and watch hours for your AtoPlay channel! Use my referral code *${referralCode}* to get 250 Free Welcome Coins:\n\n${referralLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleShareTelegram = () => {
    const text = encodeURIComponent(
      `🚀 Join AtoPlay Booster to get real views for your AtoPlay videos! Use my code ${referralCode} to get 250 Free Coins!`
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`, '_blank');
  };

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemInputCode.trim() || !user) return;

    try {
      setRedeeming(true);
      setRedeemMessage(null);
      const data = await apiFetch('/api/referral/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ code: redeemInputCode.trim() })
      });

      if (data?.success) {
        setRedeemMessage({
          type: 'success',
          text: `Awesome! You received ${data.bonusCoins || 250} Coins welcome referral bonus!`
        });
        setRedeemInputCode('');
        if (onUserUpdate && data.user) {
          onUserUpdate(data.user);
        }
      } else {
        setRedeemMessage({
          type: 'error',
          text: data?.message || 'Invalid or already redeemed referral code.'
        });
      }
    } catch (err) {
      setRedeemMessage({
        type: 'error',
        text: 'Network error while redeeming code. Please try again.'
      });
    } finally {
      setRedeeming(false);
    }
  };

  if (!isOpen && !activeModal) return null;

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactMessage.trim()) return;

    setContactSending(true);
    const senderName = contactName.trim() || user?.name || 'AtoPlay App User';
    const senderEmail = contactEmail.trim() || user?.email || 'user@atoplaybooster.app';
    const subject = contactSubject.trim() || 'AtoPlay Booster Query';
    const message = contactMessage.trim();

    try {
      // 1. Send to server backend which routes to krja462@gmail.com
      await apiFetch('/api/support/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || ''
        },
        body: JSON.stringify({
          name: senderName,
          email: senderEmail,
          subject,
          message
        })
      });

      // 2. Also save to Cloud Firestore support_messages collection
      saveSupportMessageToFirestore({
        userId: user?.id || 'anonymous',
        userName: senderName,
        userEmail: senderEmail,
        targetEmail: 'krja462@gmail.com',
        subject,
        message
      }).catch(err => console.warn('Firestore support save error:', err));

      setContactSent(true);
    } catch (err: any) {
      console.warn('Support message submit error:', err);
      // Even if network fails, ensure Firestore has it
      saveSupportMessageToFirestore({
        userId: user?.id || 'anonymous',
        userName: senderName,
        userEmail: senderEmail,
        targetEmail: 'krja462@gmail.com',
        subject,
        message
      }).catch(() => {});
      setContactSent(true);
    } finally {
      setContactSending(false);
    }
  };

  return (
    <>
      {/* Slide Drawer Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        />
      )}

      {/* Slide Drawer Panel */}
      {isOpen && (
        <aside className="fixed top-0 right-0 bottom-0 z-50 w-80 sm:w-96 max-w-[88vw] bg-white shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
          
          {/* Top Header & User Profile Info */}
          <div className="p-5 sm:p-6 space-y-5">
            
            {/* Header bar with close button */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2.5">
                <img
                  src="/icon.png"
                  alt="AtoPlay Booster"
                  className="w-7 h-7 rounded-lg object-contain shadow-xs border border-zinc-200/80"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/favicon.png';
                  }}
                />
                <h2 className="font-extrabold text-base text-zinc-900 tracking-tight">Account & Menu</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                title="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Profile Card */}
            {user && (
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/90 shadow-xs space-y-3">
                <div className="flex items-center space-x-3.5">
                  <div className="relative">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="w-13 h-13 rounded-full border-2 border-white object-cover shadow-sm bg-zinc-100"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';
                      }}
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-xs" title="Verified Google Account">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5">
                      <h3 className="font-extrabold text-base text-zinc-900 truncate">{user.name}</h3>
                      {Boolean(user.isAdmin || user.email?.toLowerCase().trim() === 'krja462@gmail.com') && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider border border-amber-300 shrink-0">
                          👑 Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 truncate font-medium">{user.email}</p>
                    <div className="mt-1 flex items-center space-x-1 text-[11px] font-semibold text-emerald-700">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Google Account Verified</span>
                    </div>
                  </div>
                </div>

                {/* Coin Balance Badge */}
                <div className="pt-2 border-t border-zinc-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Coins className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-zinc-700">Total Coins</span>
                  </div>
                  <span className="text-sm font-black text-amber-700">
                    {Boolean(user.isAdmin || user.email?.toLowerCase().trim() === 'krja462@gmail.com')
                      ? '∞ Unlimited Coins'
                      : `${user.coins.toLocaleString()} Coins`}
                  </span>
                </div>


              </div>
            )}

            {/* Refer Friends & Earn 250 Coins Featured Box */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/90 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <h4 className="font-extrabold text-sm text-amber-950">Refer Friends</h4>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200/80 text-amber-900 font-black">
                        +250 COINS
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800">Earn 250 coins per friend invited</p>
                  </div>
                </div>
              </div>

              {/* Referral Code Quick Copy Box */}
              <div className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-amber-200 shadow-xs">
                <div className="pl-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">Your Code</span>
                  <span className="font-mono font-black text-sm text-zinc-900 tracking-wider">
                    {referralCode}
                  </span>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center space-x-1 shadow-xs transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>

              {/* Open Full Refer Friends & Link Section */}
              <button
                onClick={() => setActiveModal('referral')}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Invite Friends & Get Link</span>
              </button>
            </div>

            {/* Navigation Menu Buttons */}
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 px-1">
                Help & Information
              </p>

              {/* Privacy Policy */}
              <button
                onClick={() => setActiveModal('privacy')}
                className="w-full p-3 rounded-2xl hover:bg-blue-50/70 border border-transparent hover:border-blue-100 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900 group-hover:text-blue-600">Privacy Policy</h4>
                    <p className="text-[11px] text-zinc-500">Data safety & Google login protection</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* Terms of Service */}
              <button
                onClick={() => setActiveModal('terms')}
                className="w-full p-3 rounded-2xl hover:bg-purple-50/70 border border-transparent hover:border-purple-100 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100/70 text-purple-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900 group-hover:text-purple-600">Terms & Conditions</h4>
                    <p className="text-[11px] text-zinc-500">1-campaign rule & fair view guidelines</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* Contact Us */}
              <button
                onClick={() => setActiveModal('contact')}
                className="w-full p-3 rounded-2xl hover:bg-emerald-50/70 border border-transparent hover:border-emerald-100 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900 group-hover:text-emerald-600">Contact Us</h4>
                    <p className="text-[11px] text-zinc-500">24/7 Creator support & help desk</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* Submit Feedback */}
              <button
                onClick={() => setActiveModal('feedback')}
                className="w-full p-3 rounded-2xl hover:bg-amber-50/70 border border-transparent hover:border-amber-100 flex items-center justify-between text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100/70 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900 group-hover:text-amber-600">Submit Feedback</h4>
                    <p className="text-[11px] text-zinc-500">Send suggestions or report bugs to admin</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* Install PWA App Option: Completely removed once downloaded/installed */}
              {!isInstalled && (
                <button
                  onClick={() => setActiveModal('apk_bundle')}
                  className="w-full p-3 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200/80 flex items-center justify-between text-left transition-all cursor-pointer group shadow-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <h4 className="font-bold text-sm text-zinc-900 group-hover:text-blue-600">Install App (WebAPK)</h4>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-black uppercase">
                          Android
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500">Direct 1-Click Install on Android</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                </button>
              )}
            </div>

          </div>

          {/* Bottom Footer Section with Sign Out Button (Refresh Google button removed as requested) */}
          <div className="p-5 sm:p-6 border-t border-zinc-100 space-y-3 bg-zinc-50/50">
            {onLogout && (
              <button
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="w-full py-3.5 px-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 font-extrabold text-sm flex items-center justify-center space-x-2 border border-red-200 shadow-xs transition-all hover:scale-101 active:scale-98 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out from Google</span>
              </button>
            )}

            <div className="flex items-center justify-center space-x-1.5 text-[11px] text-zinc-400 font-medium">
              <img src="/icon.png" alt="AtoPlay" className="w-4 h-4 rounded-xs object-contain opacity-80" />
              <span>AtoPlay Booster • Version 2.5.0</span>
            </div>
          </div>

        </aside>
      )}

      {/* Refer Friends & Earn Modal */}
      {activeModal === 'referral' && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-600">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-zinc-900">Refer Friends & Earn</h3>
                  <p className="text-xs text-amber-700 font-bold">Earn 250 Coins for every friend invited</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* How it works info banner */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
              <div className="flex items-center space-x-2 text-amber-900 font-extrabold text-sm">
                <Award className="w-4 h-4 text-amber-600" />
                <span>Double Reward: 250 Coins for You & Your Friend!</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Invite your friends or fellow creators to AtoPlay Booster. When they sign in or redeem your referral code, 
                <strong> you get 250 Coins</strong> and <strong>they also receive 250 Coins</strong> instantly!
              </p>
            </div>

            {/* Unique Referral Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Your Unique Referral Code
              </label>
              <div className="flex items-center space-x-2 bg-zinc-50 border border-zinc-200 rounded-xl p-2.5">
                <span className="font-mono font-black text-base text-zinc-900 px-2 flex-1 select-all tracking-wider">
                  {referralCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
            </div>

            {/* Unique Referral Link */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Your Unique Referral Link
              </label>
              <div className="flex items-center space-x-2 bg-zinc-50 border border-zinc-200 rounded-xl p-2.5">
                <input
                  type="text"
                  readOnly
                  value={referralLink}
                  className="bg-transparent text-xs text-zinc-700 flex-1 font-mono outline-none truncate select-all px-1"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Social Sharing Buttons */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Share With Creators
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleShareWhatsApp}
                  className="py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp</span>
                </button>

                <button
                  onClick={handleShareTelegram}
                  className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4 text-blue-600" />
                  <span>Telegram</span>
                </button>

                <button
                  onClick={handleNativeShare}
                  className="py-2.5 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 font-bold text-xs flex flex-col items-center justify-center space-y-1 transition-colors cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-zinc-700" />
                  <span>More Apps</span>
                </button>
              </div>
            </div>

            {/* Referral Stats */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-center space-y-0.5">
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Friends Invited</p>
                <p className="text-xl font-black text-zinc-900">{user?.referralsCount || 0}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-center space-y-0.5">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Referral Coins</p>
                <p className="text-xl font-black text-amber-800">{user?.referralEarnings || 0}</p>
              </div>
            </div>

            {/* Redeem Friend's Code Section */}
            <div className="pt-2 border-t border-zinc-100 space-y-2.5">
              <div className="flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-zinc-600" />
                <h4 className="font-bold text-xs sm:text-sm text-zinc-900">
                  Have a Friend's Referral Code?
                </h4>
              </div>

              {user?.referredBy ? (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Referral bonus claimed! (Referred by: {user.referredBy})</span>
                </div>
              ) : (
                <form onSubmit={handleRedeemCode} className="space-y-2">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Enter code (e.g. REF-B291)"
                      value={redeemInputCode}
                      onChange={e => setRedeemInputCode(e.target.value.toUpperCase())}
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 font-mono text-xs sm:text-sm uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={redeeming || !redeemInputCode.trim()}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer"
                    >
                      {redeeming ? 'Applying...' : 'Claim 250 Coins'}
                    </button>
                  </div>

                  {redeemMessage && (
                    <div className={`p-2.5 rounded-xl text-xs font-bold ${
                      redeemMessage.type === 'success' 
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border border-red-200 text-red-800'
                    }`}>
                      {redeemMessage.text}
                    </div>
                  )}
                </form>
              )}
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <button
                onClick={() => setActiveModal(null)}
                className="w-full py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {activeModal === 'privacy' && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-lg text-zinc-900">Privacy Policy</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-zinc-600 leading-relaxed">
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900">
                <p className="font-bold">Summary: Your Privacy is 100% Protected</p>
                <p className="text-xs pt-1 text-blue-800">
                  AtoPlay Booster is an honest community exchange platform. We never sell or share your personal information.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm">1. Information We Collect</h4>
                <p className="pt-1">
                  When you sign in using Google, we only receive your basic public profile information: your name, email address, and profile picture avatar. We do not receive or store your Google password.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm">2. Video URLs & Watch Activity</h4>
                <p className="pt-1">
                  When you launch a campaign, the public video URL you provide is shared with other users to watch. Videos open directly in your standard browser (Chrome) without any hidden iframe recording.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm">3. Coin Economy & Anti-Cheat</h4>
                <p className="pt-1">
                  We use a 60-second anti-fraud verification token to make sure genuine views are delivered. Coin balances are stored securely and used solely for launching video promotions.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm">4. Data Control & Deletion</h4>
                <p className="pt-1">
                  You can delete your campaigns at any time for an instant refund of unspent views. You can log out anytime from the account drawer.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100">
              <button
                onClick={() => setActiveModal(null)}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
              >
                I Understand & Agree
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Terms & Conditions Modal */}
      {activeModal === 'terms' && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-600">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-lg text-zinc-900">Terms & Conditions</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-zinc-600 leading-relaxed">
              <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900">
                <p className="font-bold">Community Promotion Guidelines</p>
                <p className="text-xs pt-1 text-purple-800">
                  Please read the terms governing video promotion campaigns and coin earnings.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm">1. One Active Campaign Policy</h4>
                <p className="pt-1">
                  To ensure equal visibility for all creators, each user is permitted to run <strong>only one active campaign at a time</strong>. You can launch your next campaign immediately after your current campaign completes its targeted views.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm">2. 60-Second Watch Rule</h4>
                <p className="pt-1">
                  Viewers must keep the video playing in their browser for at least 60 seconds. Premature exits or attempts to bypass countdown timers will invalidate coin rewards.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm">3. Prohibited Content</h4>
                <p className="pt-1">
                  Submitted videos must comply with AtoPlay and YouTube terms of service. Hate speech, dangerous content, or misleading clickbait URLs are strictly prohibited.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-zinc-900 text-sm">4. Nature of Coins</h4>
                <p className="pt-1">
                  Booster coins are promotional tokens within this application to facilitate organic viewer exchange. They hold no cash redemption value.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100">
              <button
                onClick={() => setActiveModal(null)}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
              >
                Accept & Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Contact Us Modal */}
      {activeModal === 'contact' && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-zinc-900">Contact Us & Support</h3>
                  <p className="text-xs text-zinc-500">We are here to assist AtoPlay creators 24/7</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Support channels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1">
                <div className="flex items-center space-x-2 text-zinc-900 font-bold text-xs">
                  <Mail className="w-4 h-4 text-emerald-600" />
                  <span>Email Support</span>
                </div>
                <p className="text-xs text-zinc-600 font-mono select-all">
                  support@atoplaybooster.com
                </p>
                <p className="text-[11px] text-zinc-400">Response within 24 hours</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1">
                <div className="flex items-center space-x-2 text-zinc-900 font-bold text-xs">
                  <MessageCircle className="w-4 h-4 text-blue-600" />
                  <span>Telegram Community</span>
                </div>
                <p className="text-xs text-blue-600 font-bold">
                  @AtoPlayBoosterHelp
                </p>
                <p className="text-[11px] text-zinc-400">Live creator discussion</p>
              </div>
            </div>

            {/* Direct Message Form */}
            {contactSent ? (
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-300 text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h4 className="font-extrabold text-emerald-900 text-base">Message Sent to Support!</h4>
                <p className="text-xs text-emerald-700 max-w-sm mx-auto leading-relaxed">
                  Aapka message support team ko (<strong>krja462@gmail.com</strong>) par bhej diya gaya hai. Hamari team jald hi aapke email par sampark karegi.
                </p>

                <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                  <a
                    href={`mailto:krja462@gmail.com?subject=${encodeURIComponent(contactSubject || 'AtoPlay Booster Query')}&body=${encodeURIComponent(`User: ${contactName}\nEmail: ${contactEmail}\n\n${contactMessage}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Open in Gmail App</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setContactSent(false);
                      setContactMessage('');
                      setContactSubject('');
                    }}
                    className="py-2.5 px-4 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Send Another Message
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Your Name</label>
                    <input
                      type="text"
                      placeholder="Your name"
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Your Email</label>
                    <input
                      type="email"
                      required
                      placeholder="Your reply email"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Subject</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Campaign query, Coin inquiry, Feedback"
                    value={contactSubject}
                    onChange={e => setContactSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs sm:text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Message</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe your issue, suggestion or question..."
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs sm:text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>

                <div className="flex space-x-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="flex-1 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={contactSending || !contactMessage.trim()}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all hover:scale-102 cursor-pointer flex items-center justify-center space-x-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{contactSending ? 'Sending...' : 'Send Message'}</span>
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* iOS & Desktop Install Instructions Modal */}
      {activeModal === 'ios_install' && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center space-x-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="AtoViewer"
                  className="w-9 h-9 rounded-xl shadow-xs border border-zinc-100 object-cover"
                />
                <div>
                  <h3 className="font-black text-base text-zinc-900">Install AtoViewer</h3>
                  <p className="text-[11px] text-zinc-500">Fast home screen app</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 py-1 text-xs text-zinc-700 font-medium">
              <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                  <Share className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-zinc-900 block">Step 1: Open Share Menu</span>
                  In Safari or Chrome, tap the <strong>Share</strong> or <strong>Three Dots (⋮)</strong> icon.
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-zinc-900 block">Step 2: Add to Home screen</span>
                  Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong>.
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-zinc-900 block">Step 3: Instant Access</span>
                  Launch AtoViewer like a native application with offline support and no browser borders!
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Android APK & PWA Bundle Download Modal */}
      {activeModal === 'apk_bundle' && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl relative my-6 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-zinc-900">AtoPlay Booster App</h3>
                  <p className="text-[11px] text-zinc-500 font-medium">Install on Android • Full Screen</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Direct 1-Click Install Card */}
            <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-blue-700 tracking-wider">Direct 1-Click Install</span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-bold">Recommended</span>
              </div>
              <p className="text-xs text-zinc-700 leading-relaxed">
                App ko seedhe apne phone par install karein. Yeh bina kisi browser URL bar ke 100% full screen chalega!
              </p>
              
              {isInstallable ? (
                <button
                  onClick={async () => {
                    await install();
                    setActiveModal(null);
                  }}
                  className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-md shadow-blue-600/20 transition-all active:scale-98 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>1-Click Install Android App</span>
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-white border border-blue-200 text-xs text-blue-950 font-medium space-y-1">
                  <div className="font-bold flex items-center space-x-1.5 text-blue-800">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Chrome se Install karne ka Tarika:</span>
                  </div>
                  <p className="text-zinc-600 pl-5 leading-relaxed text-[11px]">
                    Chrome browser me upar daayein kone me <strong>Three Dots (⋮)</strong> dabayein aur <strong>"Install app"</strong> ya <strong>"Add to Home screen"</strong> par click karein.
                  </p>
                </div>
              )}
            </div>

            {/* Features List */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-emerald-800 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>App Features:</span>
              </div>
              <ul className="text-[11px] text-emerald-900 space-y-1.5 pl-5 list-disc leading-relaxed">
                <li><strong>No Browser URL Bar:</strong> 100% Full Screen native app interface.</li>
                <li><strong>Fast Performance:</strong> Home screen aur app drawer se instant open.</li>
                <li><strong>Real-time Coin Sync:</strong> Watch, earn aur boost seamlessly.</li>
              </ul>
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <button
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}


      {/* Submit Feedback Modal */}
      {activeModal === 'feedback' && (
        <SubmitFeedbackModal
          isOpen={activeModal === 'feedback'}
          onClose={() => setActiveModal(null)}
          user={user}
        />
      )}

    </>
  );
};
