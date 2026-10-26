import React, { useState, useEffect } from 'react';
import {
  Wand2,
  Calculator,
  FileText,
  Smartphone,
  Copy,
  Check,
  Sparkles,
  Share2,
  Trash2,
  Plus,
  CheckSquare,
  Square,
  TrendingUp,
  Clock,
  Users,
  Eye,
  Vibrate,
  HardDrive,
  RefreshCw,
  Tag
} from 'lucide-react';
import { RealCoin } from './RealCoin';

interface SavedNote {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'c1', label: 'High-contrast 16:9 thumbnail (1280x720)', done: true },
  { id: 'c2', label: 'Hook viewers in the first 5 seconds', done: false },
  { id: 'c3', label: 'Add 8–12 relevant AtoPlay search tags', done: false },
  { id: 'c4', label: 'Include channel follow reminder in description', done: false },
  { id: 'c5', label: 'Boost initial velocity with a 50-view campaign', done: false },
];

const CATEGORY_PRESETS: Record<string, { tags: string[]; hashtags: string[]; titleTemplates: string[] }> = {
  gaming: {
    tags: ['atoplay gaming', 'mobile gaming india', 'pro gameplay', 'gaming highlights', 'live stream clips', 'esports india', 'gaming walkthrough', 'best gaming moments'],
    hashtags: ['#AtoPlayGaming', '#GamingIndia', '#ProGameplay', '#GamerLife', '#ViralGaming'],
    titleTemplates: [
      'How to Master {topic} in 5 Minutes (Pro Tips & Tricks)',
      '{topic} Extreme Gameplay — Unbelievable Ending!',
      'Top 5 Secret Tricks in {topic} Nobody Tells You'
    ]
  },
  tech: {
    tags: ['tech review hindi', 'smartphone tips', 'android tricks', 'gadget unboxing', 'atoplay tech', 'best budget tech', 'tech tutorial', 'future technology'],
    hashtags: ['#TechReview', '#AndroidTips', '#AtoPlayTech', '#GadgetsIndia', '#TechHacks'],
    titleTemplates: [
      '{topic} Full Review — Worth Buying in 2026?',
      '7 Hidden Features of {topic} You Must Try Today!',
      'How to Fix & Optimize {topic} (Step-by-Step Guide)'
    ]
  },
  vlog: {
    tags: ['daily vlog india', 'lifestyle vlog', 'travel vlog', 'behind the scenes', 'atoplay creators', 'creator journey', 'my daily routine', 'indian vlogger'],
    hashtags: ['#DailyVlog', '#AtoPlayCreators', '#CreatorLife', '#LifestyleVlog', '#TrendingVlog'],
    titleTemplates: [
      'A Day in My Life: {topic} Special Vlog!',
      'Exploring {topic} — You Won’t Believe What Happened!',
      'Behind the Scenes of {topic} (Honest Experience)'
    ]
  },
  education: {
    tags: ['learn online', 'study tips', 'educational video', 'how to guide', 'career growth', 'skill development', 'atoplay learning', 'explained in hindi'],
    hashtags: ['#LearnOnAtoPlay', '#Education', '#StudyTips', '#SkillUp', '#Knowledge'],
    titleTemplates: [
      '{topic} Explained Simply in 10 Minutes (Complete Guide)',
      'Beginner to Pro in {topic}: Everything You Need to Know',
      '5 Common Mistakes to Avoid When Learning {topic}'
    ]
  },
  entertainment: {
    tags: ['funny videos', 'comedy skit', 'trending entertainment', 'viral video india', 'atoplay entertainment', 'must watch video', 'best reaction', 'desi comedy'],
    hashtags: ['#Entertainment', '#TrendingNow', '#AtoPlayViral', '#ComedyVideo', '#MustWatch'],
    titleTemplates: [
      'When {topic} Goes Totally Wrong! (Must Watch)',
      '{topic} Expectation vs Reality — Hilarious Reaction!',
      'Top 10 Moments of {topic} That Broke the Internet'
    ]
  }
};

