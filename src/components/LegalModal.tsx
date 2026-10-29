import React, { useState } from 'react';
import { ShieldCheck, FileText, AlertTriangle, Mail, X, CheckCircle2, ChevronRight, ArrowLeft } from 'lucide-react';

export type LegalTabType = 'privacy' | 'terms' | 'disclaimer' | 'contact' | 'delete_account';

interface LegalModalProps {
  isOpen: boolean;
  initialTab?: LegalTabType;
  onClose: () => void;
  standalone?: boolean;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  initialTab = 'privacy',
  onClose,
  standalone = false
}) => {
  const [activeTab, setActiveTab] = useState<LegalTabType>(initialTab);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);

  if (!isOpen) return null;

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail.trim() || !contactMessage.trim()) return;
    setContactSent(true);
  };

  const content = (
    <div className={`bg-white ${standalone ? 'min-h-screen w-full max-w-4xl mx-auto p-4 sm:p-8' : 'rounded-3xl max-w-2xl w-full p-6 sm:p-8 my-8 max-h-[90vh] shadow-2xl relative border border-zinc-200 overflow-y-auto'}`}>
      
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-200 sticky top-0 bg-white/95 backdrop-blur-md z-10">
        <div className="flex items-center space-x-3">
          {standalone ? (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer flex items-center space-x-1 text-xs font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </button>
          ) : (
            <div className="p-2.5 rounded-2xl bg-blue-100 text-blue-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
          )}
          <div>
            <h2 className="font-extrabold text-lg sm:text-xl text-zinc-900">
              {activeTab === 'privacy' && 'Privacy Policy'}
              {activeTab === 'terms' && 'Terms of Service'}
              {activeTab === 'disclaimer' && 'Platform Disclaimer'}
              {activeTab === 'contact' && 'Contact & Developer Support'}
              {activeTab === 'delete_account' && 'Account & Data Deletion'}
            </h2>
            <p className="text-xs text-zinc-500 font-medium">AtoPlay Booster • Independent Community Platform</p>
          </div>
        </div>
        {!standalone && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center space-x-2 py-3 overflow-x-auto no-scrollbar border-b border-zinc-100 text-xs font-bold">
        <button
          onClick={() => { setActiveTab('privacy'); setContactSent(false); }}
          className={`px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${activeTab === 'privacy' ? 'bg-blue-600 text-white shadow-xs' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
        >
          Privacy Policy
        </button>
        <button
          onClick={() => { setActiveTab('terms'); setContactSent(false); }}
          className={`px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${activeTab === 'terms' ? 'bg-blue-600 text-white shadow-xs' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
        >
          Terms of Service
        </button>
        <button
          onClick={() => { setActiveTab('disclaimer'); setContactSent(false); }}
          className={`px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${activeTab === 'disclaimer' ? 'bg-amber-600 text-white shadow-xs' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
        >
          Disclaimer
        </button>
        <button
          onClick={() => { setActiveTab('contact'); setContactSent(false); }}
          className={`px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${activeTab === 'contact' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
        >
          Contact &amp; Help
        </button>
        <button
          onClick={() => { setActiveTab('delete_account'); setContactSent(false); }}
          className={`px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${activeTab === 'delete_account' ? 'bg-rose-600 text-white shadow-xs' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
        >
          Delete Account
        </button>
      </div>

      {/* Tab Body */}
      <div className="py-4 space-y-4 text-xs sm:text-sm text-zinc-700 leading-relaxed">
        
        {/* 1. PRIVACY POLICY */}
        {activeTab === 'privacy' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900">
              <p className="font-extrabold text-sm">Privacy Overview (Last Updated: October 2026)</p>
              <p className="text-xs pt-1 text-blue-800">
                AtoPlay Booster is committed to protecting your privacy. We collect minimal information strictly necessary to provide the creator community showcase and AI Video Growth Studio, and never sell your personal data.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">1. Information We Collect &amp; Permissions</h3>
              <ul className="list-disc pl-5 pt-1 space-y-1 text-xs">
                <li><strong>Authentication Data:</strong> When logging in with Google, we receive basic public profile information: your name, email address, and profile photo avatar. We never access, request, or store your Google password or third-party passwords.</li>
                <li><strong>Creator Showcase Links:</strong> Public video links and channel URLs that you submit to share with the community.</li>
                <li><strong>AI Assistant &amp; Voice Dictation (Microphone):</strong> When you tap the Voice-to-Text button in the AI Assistant, your browser&apos;s built-in Web Speech API converts speech to text locally. We never record, save, or upload raw audio files.</li>
                <li><strong>Activity Data:</strong> Community discovery sessions and virtual coin balances used for campaign showcases.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">2. How We Use Information</h3>
              <ul className="list-disc pl-5 pt-1 space-y-1 text-xs">
                <li>To enable community video discovery and creator showcase campaigns.</li>
                <li>To generate AI video titles, descriptions, SEO tags, and scripts based on your topic prompts.</li>
                <li>To prevent spam, automated bots, and abuse of community features.</li>
                <li>To provide creator support and resolve account inquiries.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">3. Data Sharing &amp; Third Parties</h3>
              <p className="text-xs pt-1">
                We do not sell, rent, or monetize your personal information to third-party advertisers. We use Google Firebase (Authentication &amp; Cloud Firestore) strictly for cloud data storage and authentication under Google Cloud Security policies.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">4. Data Retention &amp; User Rights</h3>
              <p className="text-xs pt-1">
                You retain complete control over your data. You can delete your campaigns anytime with full coin refunds. You can request complete account deletion by contacting us at <a href="mailto:krja462@gmail.com" className="text-blue-600 font-bold underline">krja462@gmail.com</a> or using the in-app &ldquo;Delete Account&rdquo; tab.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">5. Children&apos;s Privacy</h3>
              <p className="text-xs pt-1">
                Our application is intended for content creators and is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13.
              </p>
            </div>
          </div>
        )}

        {/* 2. TERMS OF SERVICE */}
        {activeTab === 'terms' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900">
              <p className="font-extrabold text-sm">Terms of Service &amp; Community Rules</p>
              <p className="text-xs pt-1 text-purple-800">
                By accessing or using AtoPlay Booster, you agree to these Terms of Service. Please review them carefully.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">1. Creator Community &amp; AI SEO Toolkit</h3>
              <p className="text-xs pt-1">
                AtoPlay Booster is a collaborative creator community and AI video growth toolkit. Users can discover fellow creators&apos; channels, generate SEO titles/tags/scripts with the AI Assistant, and earn virtual in-app community coins to showcase their own videos.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">2. Coin Utility (No Cash Value)</h3>
              <p className="text-xs pt-1">
                Coins earned in AtoPlay Booster are strictly virtual utility tokens for launching promotional showcases within the app. Coins hold NO real-world monetary value, cannot be redeemed for fiat currency, and cannot be withdrawn or sold.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">3. Fair Play &amp; Anti-Spam Policy</h3>
              <p className="text-xs pt-1">
                To maintain a safe and authentic community for all creators:
              </p>
              <ul className="list-disc pl-5 pt-1 space-y-1 text-xs">
                <li>Community discovery sessions must be completed genuinely by human creators.</li>
                <li>The use of automated scripts, emulators, auto-clickers, or bots is strictly prohibited and results in account suspension.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">4. Campaign Content Guidelines</h3>
              <p className="text-xs pt-1">
                Users may only submit public, lawful video links. Campaigns containing hate speech, copyrighted pirated material, violence, adult content, or illegal material will be removed immediately.
              </p>
            </div>
          </div>
        )}

        {/* 3. PLATFORM DISCLAIMER (CRITICAL FOR UPTODOWN) */}
        {activeTab === 'disclaimer' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2">
              <div className="flex items-center space-x-2 text-amber-900 font-extrabold text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                <span>Third-Party Independent Utility Disclaimer</span>
              </div>
              <p className="text-xs leading-relaxed font-medium">
                <strong>AtoPlay Booster</strong> is an independent community &amp; AI SEO utility developed to assist video creators in discovering and supporting each other.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">1. No Affiliation with AtoPlay or Bluedoors Technologies</h3>
              <p className="text-xs pt-1">
                AtoPlay Booster is <strong>NOT</strong> an official product of, authorized by, affiliated with, sponsored by, or endorsed by <strong>AtoPlay</strong> or its parent company <strong>Bluedoors Technologies Pvt. Ltd.</strong>
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">2. Trademark Notice</h3>
              <p className="text-xs pt-1">
                &ldquo;AtoPlay&rdquo;, the AtoPlay logo, and related trademarks are the registered property of Bluedoors Technologies Pvt. Ltd. Any reference to &ldquo;AtoPlay&rdquo; in this application is used purely for nominative, descriptive, and interoperability purposes to describe compatibility with public creator links.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">3. Independent External Browser Viewing</h3>
              <p className="text-xs pt-1">
                All video and channel links submitted by users are opened directly in your standard external web browser (Chrome, Samsung Internet, etc.) on the official website. We do not modify, host, or scrape private user data.
              </p>
            </div>
          </div>
        )}

        {/* 4. CONTACT & SUPPORT */}
        {activeTab === 'contact' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
              <p className="font-extrabold text-sm">Developer Contact &amp; 24/7 Support Desk</p>
              <p className="text-xs pt-1 text-emerald-800">
                Have questions, bug reports, or partnership inquiries? Our development team is here to assist you.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1">
              <div className="flex items-center space-x-2 text-zinc-900 font-bold text-xs">
                <Mail className="w-4 h-4 text-emerald-600" />
                <span>Official Developer Support Email</span>
              </div>
              <a href="mailto:krja462@gmail.com" className="text-xs text-blue-600 hover:underline font-bold block">
                krja462@gmail.com
              </a>
              <p className="text-[11px] text-zinc-500">Fast response within 24 hours</p>
            </div>

            {contactSent ? (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-300 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="font-extrabold text-emerald-900 text-sm">Message Prepared!</h4>
                <p className="text-xs text-emerald-700">
                  Click below to open your email client and send your query directly to <strong>krja462@gmail.com</strong>.
                </p>
                <a
                  href={`mailto:krja462@gmail.com?subject=AtoPlay%20Booster%20Inquiry%20from%20${encodeURIComponent(contactName || 'User')}&body=${encodeURIComponent(`Name: ${contactName}\nEmail: ${contactEmail}\n\nMessage:\n${contactMessage}`)}`}
                  className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send via Gmail / Mail App</span>
                </a>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700 uppercase">Your Name</label>
                    <input
                      type="text"
                      placeholder="Creator Name"
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-700 uppercase">Your Email</label>
                    <input
                      type="email"
                      required
                      placeholder="you@gmail.com"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 uppercase">Message / Query</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Describe your question or issue..."
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition-colors cursor-pointer"
                >
                  Send Message to Developer
                </button>
              </form>
            )}
          </div>
        )}

        {/* 5. DELETE ACCOUNT (GDPR & UPTODOWN COMPLIANCE) */}
        {activeTab === 'delete_account' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900">
              <p className="font-extrabold text-sm">Account &amp; Data Deletion Policy</p>
              <p className="text-xs pt-1 text-rose-800">
                In compliance with Uptodown store policies and global privacy standards (GDPR / CCPA), you have the right to completely purge your account and personal data at any time.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 text-sm">How to Request Immediate Data Deletion:</h3>
              <ol className="list-decimal pl-5 pt-1 space-y-1.5 text-xs">
                <li><strong>In-App Logout:</strong> Open the account drawer and tap &ldquo;Sign Out from Google&rdquo; to clear all local tokens and saved sessions.</li>
                <li><strong>Campaign Removal:</strong> In the &ldquo;Campaigns&rdquo; tab, tap the delete trash icon on any active campaign for an immediate refund and data removal.</li>
                <li><strong>Permanent Account Purging:</strong> Send an email from your registered account to <strong className="text-zinc-900">Developer Support</strong> with the subject <em>&ldquo;Request Account Deletion&rdquo;</em>. Our administrator will permanently delete your user profile, coin ledger, and Firestore records within 24 to 48 hours.</li>
              </ol>
            </div>

            <div className="pt-2">
              <a
                href="mailto:krja462@gmail.com?subject=Request%20Account%20and%20Data%20Deletion&body=Hello%2C%20please%20permanently%20delete%20my%20AtoPlay%20Booster%20account%20and%20all%20associated%20data%20from%20Cloud%20Firestore."
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center space-x-1.5 shadow-md transition-all cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>Email Developer for Full Account Deletion</span>
              </a>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
        <span>© 2026 AtoPlay Booster Community</span>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>

    </div>
  );

  if (standalone) {
    return <div className="min-h-screen bg-zinc-50 text-zinc-900 py-6 px-4">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-70 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      {content}
    </div>
  );
};
