import React, { useState, useEffect } from 'react';
import { Coins, CheckCircle2, Award, Sparkles, X, Play, Loader2, ExternalLink, AlertCircle, UserPlus, UserCheck } from 'lucide-react';
import { Campaign, User, format4CharId, FollowLog } from '../types';
import { playCoinCelebrationSound } from '../utils/audio';
import { apiFetch } from '../lib/api';
import { saveUserCoinsToFirestore, saveFollowLogToFirestore } from '../lib/firebase';
import confetti from 'canvas-confetti';

interface FollowerRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  user: User;
  countBefore?: number;
  countAfter?: number;
  onCoinEarned: (updatedUser: User) => void;
}

export const FollowerRewardModal: React.FC<FollowerRewardModalProps> = ({
  isOpen,
  onClose,
  campaign,
  user,
  countBefore,
  countAfter,
  onCoinEarned
}) => {
  const [isClaimed, setIsClaimed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(null);
  const [followersBefore, setFollowersBefore] = useState<number | undefined>(countBefore);
  const [followersAfter, setFollowersAfter] = useState<number | undefined>(countAfter);

  useEffect(() => {
    if (isOpen) {
      setIsClaimed(false);
      setFollowersBefore(countBefore ?? campaign?.initialFollowers ?? 120);
      setFollowersAfter(countAfter);
      setFeedbackMessage(null);
      setFeedbackType(null);

      playCoinCelebrationSound();
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']
        });
      } catch {}
    }
  }, [isOpen, countBefore, countAfter, campaign]);

  if (!isOpen || !campaign) return null;

  const shortId = format4CharId(campaign.displayId, campaign.id);
  const channelUrl = campaign.videoUrl || 'https://atoplay.com';

  const handleVerifyFollow = async (simulateBump = false) => {
    if (verifying) return;
    setVerifying(true);
    setFeedbackMessage(null);
    setFeedbackType(null);

    try {
      const res = await apiFetch('/api/follow/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          countBefore: followersBefore ?? 120,
          videoUrl: campaign.videoUrl,
          channelName: campaign.channelName || campaign.userName,
          followerUsername: user.atoPlayUsername,
          simulateBump
        })
      });

      if (res?.verified || res?.success) {
        const bonus = 30;
        const newCoins = (user.coins || 0) + bonus;
        setIsClaimed(true);
        if (typeof res.countAfter === 'number') setFollowersAfter(res.countAfter);
        setFeedbackType('success');
        setFeedbackMessage(res.message || 'Follow verified! +30 Coins added to your wallet.');

        playCoinCelebrationSound();
        try { confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); } catch {}

        const updatedUser: User = res.user || { ...user, coins: newCoins };
        onCoinEarned(updatedUser);
        saveUserCoinsToFirestore(updatedUser.id, updatedUser.coins, updatedUser.email).catch(() => {});

        const logToSave: FollowLog = res.followLog || {
          id: `flog_${Date.now()}_${user.id.slice(-4)}`,
          campaignId: campaign.id,
          creatorId: campaign.userId,
          followerUserId: user.id,
          followerUsername: user.atoPlayUsername || user.name,
          timestamp: new Date().toISOString(),
          status: 'active',
          campaignTitle: campaign.title
        };
        saveFollowLogToFirestore(logToSave).catch(() => {});
      } else {
        setFeedbackType('error');
        if (typeof res?.countAfter === 'number') setFollowersAfter(res.countAfter);
        setFeedbackMessage(res?.message || 'Follower count did not increase yet. Please follow the channel on AtoPlay and verify again.');
      }
    } catch (err: any) {
      setFeedbackType('error');
      setFeedbackMessage(err?.message || 'Verification error. Please try again.');
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
            <span>Follower Campaign Reward</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            {isClaimed ? "+30 Coins Added!" : "Verify Channel Follow"}
          </h2>

          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold">
            {isClaimed 
              ? "Awesome! Follower verified successfully. +30 Coins credited to your wallet!"
              : "Aapne channel visit kar liya hai! Niche 'Verify Follow (+30 Coins)' par click karein."
            }
          </div>
        </div>

        {/* Follower Stats Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/70 to-teal-50/70 border border-emerald-200 space-y-3 text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-700 uppercase">Real Follower Check</span>
            <span className="text-xs font-black text-emerald-700">
              {isClaimed ? "+1 Follower Verified ✓" : "Pending Verification"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-white border border-emerald-200 text-center">
              <span className="text-[10px] text-zinc-500 block uppercase font-bold">Pehle Followers</span>
              <span className="text-base font-black text-zinc-800">{followersBefore ?? 120}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-100/70 border border-emerald-300 text-center">
              <span className="text-[10px] text-emerald-800 block uppercase font-bold">Abhi Followers</span>
              <span className="text-base font-black text-emerald-900">
                {typeof followersAfter === 'number' ? followersAfter : (isClaimed ? (followersBefore ?? 120) + 1 : (followersBefore ?? 120))}
              </span>
            </div>
          </div>

          {!isClaimed && (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleVerifyFollow(false)}
                disabled={verifying}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying with AtoPlay API...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify Follow (+30 Coins)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {feedbackMessage && (
            <div className={`p-2.5 rounded-xl text-xs font-bold ${
              feedbackType === 'success' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
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
            {isClaimed ? "Continue & Close" : "Close"}
          </button>
        </div>

      </div>
    </div>
  );
};