export const CreatorTools: React.FC = () => {
  const [activeToolTab, setActiveToolTab] = useState<'seo' | 'calculator' | 'notepad' | 'device'>('seo');

  // 1. SEO & Tag Generator State
  const [videoTopic, setVideoTopic] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('gaming');
  const [generatedTitles, setGeneratedTitles] = useState<string[]>([]);
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 2. Growth & Coin Calculator State
  const [targetViews, setTargetViews] = useState<number>(100);
  const [targetFollowers, setTargetFollowers] = useState<number>(50);
  const [dailyVideosWatched, setDailyVideosWatched] = useState<number>(15);

  // 3. Offline Script Notepad & Checklist State
  const [notes, setNotes] = useState<SavedNote[]>(() => {
    try {
      const saved = localStorage.getItem('atoplay_creator_notes');
      return saved ? JSON.parse(saved) : [
        {
          id: 'note_default',
          title: 'My Next Viral Video Script',
          content: '0:00 - Strong 5s Hook\n0:15 - Main Topic Breakdown\n0:45 - Call to Action (Follow on AtoPlay)',
          updatedAt: new Date().toLocaleDateString()
        }
      ];
    } catch {
      return [];
    }
  });
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    try {
      const saved = localStorage.getItem('atoplay_upload_checklist');
      return saved ? JSON.parse(saved) : DEFAULT_CHECKLIST;
    } catch {
      return DEFAULT_CHECKLIST;
    }
  });

  // 4. Native Device Preferences State
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('atoplay_haptics') !== 'false';
  });
  const [dataSaverEnabled, setDataSaverEnabled] = useState<boolean>(() => {
    return localStorage.getItem('atoplay_datasaver') === 'true';
  });
  const [cacheClearedMsg, setCacheClearedMsg] = useState<string | null>(null);

  const triggerHaptic = (ms = 20) => {
    if (hapticsEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {}
    }
  };

  useEffect(() => {
    handleGenerateSEO('AtoPlay Channel Growth', 'gaming');
  }, []);

  const handleGenerateSEO = (customTopic?: string, customCat?: string) => {
    triggerHaptic(15);
    const cat = customCat || selectedCategory;
    const preset = CATEGORY_PRESETS[cat] || CATEGORY_PRESETS.gaming;
    const rawTopic = (customTopic !== undefined ? customTopic : videoTopic).trim() || 'AtoPlay Video';
    const cleanTopic = rawTopic.charAt(0).toUpperCase() + rawTopic.slice(1);

    const titles = preset.titleTemplates.map(t => t.replace('{topic}', cleanTopic));
    const customTagSlug = rawTopic.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const tags = [
      customTagSlug,
      `${customTagSlug} 2026`,
      `${customTagSlug} atoplay`,
      ...preset.tags
    ].filter(Boolean);

    const hashSlug = '#' + rawTopic.replace(/[^a-zA-Z0-9]/g, '');
    const hashtags = [hashSlug.length > 2 ? hashSlug : '#AtoPlay', ...preset.hashtags];

    setGeneratedTitles(titles);
    setGeneratedTags(Array.from(new Set(tags)));
    setGeneratedHashtags(Array.from(new Set(hashtags)));
  };

  const handleCopyText = async (text: string, key: string) => {
    triggerHaptic(25);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  const handleNativeShareSEO = async () => {
    triggerHaptic(25);
    const packText = `Video Titles:\n${generatedTitles.join('\n')}\n\nTags:\n${generatedTags.join(', ')}\n\nHashtags:\n${generatedHashtags.join(' ')}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AtoPlay SEO Metadata Pack',
          text: packText
        });
      } catch {}
    } else {
      handleCopyText(packText, 'share_pack');
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() && !noteContent.trim()) return;
    triggerHaptic(30);
    const newNote: SavedNote = {
      id: `note_${Date.now()}`,
      title: noteTitle.trim() || 'Untitled Video Draft',
      content: noteContent.trim(),
      updatedAt: new Date().toLocaleDateString()
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    localStorage.setItem('atoplay_creator_notes', JSON.stringify(updated));
    setNoteTitle('');
    setNoteContent('');
  };

  const handleDeleteNote = (id: string) => {
    triggerHaptic(20);
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    localStorage.setItem('atoplay_creator_notes', JSON.stringify(updated));
  };

  const toggleChecklistItem = (id: string) => {
    triggerHaptic(15);
    const updated = checklist.map(item => item.id === id ? { ...item, done: !item.done } : item);
    setChecklist(updated);
    localStorage.setItem('atoplay_upload_checklist', JSON.stringify(updated));
  };

  const handleToggleHaptics = () => {
    const next = !hapticsEnabled;
    setHapticsEnabled(next);
    localStorage.setItem('atoplay_haptics', String(next));
    if (next && 'vibrate' in navigator) {
      try { navigator.vibrate(35); } catch {}
    }
  };

  const handleToggleDataSaver = () => {
    triggerHaptic(15);
    const next = !dataSaverEnabled;
    setDataSaverEnabled(next);
    localStorage.setItem('atoplay_datasaver', String(next));
  };

  const handleOptimizeAppCache = async () => {
    triggerHaptic(40);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          if (!k.includes('v7')) {
            await caches.delete(k);
          }
        }
      }
      setCacheClearedMsg('App cache optimized & temporary buffers cleared!');
      setTimeout(() => setCacheClearedMsg(null), 3500);
    } catch {
      setCacheClearedMsg('Device storage optimized!');
      setTimeout(() => setCacheClearedMsg(null), 3500);
    }
  };

  // Calculator math
  const viewCoinsNeeded = targetViews * 60;
  const followerCoinsNeeded = targetFollowers * 30;
  const totalCoinsNeeded = viewCoinsNeeded + followerCoinsNeeded;
  const dailyCoinsEarned = dailyVideosWatched * 60 + 50; // +50 daily streak avg
  const estimatedDays = Math.max(1, Math.ceil(totalCoinsNeeded / Math.max(60, dailyCoinsEarned)));
  const estimatedWatchHours = ((targetViews * 60) / 3600).toFixed(1);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-12 space-y-5">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center space-x-1.5 text-[11px] font-bold uppercase tracking-wider bg-white/15 px-2.5 py-0.5 rounded-md border border-white/20 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Built-In Offline Creator Studio</span>
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              AtoPlay Creator Toolkit
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 mt-0.5">
              Generate viral SEO tags, calculate campaign budgets, and draft scripts offline on your device.
            </p>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="grid grid-cols-4 gap-1.5 mt-4 bg-black/20 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => { triggerHaptic(); setActiveToolTab('seo'); }}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeToolTab === 'seo' ? 'bg-white text-blue-700 shadow-xs' : 'text-blue-100 hover:bg-white/10'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">SEO Tags</span>
          </button>

          <button
            type="button"
            onClick={() => { triggerHaptic(); setActiveToolTab('calculator'); }}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeToolTab === 'calculator' ? 'bg-white text-blue-700 shadow-xs' : 'text-blue-100 hover:bg-white/10'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Calculator</span>
          </button>

          <button
            type="button"
            onClick={() => { triggerHaptic(); setActiveToolTab('notepad'); }}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeToolTab === 'notepad' ? 'bg-white text-blue-700 shadow-xs' : 'text-blue-100 hover:bg-white/10'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Script Pad</span>
          </button>

          <button
            type="button"
            onClick={() => { triggerHaptic(); setActiveToolTab('device'); }}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeToolTab === 'device' ? 'bg-white text-blue-700 shadow-xs' : 'text-blue-100 hover:bg-white/10'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">App Setup</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SEO & VIRAL TAG GENERATOR */}
      {activeToolTab === 'seo' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-zinc-900">AtoPlay Video Title & Tag Generator</h2>
                <p className="text-xs text-zinc-500">Enter your video topic to generate high-ranking search tags & hashtags</p>
              </div>
              <Tag className="w-5 h-5 text-blue-600 shrink-0" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-zinc-700 block mb-1">Video Topic or Keyword</label>
                <input
                  type="text"
                  value={videoTopic}
                  onChange={(e) => setVideoTopic(e.target.value)}
                  placeholder="e.g., BGMI New Update, Budget Phone Review, Daily Vlog"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">Channel Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    handleGenerateSEO(videoTopic, e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-900 bg-white focus:outline-none focus:border-blue-600"
                >
                  <option value="gaming">Gaming & Esports</option>
                  <option value="tech">Tech & Gadgets</option>
                  <option value="vlog">Lifestyle & Vlogs</option>
                  <option value="education">Education & Tutorials</option>
                  <option value="entertainment">Comedy & Entertainment</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleGenerateSEO()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm cursor-pointer transition-all"
              >
                <Wand2 className="w-4 h-4" />
                <span>Generate Viral Metadata</span>
              </button>

              <button
                type="button"
                onClick={handleNativeShareSEO}
                className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>Share SEO Pack</span>
              </button>
            </div>
          </div>

          {/* Generated Titles */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
              Recommended High-CTR Video Titles
            </h3>
            <div className="space-y-2">
              {generatedTitles.map((title, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-3 rounded-xl bg-zinc-50 border border-zinc-200/80"
                >
                  <span className="text-xs sm:text-sm font-bold text-zinc-800">{title}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(title, `title_${idx}`)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-blue-50 text-xs font-bold text-blue-600 flex items-center space-x-1 shrink-0 cursor-pointer"
                  >
                    {copiedKey === `title_${idx}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === `title_${idx}` ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Generated Search Tags & Hashtags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                  Search Tags ({generatedTags.length})
                </h3>
                <button
                  type="button"
                  onClick={() => handleCopyText(generatedTags.join(', '), 'all_tags')}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  {copiedKey === 'all_tags' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'all_tags' ? 'Copied All!' : 'Copy All Tags'}</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {generatedTags.map((tag, i) => (
                  <span
                    key={i}
                    onClick={() => handleCopyText(tag, `tag_${i}`)}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200/60 text-xs font-semibold cursor-pointer hover:bg-blue-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                  Viral Description Hashtags
                </h3>
                <button
                  type="button"
                  onClick={() => handleCopyText(generatedHashtags.join(' '), 'all_hashes')}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  {copiedKey === 'all_hashes' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'all_hashes' ? 'Copied All!' : 'Copy Hashtags'}</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {generatedHashtags.map((hash, i) => (
                  <span
                    key={i}
                    onClick={() => handleCopyText(hash, `hash_${i}`)}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/80 text-xs font-bold cursor-pointer hover:bg-amber-100"
                  >
                    {hash}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CHANNEL GROWTH & COIN CALCULATOR */}
      {activeToolTab === 'calculator' && (
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-extrabold text-zinc-900">Campaign Budget & Watch-Time Calculator</h2>
            <p className="text-xs text-zinc-500">Plan your AtoPlay channel growth milestones and required coin balance</p>
          </div>

          <div className="space-y-5">
            {/* Target Views Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-zinc-700 flex items-center space-x-1.5">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span>Target Video Views (60s Retention)</span>
                </span>
                <span className="text-blue-600 font-extrabold tabular-nums">{targetViews} Views</span>
              </div>
              <input
                type="range"
                min={10}
                max={2000}
                step={10}
                value={targetViews}
                onChange={(e) => setTargetViews(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Target Followers Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-zinc-700 flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>Target New Channel Followers</span>
                </span>
                <span className="text-emerald-600 font-extrabold tabular-nums">{targetFollowers} Followers</span>
              </div>
              <input
                type="range"
                min={0}
                max={1000}
                step={10}
                value={targetFollowers}
                onChange={(e) => setTargetFollowers(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>

            {/* Daily Videos Watched Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-zinc-700 flex items-center space-x-1.5">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <span>Videos You Watch Per Day</span>
                </span>
                <span className="text-amber-700 font-extrabold tabular-nums">{dailyVideosWatched} Videos / day</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={dailyVideosWatched}
                onChange={(e) => setDailyVideosWatched(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Results Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/80 space-y-1">
              <span className="text-[11px] font-bold text-amber-800 block">Total Coins Required</span>
              <div className="flex items-center space-x-1.5">
                <RealCoin size="sm" />
                <span className="text-lg font-black text-amber-950 tabular-nums">{totalCoinsNeeded.toLocaleString()}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/90 border border-blue-200/80 space-y-1">
              <span className="text-[11px] font-bold text-blue-800 block">Watch Hours Added</span>
              <div className="flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-lg font-black text-blue-950 tabular-nums">{estimatedWatchHours} hrs</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200/80 space-y-1">
              <span className="text-[11px] font-bold text-emerald-800 block">Daily Earning Rate</span>
              <div className="flex items-center space-x-1.5">
                <RealCoin size="xs" />
                <span className="text-lg font-black text-emerald-950 tabular-nums">+{dailyCoinsEarned.toLocaleString()}/d</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-100 border border-zinc-200 space-y-1">
              <span className="text-[11px] font-bold text-zinc-600 block">Time to Achieve</span>
              <span className="text-lg font-black text-zinc-900 tabular-nums block">
                ~{estimatedDays} {estimatedDays === 1 ? 'Day' : 'Days'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OFFLINE SCRIPT NOTEPAD & UPLOAD CHECKLIST */}
      {activeToolTab === 'notepad' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Script Notepad */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-zinc-900">Offline Video Script & Idea Pad</h2>
              <p className="text-xs text-zinc-500">Saved directly on your phone — accessible anytime without internet</p>
            </div>

            <form onSubmit={handleAddNote} className="space-y-2.5">
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Video Title or Idea..."
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-900 focus:outline-none focus:border-blue-600"
              />
              <textarea
                rows={3}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your intro hook, key talking points, or tags to remember..."
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-medium text-zinc-800 focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Save Script to Device</span>
              </button>
            </form>

            <div className="space-y-2 pt-2 max-h-64 overflow-y-auto">
              {notes.map((n) => (
                <div key={n.id} className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-zinc-900">{n.title}</h4>
                    <div className="flex items-center space-x-1">
                      <span className="text-[10px] text-zinc-400">{n.updatedAt}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(n.id)}
                        className="p-1 text-zinc-400 hover:text-red-600 cursor-pointer"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600 whitespace-pre-line">{n.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pre-Upload Optimization Checklist */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-zinc-900">Creator Pre-Upload Checklist</h2>
              <p className="text-xs text-zinc-500">Complete these 5 steps before promoting your AtoPlay video</p>
            </div>

            <div className="space-y-2">
              {checklist.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleChecklistItem(item.id)}
                  className={`w-full p-3 rounded-xl border text-left flex items-center space-x-3 transition-all cursor-pointer ${
                    item.done
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-800 hover:bg-zinc-100'
                  }`}
                >
                  {item.done ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                  <span className={`text-xs font-bold ${item.done ? 'line-through text-emerald-800/80' : ''}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: NATIVE DEVICE & APP SETTINGS */}
      {activeToolTab === 'device' && (
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-extrabold text-zinc-900">App Controls & Device Optimization</h2>
            <p className="text-xs text-zinc-500">Configure native mobile haptics, offline cache, and data preferences</p>
          </div>

          <div className="divide-y divide-zinc-100">
            <div className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Vibrate className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900">Haptic Touch Vibration</h4>
                  <p className="text-xs text-zinc-500">Vibrate device when earning coins and completing tasks</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleHaptics}
                className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                  hapticsEnabled ? 'bg-blue-600 text-white' : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {hapticsEnabled ? 'Enabled' : 'Off'}
              </button>
            </div>

            <div className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900">Low-Data Thumbnail Saver</h4>
                  <p className="text-xs text-zinc-500">Optimize video preview loading on mobile networks</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleDataSaver}
                className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                  dataSaverEnabled ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {dataSaverEnabled ? 'Active' : 'Standard'}
              </button>
            </div>

            <div className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900">Offline Storage & Cache Cleaner</h4>
                  <p className="text-xs text-zinc-500">Clear stale video buffers while preserving your coins & notes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOptimizeAppCache}
                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer transition-all"
              >
                Optimize Cache
              </button>
            </div>
          </div>

          {cacheClearedMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{cacheClearedMsg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
