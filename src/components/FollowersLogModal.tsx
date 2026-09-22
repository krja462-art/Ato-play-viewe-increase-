import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Coins, 
  Search, 
  ExternalLink,
  RefreshCw,
  Info
} from 'lucide-react';
import { Campaign, FollowLog, format4CharId, User } from '../types';
import { apiFetch } from '../lib/api';
import { getFollowLogsFromFirestore, reportFakeFollowInFirestore } from '../lib/firebase';
import { AtoPlayBadge } from './AtoPlayBadge';

interface FollowersLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign;
  user: User;
}

export const FollowersLogModal: React.FC<FollowersLogModalProps> = ({
  isOpen,
  onClose,
  campaign,
  user
}) => {
  const [logs, setLogs] = useState<FollowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setFeedbackMsg(null);

      // 1. Try server API
      let fetchedLogs: FollowLog[] = [];
      try {
        const res = await apiFetch(`/api/campaigns/${campaign.id}/follow-logs`, {
          headers: { 'x-user-id': user.id }
        });
        if (res?.success && Array.isArray(res.logs)) {
          fetchedLogs = res.logs;
        }
      } catch (err) {
        console.warn('Server follow-logs error:', err);
      }

      // 2. Also query Cloud Firestore
      try {
        const firestoreLogs = await getFollowLogsFromFirestore(campaign.id);
        if (firestoreLogs.length > 0) {
          // Merge unique by log ID
          const existingIds = new Set(fetchedLogs.map(l => l.id));
          for (const fl of firestoreLogs) {
            if (!existingIds.has(fl.id)) {
              fetchedLogs.push(fl);
            }
          }
        }
      } catch (err) {
        console.warn('Firestore follow-logs error:', err);
      }

      // Sort newest first
      fetchedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(fetchedLogs);
    } catch (e: any) {
      console.error('Failed to load follow logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, campaign.id]);

  if (!isOpen) return null;

  const handleReportFake = async (log: FollowLog) => {
    if (log.status === 'reported') return;

    const confirmMsg = `Are you sure you want to report @${log.followerUsername} for fake follow?
    
If confirmed:
• This user will be flagged with a strike.
• 30 coins will be deducted from their wallet.
• After 3 confirmed fake reports, their account is permanently restricted from follow bonuses.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setReportingId(log.id);
      setFeedbackMsg(null);

      // 1. Call API
      let apiSuccess = false;
      try {
        const res = await apiFetch('/api/follow/report-fake', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user.id
          },
          body: JSON.stringify({ logId: log.id })
        });
        if (res?.success) {
          apiSuccess = true;
          setFeedbackMsg({
            type: 'success',
            text: res.message || `@${log.followerUsername} has been reported. 30 coins deducted.`
          });
        }
      } catch (err) {
        console.warn('API report fake error:', err);
      }

      // 2. Persist to Firestore
      try {
        const reportRes = await reportFakeFollowInFirestore(log.id, log.followerUserId);
        if (!apiSuccess) {
          setFeedbackMsg({
            type: 'success',
            text: `@${log.followerUsername} reported in database. Warning added.`
          });
        }
      } catch (fErr) {
        console.warn('Firestore report error:', fErr);
      }

      // 3. Update local state
      setLogs(prev => prev.map(l => {
        if (l.id === log.id) {
          return { ...l, status: 'reported', reportedAt: new Date().toISOString() };
        }
        return l;
      }));

    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Failed to submit report. Please try again.'
      });
    } finally {
      setReportingId(null);
    }
  };

  const filteredLogs = logs.filter(l => 
    l.followerUsername.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeClaimsCount = logs.filter(l => l.status === 'active').length;
  const reportedClaimsCount = logs.filter(l => l.status === 'reported').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 space-y-5 shadow-2xl relative my-8 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h2 className="text-base sm:text-lg font-extrabold text-zinc-900">Followers Log & Verification</h2>
                <AtoPlayBadge size="sm" />
              </div>
              <p className="text-xs text-zinc-500 truncate max-w-xs sm:max-w-md">
                Campaign: <span className="font-semibold text-zinc-700">"{campaign.title}"</span> (ID: {format4CharId(campaign.displayId, campaign.id)})
              </p>
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

        {/* Stats summary row */}
        <div className="grid grid-cols-3 gap-3 shrink-0">
          <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-center">
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Total Claims</p>
            <p className="text-lg font-extrabold text-zinc-900 mt-0.5">{logs.length}</p>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Active Verified</p>
            <p className="text-lg font-extrabold text-emerald-800 mt-0.5">{activeClaimsCount}</p>
          </div>
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-center">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Reported Fake</p>
            <p className="text-lg font-extrabold text-amber-800 mt-0.5">{reportedClaimsCount}</p>
          </div>
        </div>

        {/* Informational anti-fraud notice */}
        <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex items-start space-x-2 shrink-0">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-blue-800 leading-relaxed text-[11px]">
            Check your AtoPlay channel subscriber list. If any user below claimed 30 bonus coins without actually following your channel, tap <strong>Report Fake Follow</strong>. They will be penalized 30 coins and restricted after 3 strikes.
          </p>
        </div>

        {/* Feedback message */}
        {feedbackMsg && (
          <div className={`p-3 rounded-xl text-xs font-bold flex items-center space-x-2 shrink-0 ${
            feedbackMsg.type === 'success' 
              ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' 
              : 'bg-red-50 border border-red-300 text-red-800'
          }`}>
            {feedbackMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Search and Refresh bar */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by AtoPlay username..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-zinc-800"
            />
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-600 cursor-pointer disabled:opacity-50 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Follow Logs List / Table */}
        <div className="flex-1 overflow-y-auto min-h-[220px] rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
          {loading ? (
            <div className="text-center py-14 space-y-2">
              <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-zinc-400">Loading follower verification logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-14 space-y-2">
              <Users className="w-10 h-10 text-zinc-300 mx-auto" />
              <p className="text-xs font-bold text-zinc-600">
                {logs.length === 0 ? "No follow rewards claimed for this campaign yet." : "No matching usernames found."}
              </p>
              <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
                When users watch your video and follow your channel, their AtoPlay handles will appear here for verification.
              </p>
            </div>
          ) : (
            filteredLogs.map(item => {
              const formattedDate = new Date(item.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              const isReported = item.status === 'reported';

              return (
                <div key={item.id} className={`p-3.5 flex items-center justify-between space-x-3 transition-colors ${isReported ? 'bg-amber-50/50' : 'hover:bg-zinc-50'}`}>
                  
                  {/* Left: Username + Date */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-xs sm:text-sm text-zinc-900 truncate">
                        @{item.followerUsername}
                      </span>
                      {isReported ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] inline-flex items-center space-x-1 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>Reported Fake ⚠️</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] inline-flex items-center space-x-1 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Claimed (+30 Coins) ✓</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-[11px] text-zinc-400">
                      <Clock className="w-3 h-3" />
                      <span>{formattedDate}</span>
                      {item.reportedAt && (
                        <>
                          <span>•</span>
                          <span className="text-amber-700 font-medium">
                            Reported: {new Date(item.reportedAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="shrink-0 flex items-center space-x-2">
                    {isReported ? (
                      <span className="text-[11px] font-bold text-amber-700 italic px-2.5 py-1">
                        Reported ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => handleReportFake(item)}
                        disabled={reportingId === item.id}
                        className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition-colors disabled:opacity-50"
                        title="Report if this user did not actually follow your channel on AtoPlay"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                        <span>{reportingId === item.id ? 'Reporting...' : 'Report Fake Follow'}</span>
                      </button>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
          <span>AtoPlay Follower Whitelist & Verification Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
