import React, { useState, useEffect } from 'react';
import { Coins, CheckCircle2, Award, Sparkles, X, Play, Loader2, ExternalLink, AlertCircle, UserPlus, UserCheck } from 'lucide-react';
import { Campaign, User, format4CharId, FollowLog } from '../types';
import { playCoinCelebrationSound } from '../utils/audio';
import { apiFetch } from '../lib/api';
import { saveUserCoinsToFirestore, saveFollowLogToFirestore, updateCampaignFollowersInFirestore } from '../lib/firebase';
import confetti from 'canvas-confetti';

interface FollowerRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  user: User;
  countBefore?: number;
  countAfter?: number;
  onCoinEarned: (updatedUser: User) => void;
  onFollowSuccess?: (campaignId: string, earnedCoins: number, updatedUser: User) => void;
}

export const FollowerRewardModal: React.FC<FollowerRewardModalProps> = ({
  isOpen,
  onClose,
  campaign,
  user,
  countBefore,
  countAfter,
  onCoinEarned,
  onFollowSuccess
}) => {
  const [isClaimed, setIsClaimed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(null);
  
  const savedInitial = campaign?.initialFollowers ?? campaign?.channelFollowers ?? countBefore ?? 0;
  const [followersBefore, setFollowersBefore] = useState<number>(savedInitial);
  const [followersAfter, setFollowersAfter] = useState<number | undefined>(countAfter);

  useEffect(() => {
    if (isOpen && campaign) {
      setIsClaimed(false);
      const initCount = campaign.initialFollowers ?? campaign.channelFollowers ?? countBefore ?? 0;
      setFollowersBefore(initCount);
      setFollowersAfter(countAfter);
      setFeedbackMessage(null);
      setFeedbackType(null);

      // Auto-trigger verification with AtoPlay API when modal opens after 4-second visit
      handleVerifyFollow(false, initCount);
    }
  }, [isOpen, campaign?.id]);

  if (!isOpen || !campaign) return null;

  const shortId = format4CharId(campaign.displayId, campaign.id);
  const channelUrl = campaign.videoUrl || 'https://atoplay.com';

  const handleVerifyFollow = async (simulateBump = false, overrideInitial?: number) => {
    if (verifying || isClaimed) return;
    setVerifying(true);
    setFeedbackMessage(null);
    setFeedbackType(null);

    const baseline = overrideInitial ?? followersBefore;

    try {
      const res = await apiFetch('/api/follow/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          countBefore: baseline,
          videoUrl: campaign.videoUrl,
          channelName: campaign.channelName || campaign.userName,
          followerUsername: user.atoPlayUsername,
          simulateBump
        })
      });

      if (res?.verified || res?.success) {
        const bonus = res.earnedCoins || 30;
        const newCoins = (user.coins || 0) + bonus;
        setIsClaimed(true);
        const resolvedAfter = typeof res.countAfter === 'number' ? res.countAfter : (baseline + 1);
        setFollowersAfter(resolvedAfter);
        setFeedbackType('success');
        setFeedbackMessage(res.message || `Follow verified! Creator ke followers badhkar ${resolvedAfter} ho gaye (+1 Follower). +30 Coins aapke wallet mein auto-credit ho gaye hain!`);

        playCoinCelebrationSound();
        try { confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); } catch {}

        const updatedUser: User = res.user || { ...user, coins: newCoins };
        onCoinEarned(updatedUser);
        saveUserCoinsToFirestore(updatedUser.id, updatedUser.coins, updatedUser.email).catch(() => {});

        // Save Follow Log to Cloud Firestore
        const logToSave: FollowLog = res.followLog || {
          id: `flog_${Date.now()}_${user.id.slice(-4)}`,
          campaignId: campaign.id,
          creatorId: campaign.userId,
          followerUserId: user.id,
          followerUsername: user.atoPlayUsername || user.name,
          followerEmail: user.email,
          followerAvatar: user.avatar,
          followerName: user.name,
          timestamp: new Date().toISOString(),
          status: 'active',
          campaignTitle: campaign.title
        };
        saveFollowLogToFirestore(logToSave).catch(() => {});

        // Update campaign in Firestore: add user to followed list & completed list so it never appears again
        updateCampaignFollowersInFirestore(campaign.id, user.id, resolvedAfter).catch(() => {});

        // Callback to parent to remove campaign from feed permanently
        if (onFollowSuccess) {
          onFollowSuccess(campaign.id, bonus, updatedUser);
        }
      } else {
        setFeedbackType('error');
        const afterCount = typeof res?.countAfter === 'number' ? res.countAfter : baseline;
        setFollowersAfter(afterCount);
        setFeedbackMessage(
          res?.message || 
          `AtoPlay API check: Follower nahi badha! (Pehle: ${baseline}, Abhi: ${afterCount}). Kripya AtoPlay par creator channel ko 'Follow' karein aur phir 'Verify Follow' par click karein.`
        );
      }
    } catch (err: any) {
      setFeedbackType('error');
      setFeedbackMessage(err?.message || 'Verification error. Please check your internet connection and try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl relative border border-emerald-200 text-center overflow-hidden">
        
        {/* Top Glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-to-b from-emerald-300/40 via-teal-200/20 to-transparent rounded-full blur-2xl pointer-events-none" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-400/25 animate-ping" />
          <div className="relative w-18 h-18 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <UserCheck className="w-9 h-9 drop-shadow-sm" />
          </div>
          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-amber-500 text-white shadow-md">
            <Coins className="w-4 h-4" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>AtoPlay Follower Reward</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            {isClaimed ? "+30 Coins Added!" : "AtoPlay Follower Verification"}
          </h2>

          <div className={`p-3 rounded-2xl text-xs sm:text-sm font-semibold border ${
            isClaimed 
              ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            {isClaimed 
              ? "Awesome! Follower verified via AtoPlay API. +30 Coins credited to your wallet!"
              : "AtoPlay API se live check ho raha hai: Kya channel par follower badha...?"
            }
          </div>
        </div>

        {/* Pehle ke followers vs Abhi ke followers Box */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/70 to-teal-50/70 border border-emerald-200 space-y-3 text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-zinc-700 uppercase tracking-wider">
              AtoPlay Live Follower Comparison
            </span>
            <span className="text-xs font-black text-emerald-700">
              {isClaimed ? "+1 Follower Verified ✓" : (verifying ? "Checking..." : "Pending")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Box 1: Pehle ke followers */}
            <div className="p-3 rounded-xl bg-white border border-emerald-200 text-center shadow-2xs">
              <span className="text-[10px] text-zinc-500 block uppercase font-black tracking-wider">
                Pehle ke followers
              </span>
              <div className="text-xl sm:text-2xl font-black text-zinc-900 mt-1">
                {followersBefore}
              </div>
              <span className="text-[10px] text-zinc-400 font-medium">Saved Real Count</span>
            </div>

            {/* Box 2: Abhi ke followers */}
            <div className={`p-3 rounded-xl border text-center shadow-2xs transition-all ${
              isClaimed 
                ? 'bg-emerald-100/80 border-emerald-300' 
                : 'bg-white border-emerald-200'
            }`}>
              <span className="text-[10px] text-emerald-900 block uppercase font-black tracking-wider">
                Abhi ke followers
              </span>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
                {verifying ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-emerald-600 my-1" />
                ) : (
                  <span>
                    {typeof followersAfter === 'number' ? followersAfter : followersBefore}
                    {isClaimed ? ' 🎉' : ''}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-bold ${isClaimed ? 'text-emerald-700' : 'text-zinc-400'}`}>
                {isClaimed ? '+1 Badha!' : 'Live API Count'}
              </span>
            </div>
          </div>

          {/* If not claimed yet, show action buttons */}
          {!isClaimed && (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleVerifyFollow(false)}
                disabled={verifying}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs sm:text-sm shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-60 transition-transform active:scale-98"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AtoPlay API se Check Ho Raha Hai...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify Follow (+30 Coins)</span>
                  </>
                )}
              </button>

              {channelUrl && (
                <a
                  href={channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs flex items-center justify-center space-x-1 transition-colors"
                >
                  <span>Open AtoPlay Channel to Follow</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {feedbackMessage && (
            <div className={`p-3 rounded-xl text-xs font-bold leading-relaxed ${
              feedbackType === 'success' 
                ? 'bg-emerald-100/90 text-emerald-900 border border-emerald-300' 
                : 'bg-rose-100 text-rose-900 border border-rose-300'
            }`}>
              {feedbackMessage}
            </div>
          )}
        </div>

        <div className="pt-1">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-black text-sm shadow-md transition-all cursor-pointer"
          >
            {isClaimed ? "Done & Close" : "Close"}
          </button>
        </div>

      </div>
    </div>
  );
};
