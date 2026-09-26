import React, { useState } from 'react';
import { X, MessageSquare, Send, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { User } from '../types';
import { saveSupportMessageToFirestore } from '../lib/firebase';
import { apiFetch } from '../lib/api';

interface SubmitFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export const SubmitFeedbackModal: React.FC<SubmitFeedbackModalProps> = ({
  isOpen,
  onClose,
  user
}) => {
  const [feedbackType, setFeedbackType] = useState<'bug' | 'suggestion' | 'general'>('suggestion');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setErrorMessage('Please enter your feedback or bug report message.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const subjectPrefix = feedbackType === 'bug' ? '🐛 Bug Report' : feedbackType === 'suggestion' ? '💡 Feature Suggestion' : '💬 General Feedback';
      const fullSubject = `${subjectPrefix} from ${user?.name || 'AtoPlay User'}`;
      const senderName = user?.name || 'AtoPlay User';
      const senderEmail = user?.email || 'user@atoplaybooster.app';

      // 1. Save directly to Firestore support_messages collection destined for krja462@gmail.com
      await saveSupportMessageToFirestore({
        userId: user?.id || 'anonymous',
        userName: senderName,
        userEmail: senderEmail,
        targetEmail: 'krja462@gmail.com',
        subject: fullSubject,
        message: message.trim()
      });

      // 2. Also send to backend API
      try {
        await apiFetch('/api/support/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user?.id || ''
          },
          body: JSON.stringify({
            name: senderName,
            email: senderEmail,
            subject: fullSubject,
            message: message.trim()
          })
        });
      } catch (apiErr) {
        console.warn('Backend support API fallback warning:', apiErr);
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setMessage('');
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl relative border border-blue-200/80 text-left overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-zinc-900 tracking-tight">Submit Feedback</h3>
              <p className="text-xs text-zinc-500 font-medium">Send suggestions or report bugs to Admin (krja462@gmail.com)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-black text-zinc-900">Feedback Sent Successfully!</h4>
            <p className="text-xs text-zinc-600 max-w-xs mx-auto">
              Thank you! Your feedback has been sent directly to the admin via Firestore. We appreciate your help in improving AtoPlay Booster.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Type Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Feedback Type</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFeedbackType('suggestion')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    feedbackType === 'suggestion'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  💡 Suggestion
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackType('bug')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    feedbackType === 'bug'
                      ? 'bg-red-600 border-red-600 text-white shadow-md'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  🐛 Bug Report
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackType('general')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    feedbackType === 'general'
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  💬 General
                </button>
              </div>
            </div>

            {/* Message Textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">Your Message / Suggestion / Bug Details</label>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your suggestion or bug report in detail..."
                className="w-full p-3 rounded-2xl border border-zinc-300 text-xs font-medium text-zinc-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                required
              />
            </div>

            {/* User Info Info-box */}
            <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-600 space-y-1">
              <div className="font-bold text-zinc-800">Sender Info:</div>
              <div>Name: <span className="font-semibold text-zinc-900">{user?.name || 'Guest'}</span></div>
              <div>Email: <span className="font-semibold text-zinc-900">{user?.email || 'N/A'}</span></div>
              <div>Recipient: <span className="font-semibold text-blue-600">krja462@gmail.com (Admin)</span></div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-70 flex items-center justify-center space-x-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending to Admin...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Feedback</span>
                  </>
                )}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
