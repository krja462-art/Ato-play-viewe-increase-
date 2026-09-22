import React, { useState, useEffect } from 'react';
import { 
  Coins, 
  CheckCircle2, 
  Award, 
  Sparkles, 
  X, 
  ArrowRight, 
  Play, 
  Loader2, 
  ExternalLink, 
  AlertCircle, 
  UserPlus, 
  RefreshCw,
  UserCheck
} from 'lucide-react';
import { Campaign, User, format4CharId, FollowLog } from '../types';
import { playCoinCelebrationSound } from '../utils/audio';
import { apiFetch } from '../lib/api';
import { saveUserCoinsToFirestore, saveFollowLogToFirestore } from '../lib/firebase';
import confetti from 'canvas-confetti';
import { LinkAtoPlayModal } from './LinkAtoPlayModal';

interface RewardPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  earnedCoins: number;
  newBalance: number;
  campaign: Campaign | null;
  baseCoins?: number;
  bonusCoins?: number;
  followedBonus?: boolean;
  message?: string;
  countBefore?: number;
  countAfter?: number;
  onWatchNext?: () => void;
  onPromoteVideo?: () => void;
  user?: User | null;
  onCoinEarned?: (updatedUser: User) => void;
}

export const RewardPopupModal: React.FC<RewardPopupModalProps> = ({
  isOpen,
  onClose,
  earnedCoins,
  newBalance,
  campaign,
  baseCoins = 60,
  bonusCoins = 30,
  followedBonus = false,
  message,
  countBefore,
  countAfter,
  onWatchNext,
  onPromoteVideo,
  user,
  onCoinEarned
}) => {
  const initialHasBonus = followedBonus || (typeof countAfter === 'number' && typeof countBefore === 'number' && countAfter > countBefore) || earnedCoins >= 90;
  
  const [isClaimed, setIsClaimed] = useState<boolean>(initialHasBonus);
  const [totalEarned, setTotalEarned] = useState<number>(earnedCoins);
  const [currentWalletBalance, setCurrentWalletBalance] = useState<number>(newBalance);
  const [bonusAmount, setBonusAmount] = useState<number>(bonusCoins);
  const [followersBefore, setFollowersBefore] = useState<number | undefined>(countBefore);
  const [followersAfter, setFollowersAfter] = useState<number | undefined>(countAfter);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    if (isOpen) {
      const alreadyClaimed = followedBonus || (typeof countAfter === 'number' && typeof countBefore === 'number' && countAfter > countBefore) || earnedCoins >= 90;
      setIsClaimed(alreadyClaimed);
      setTotalEarned(earnedCoins);
      setCurrentWalletBalance(newBalance);
      setBonusAmount(bonusCoins);
      setFollowersBefore(countBefore);
      setFollowersAfter(countAfter);
      setFeedbackMessage(null);
      setFeedbackType(null);
      setVerifying(false);

      playCoinCelebrationSound();
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']
        });
      } catch {}
    }
  }, [isOpen, earnedCoins, newBalance, followedBonus, countBefore, countAfter, bonusCoins]);

  if (!isOpen) return null;

  const shortId = campaign ? format4CharId(campaign.displayId, campaign.id) : '----';

  const channelUrl = campaign?.channelId
    ? `https://atoplay.com/channel/${campaign.channelId}`
    : (campaign?.videoUrl?.includes('atoplay.com')
        ? campaign.videoUrl
        : (campaign?.channelName ? `https://atoplay.com/search?q=${encodeURIComponent(campaign.channelName)}` : 'https://atoplay.com'));

  // Live follow verification method
  const handleVerifyFollow = async (simulateBump = false) => {
    if (verifying || !campaign) return;

    if (user?.isFollowRestricted) {
      setFeedbackType('error');
      setFeedbackMessage('Your account is restricted from claiming follow bonuses due to confirmed fake follow reports.');
      return;
    }

    if (!user?.atoPlayUsername) {
      setIsLinkModalOpen(true);
      return;
    }

    setVerifying(true);
    setFeedbackMessage(null);
    setFeedbackType(null);

    try {
      const activeUserId = user?.id || '';
      const cId = campaign.id;
      const baseline = typeof followersBefore === 'number' 
        ? followersBefore 
        : (typeof countBefore === 'number' ? countBefore : (campaign.channelFollowers ?? 0));

      const res = await apiFetch('/api/follow/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': activeUserId
        },
        body: JSON.stringify({
          campaignId: cId,
          countBefore: baseline,
          videoUrl: campaign.videoUrl,
          channelName: campaign.channelName || campaign.userName,
          followerUsername: user.atoPlayUsername,
          simulateBump
        })
      });

      if (res?.verified || res?.success) {
        const bonus = res.earnedCoins || 30;
        const newTotal = baseCoins + bonus;
        const updatedCoins = res.newBalance ?? (currentWalletBalance + bonus);

        setIsClaimed(true);
        setTotalEarned(newTotal);
        setCurrentWalletBalance(updatedCoins);
        setBonusAmount(bonus);
        if (typeof res.countBefore === 'number') setFollowersBefore(res.countBefore);
        if (typeof res.countAfter === 'number') setFollowersAfter(res.countAfter);

        setFeedbackType('success');
        setFeedbackMessage(
          res.message || 
          `Follower Verified! Creator ke followers badhkar ${res.countAfter} ho gaye (+1 Follower). +30 Coins aapke wallet mein auto-credit ho gaye hain!`
        );

        // Save Follow Log to Cloud Firestore
        const logToSave: FollowLog = res.followLog || {
          id: `flog_${Date.now()}_${user.id.slice(-4)}`,
          campaignId: cId,
          creatorId: campaign.userId,
          followerUserId: user.id,
          followerUsername: user.atoPlayUsername,
          timestamp: new Date().toISOString(),
          status: 'active',
          campaignTitle: campaign.title
        };
        saveFollowLogToFirestore(logToSave).catch(err => console.warn('Follow log firestore err:', err));

        playCoinCelebrationSound();
        try {
          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899']
          });
        } catch {}

        if (res.user) {
          if (onCoinEarned) onCoinEarned(res.user);
          saveUserCoinsToFirestore(res.user.id, res.user.coins, res.user.email).catch(() => {});
        } else if (user) {
          const updatedUser: User = { ...user, coins: updatedCoins };
          if (onCoinEarned) onCoinEarned(updatedUser);
          saveUserCoinsToFirestore(updatedUser.id, updatedCoins, updatedUser.email).catch(() => {});
        }
      } else {
        setFeedbackType('error');
        if (typeof res?.countBefore === 'number') setFollowersBefore(res.countBefore);
        if (typeof res?.countAfter === 'number') setFollowersAfter(res.countAfter);
        setFeedbackMessage(
          res?.message || 
          `AtoPlay API check: Follower nahi badha! (Pehle: ${res?.countBefore ?? baseline}, Abhi: ${res?.countAfter ?? baseline}). Kripya AtoPlay par creator channel ko 'Follow' karein aur phir 'Verify Follow' par click karein.`
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
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl relative border border-amber-200/80 text-center overflow-hidden">
        
        {/* Decorative Festive Top Glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-to-b from-amber-300/40 via-yellow-200/30 to-transparent rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebratory Icon & Badge */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-amber-400/25 animate-ping" />
          <div className="relative w-18 h-18 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Coins className="w-9 h-9 drop-shadow-sm animate-bounce" />
          </div>
          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-md">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Header Text & Status Message */}
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>{isClaimed ? "Watch + Follow Completed!" : "60s Watch Completed!"}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            {isClaimed ? "Awesome! +90 Coins Added" : "Coins Successfully Added!"}
          </h2>

          <div className={`p-3 rounded-2xl text-xs sm:text-sm font-semibold border ${
            isClaimed 
              ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            {isClaimed 
              ? "Awesome! You earned 60 coins for watching + 30 coins follow bonus! Total: 90 Coins"
              : (message || "You earned 60 coins for watching! Follow the channel & tap Verify below to claim +30 bonus coins!")
            }
          </div>
        </div>

        {/* Big Reward Breakdown Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/70 via-yellow-50/70 to-orange-50/70 border border-amber-200/90 shadow-inner space-y-3">
          
          {/* Main Total Number */}
          <div className="flex items-center justify-center space-x-2">
            <span className="text-3xl sm:text-4xl font-black text-amber-600">
              +{totalEarned}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-amber-800 uppercase tracking-wide">
              Coins Total
            </span>
          </div>

          {/* Reward Breakdown Details */}
          <div className="grid grid-cols-2 gap-2 text-left pt-1">
            {/* Left Card: Base Watch */}
            <div className="p-2.5 rounded-xl bg-white border border-amber-200/70 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="text-[11px] text-zinc-500 font-bold uppercase">Base Watch (60s)</div>
                <div className="text-sm font-black text-emerald-600 flex items-center space-x-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>+{baseCoins} Coins</span>
                </div>
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-1">
                Completed & Credited
              </div>
            </div>

            {/* Right Card: Follow Bonus with Verify Button */}
            <div className={`p-2.5 rounded-xl border shadow-2xs flex flex-col justify-between transition-all ${
              isClaimed 
                ? "bg-emerald-50/90 border-emerald-300" 
                : "bg-gradient-to-br from-amber-50 to-orange-50/60 border-amber-300 ring-1 ring-amber-200/60"
            }`}>
              <div>
                <div className="flex items-center justify-between">
                  <div className={`text-[11px] font-bold uppercase ${isClaimed ? "text-emerald-800" : "text-amber-900"}`}>
                    Follow Bonus
                  </div>
                  {isClaimed ? (
                    <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-black flex items-center space-x-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>Claimed</span>
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-black">
                      +30 Coins
                    </span>
                  )}
                </div>

                <div className="mt-1">
                  {isClaimed ? (
                    <div className="text-sm font-black text-emerald-600 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>+{bonusAmount} Coins</span>
                    </div>
                  ) : user?.isFollowRestricted ? (
                    <div className="mt-1 p-1.5 rounded-lg bg-red-100 border border-red-200 text-[10px] text-red-800 font-bold leading-tight">
                      Restricted: Follow bonuses disabled due to 3 fake reports.
                    </div>
                  ) : !user?.atoPlayUsername ? (
                    <div className="space-y-1.5 mt-1">
                      <div className="text-[10px] text-amber-800 font-semibold leading-tight">
                        Link your AtoPlay handle first:
                      </div>
                      <button
                        id="link-atoplay-username-reward-btn"
                        type="button"
                        onClick={() => setIsLinkModalOpen(true)}
                        className="w-full py-1.5 px-2 rounded-lg bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-extrabold text-[11px] shadow-sm flex items-center justify-center space-x-1 transition-all cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Link AtoPlay Username</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-amber-700 flex items-center justify-between">
                        <span className="flex items-center space-x-1">
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Pending Follow</span>
                        </span>
                        <span className="font-mono text-[10px] text-amber-900 truncate max-w-[120px]">
                          @{user.atoPlayUsername}
                        </span>
                      </div>
                      {/* User's requested Verify button */}
                      <button
                        id="verify-follow-button-modal"
                        type="button"
                        onClick={() => handleVerifyFollow(false)}
                        disabled={verifying}
                        className="w-full py-1.5 px-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white font-extrabold text-[11px] shadow-sm flex items-center justify-center space-x-1 transition-all cursor-pointer disabled:opacity-60"
                        title="Check AtoPlay follower count via API"
                      >
                        {verifying ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span>Checking API...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>Verify Follow (+30)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isClaimed && (
                <div className="text-[10px] text-emerald-700 font-semibold mt-1">
                  +1 Follower Verified ✓
                </div>
              )}
            </div>
          </div>

          {/* Quick Helper: Open Channel link + Instructions */}
          {!isClaimed && (
            <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-left space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-900 flex items-center space-x-1">
                  <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Channel Follow Bonus (+30 Coins):</span>
                </span>
                {channelUrl && (
                  <a
                    href={channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-extrabold text-blue-700 hover:text-blue-900 underline flex items-center space-x-0.5 text-[11px] cursor-pointer"
                  >
                    <span>Open Channel</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="text-[10px] text-zinc-600">
                AtoPlay par creator channel ko follow karein, phir upar <strong>"Verify Follow (+30)"</strong> button tap karein. API se follower check hoga aur +30 coins auto credit ho jayenge!
              </div>
              {typeof followersBefore === 'number' && (
                <div className="text-[10px] text-zinc-500 font-medium">
                  Current Followers: <span className="font-bold text-zinc-800">{followersBefore}</span> → Need: <span className="font-bold text-emerald-700">{followersBefore + 1}+</span>
                </div>
              )}
            </div>
          )}

          {/* Feedback message banner if verification attempted */}
          {feedbackMessage && (
            <div className={`p-2.5 rounded-xl text-xs font-semibold text-left border ${
              feedbackType === 'success' 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                : 'bg-rose-50 border-rose-300 text-rose-800'
            }`}>
              <div className="flex items-start space-x-2">
                {feedbackType === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1.5">
                  <div>{feedbackMessage}</div>
                  {feedbackType === 'error' && (
                    <div className="flex items-center space-x-2 pt-0.5">
                      {channelUrl && (
                        <a
                          href={channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-blue-700 font-bold underline flex items-center space-x-1"
                        >
                          <span>Open AtoPlay Channel</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleVerifyFollow(true)}
                        className="text-[10px] px-2 py-0.5 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-bold cursor-pointer"
                        title="Demo / Test follower increase verification"
                      >
                        Demo +1 Follower
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Channel Follower Status if available */}
          {typeof followersBefore === 'number' && typeof followersAfter === 'number' && (
            <div className="flex items-center justify-between text-[11px] px-2 text-zinc-500 bg-white/70 py-1.5 rounded-lg border border-amber-200/40">
              <span>Channel Followers Count:</span>
              <span className="font-bold text-zinc-700">
                {followersBefore} → {followersAfter} {followersAfter > followersBefore ? "✅ (+1 Followed)" : ""}
              </span>
            </div>
          )}

          <div className="h-px bg-amber-200/70 w-full" />

          {/* New Balance preview */}
          <div className="flex items-center justify-between text-xs sm:text-sm px-2">
            <span className="text-zinc-600 font-medium">New Wallet Balance:</span>
            <span className="font-extrabold text-zinc-900 flex items-center space-x-1">
              <Coins className="w-4 h-4 text-amber-500 inline" />
              <span>{currentWalletBalance.toLocaleString()} Coins</span>
            </span>
          </div>

          {/* Video detail */}
          {campaign && (
            <div className="pt-1 flex items-center justify-between text-xs px-2 text-zinc-500 border-t border-amber-200/50">
              <span className="truncate max-w-[200px] text-left font-medium text-zinc-700">
                {campaign.title}
              </span>
              <span className="font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-zinc-200 text-zinc-800 shrink-0 ml-2">
                #{shortId}
              </span>
            </div>
          )}
        </div>

        {/* Server verification badge */}
        <div className="flex items-center justify-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 py-2 px-3 rounded-xl">
          <Award className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Server Verified: 60s Watch Duration & Reward Checked</span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={() => {
              onClose();
              if (onWatchNext) onWatchNext();
            }}
            className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all hover:scale-101 cursor-pointer flex items-center justify-center space-x-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Watch Next Video (90 Coins)</span>
          </button>

          {onPromoteVideo && (
            <button
              onClick={() => {
                onClose();
                onPromoteVideo();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <span>Promote My Video With Coins</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>

      {/* Link AtoPlay Username Modal */}
      {user && isLinkModalOpen && (
        <LinkAtoPlayModal
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          user={user}
          onSuccess={(updated) => {
            if (onCoinEarned) onCoinEarned(updated);
          }}
        />
      )}
    </div>
  );
};
