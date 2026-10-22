import React from 'react';
import { ShieldAlert, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';

export interface UserWarningNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  notice: string;
  channelUrl: string;
  channelTitle?: string;
  timestamp: string;
  read: boolean;
}

interface FollowReportWarningModalProps {
  notification: UserWarningNotification | null;
  onDismiss: (notificationId: string) => void;
}

export const FollowReportWarningModal: React.FC<FollowReportWarningModalProps> = ({
  notification,
  onDismiss
}) => {
  if (!notification) return null;

  const targetUrl = notification.channelUrl || 'https://atoplay.com';
  const channelName = notification.channelTitle || 'AtoPlay Creator Channel';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl relative border-2 border-red-500 text-left overflow-hidden">
        
        {/* Top Warning Glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-to-b from-red-500/20 via-orange-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

        {/* Header with Alert Shield */}
        <div className="flex items-center space-x-3 pb-2 border-b border-red-100">
          <div className="w-12 h-12 rounded-2xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center shrink-0 shadow-inner">
            <ShieldAlert className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider mb-0.5">
              <AlertTriangle className="w-3 h-3 text-red-600" />
              <span>Warning Strike Added</span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight leading-snug">
              Channel Follow Violation Notice
            </h3>
          </div>
        </div>

        {/* Message description */}
        <div className="space-y-3 text-xs sm:text-sm text-zinc-700 leading-relaxed">
          <p>
            The creator of <strong className="text-zinc-900 font-bold">&ldquo;{channelName}&rdquo;</strong> reported that you did not subscribe or you unsubscribed from their channel after claiming promotional coins.
          </p>

          {/* Strict Notice Box in English */}
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-1.5 shadow-2xs">
            <div className="flex items-center space-x-1.5 font-black text-red-800 uppercase tracking-wide text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
              <span>Mandatory Policy Warning</span>
            </div>
            <p className="leading-relaxed font-medium">
              Please subscribe to the channel properly using the link below. <strong>Notice: If you do not follow the channel or continue submitting fake follows, your account will be permanently blocked.</strong>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          {/* Direct AtoPlay Channel Link */}
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 px-4 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-98 text-white font-black text-xs sm:text-sm shadow-md shadow-red-600/30 transition-all flex items-center justify-center space-x-2 text-center"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span>Open &amp; Follow Channel on AtoPlay</span>
          </a>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={() => onDismiss(notification.id)}
            className="w-full py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 active:scale-98 text-zinc-800 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>I Have Followed the Channel (Acknowledge)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
