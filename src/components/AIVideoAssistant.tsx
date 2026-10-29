import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Type as TypeIcon,
  FileVideo,
  Image as ImageIcon,
  FileText,
  Copy,
  Check,
  Trash2,
  Clock,
  Send,
  Hash,
  Palette,
  Lightbulb,
  RotateCcw,
  Plus,
  Mic,
  MicOff,
  SquarePen,
  ChevronDown,
  Globe,
  X
} from 'lucide-react';
import { User } from '../types';
import { apiFetch } from '../lib/api';

export type CreatorTaskType =
  | 'auto'
  | 'title_seo'
  | 'script_idea'
  | 'thumbnail_guide'
  | 'description_hashtags';

export type OutputLanguage = 'hinglish' | 'hindi' | 'english';

export interface VideoConceptItem {
  title: string;
  concept: string;
}

export interface AIGrowthResult {
  detectedTask: string;
  taskTitle: string;
  titles: string[];
  seoTags: string[];
  videoConcepts: VideoConceptItem[];
  openingHook: string;
  thumbnailOverlays: string[];
  thumbnailBackgrounds: string[];
  thumbnailColors: string[];
  descriptionText: string;
  hashtags: string[];
  cleanFormattedOutput: string;
}

export interface SavedAIHistoryItem {
  id: string;
  prompt: string;
  taskType: CreatorTaskType;
  language: OutputLanguage;
  createdAt: string;
  result: AIGrowthResult;
}

export interface ChatTurnItem {
  id: string;
  prompt: string;
  taskType: CreatorTaskType;
  language: OutputLanguage;
  createdAt: string;
  result: AIGrowthResult;
}

interface AIVideoAssistantProps {
  user: User;
}

const TASK_CARDS: {
  id: CreatorTaskType;
  number: string;
  title: string;
  shortLabel: string;
  starterPrompt: string;
  subtitle: string;
  placeholder: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: 'title_seo',
    number: '01',
    title: 'Title & SEO Tag Generator',
    shortLabel: 'Viral Titles & SEO Tags',
    starterPrompt: 'Generate viral titles & SEO tags for my next AtoPlay video',
    subtitle: '3 viral high-CTR titles + 8–10 trending AtoPlay tags',
    placeholder: 'Ask AtoPlay AI for viral titles & SEO tags...',
    icon: TypeIcon
  },
  {
    id: 'script_idea',
    number: '02',
    title: 'Video Script & Idea Generator',
    shortLabel: 'Video Script & 15s Hook',
    starterPrompt: 'Write 2 unique video ideas and a catchy 15-second hook script',
    subtitle: '2 unique video concepts + catchy 15-sec opening hook script',
    placeholder: 'Ask AtoPlay AI for video ideas & 15s hook script...',
    icon: FileVideo
  },
  {
    id: 'thumbnail_guide',
    number: '03',
    title: 'Thumbnail Concept Guide',
    shortLabel: 'Thumbnail Concept Guide',
    starterPrompt: 'Give me high-CTR thumbnail text, background & color ideas',
    subtitle: 'Catchy overlay text, background visuals & high-contrast colors',
    placeholder: 'Ask AtoPlay AI for thumbnail text & color concepts...',
    icon: ImageIcon
  },
  {
    id: 'description_hashtags',
    number: '04',
    title: 'Description & Hashtag Writer',
    shortLabel: 'Description & Hashtags',
    starterPrompt: 'Write an SEO video description with Like/Follow CTA and 5 hashtags',
    subtitle: 'Clean structured description with Like/Follow CTA + 5 hashtags',
    placeholder: 'Ask AtoPlay AI for video description & hashtags...',
    icon: FileText
  }
];

const LANGUAGE_OPTIONS: {
  id: OutputLanguage;
  label: string;
  sublabel: string;
  speechLang: string;
}[] = [
  {
    id: 'hinglish',
    label: 'Hinglish (Mix)',
    sublabel: 'Hindi + English creator style',
    speechLang: 'en-IN'
  },
  {
    id: 'hindi',
    label: 'Hindi (हिंदी)',
    sublabel: 'Pure simple Hindi output',
    speechLang: 'hi-IN'
  },
  {
    id: 'english',
    label: 'English',
    sublabel: 'Clean modern English',
    speechLang: 'en-IN'
  }
];

const FourPointSparkle: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="atoplaySparkleGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#EF4444" />
        <stop offset="35%" stopColor="#F59E0B" />
        <stop offset="68%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#3B82F6" />
      </linearGradient>
    </defs>
    <path
      d="M24 3C24 14.598 33.402 24 45 24C33.402 24 24 33.402 24 45C24 33.402 14.598 24 3 24C14.598 24 24 14.598 24 3Z"
      fill="url(#atoplaySparkleGrad)"
    />
  </svg>
);

export const AIVideoAssistant: React.FC<AIVideoAssistantProps> = ({ user }) => {
  const [selectedTask, setSelectedTask] = useState<CreatorTaskType>('auto');
  const [language, setLanguage] = useState<OutputLanguage>('hinglish');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurnItem[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedAIHistoryItem[]>([]);

  // Bottom sheet (+) drawer & recent history modal state
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  // Voice Recognition (Web Speech API) state
  const [isListening, setIsListening] = useState(false);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const basePromptBeforeSpeechRef = useRef<string>('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const storageKey = `atoplay_ai_assistant_history_${user?.id || 'default'}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load AI history:', e);
    }
  }, [storageKey]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore cleanup error
        }
      }
    };
  }, []);

  const saveHistoryToLocal = (items: SavedAIHistoryItem[]) => {
    setHistory(items);
    try {
      localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 20)));
    } catch (e) {
      console.warn('Failed to save AI history:', e);
    }
  };

  const scrollToLatestTurn = () => {
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    }
  };

  // Toggle Web Speech API Voice Input
  const handleToggleVoiceInput = () => {
    setSpeechNotice(null);

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setSpeechNotice('Voice input is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      const activeLangConfig = LANGUAGE_OPTIONS.find((l) => l.id === language);
      recognition.lang = activeLangConfig?.speechLang || 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = true;

      basePromptBeforeSpeechRef.current = prompt.trim() ? `${prompt.trim()} ` : '';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechNotice(null);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPiece;
          } else {
            interimTranscript += transcriptPiece;
          }
        }

        const combined = `${basePromptBeforeSpeechRef.current}${finalTranscript}${interimTranscript}`.trimStart();
        setPrompt(combined);
        if (finalTranscript) {
          basePromptBeforeSpeechRef.current = `${basePromptBeforeSpeechRef.current}${finalTranscript} `;
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event?.error === 'not-allowed') {
          setSpeechNotice('Microphone permission denied. Please allow mic access in your browser.');
        } else if (event?.error !== 'aborted' && event?.error !== 'no-speech') {
          setSpeechNotice('Could not capture voice clearly. Tap the mic to try again.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        inputRef.current?.focus();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechNotice('Could not start microphone. Please try again.');
    }
  };

  const handleNewChat = () => {
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }
    setChatTurns([]);
    setPrompt('');
    setErrorMsg(null);
    setSpeechNotice(null);
    setIsPlusMenuOpen(false);
    setIsHistoryDrawerOpen(false);
  };

  const handleGenerate = async (e?: React.FormEvent, customTopic?: string, overrideTask?: CreatorTaskType) => {
    if (e) e.preventDefault();
    const targetPrompt = (customTopic !== undefined ? customTopic : prompt).trim();
    if (!targetPrompt || isGenerating) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }

    const taskToUse = overrideTask || selectedTask;
    setIsGenerating(true);
    setErrorMsg(null);
    setSpeechNotice(null);
    setIsPlusMenuOpen(false);
    if (customTopic === undefined) {
      setPrompt('');
    }
    scrollToLatestTurn();

    try {
      const data = await apiFetch('/api/ai/video-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          prompt: targetPrompt,
          taskType: taskToUse,
          language
        })
      });

      if (!data?.success || !data?.result) {
        throw new Error(data?.message || 'Could not generate response. Please try again.');
      }

      const result: AIGrowthResult = data.result;
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const turnId = `ai_${Date.now()}`;

      const newTurn: ChatTurnItem = {
        id: turnId,
        prompt: targetPrompt,
        taskType: taskToUse,
        language,
        createdAt: nowStr,
        result
      };

      setChatTurns((prev) => [...prev, newTurn]);

      const newHistoryItem: SavedAIHistoryItem = {
        id: turnId,
        prompt: targetPrompt,
        taskType: taskToUse,
        language,
        createdAt: nowStr,
        result
      };

      saveHistoryToLocal([newHistoryItem, ...history.filter((h) => h.prompt !== targetPrompt)].slice(0, 15));
      scrollToLatestTurn();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error while generating AI content. Please try again.');
      if (customTopic === undefined) {
        setPrompt(targetPrompt);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    saveHistoryToLocal(updated);
  };

  const handleClearAllHistory = () => {
    saveHistoryToLocal([]);
  };

  const handleLoadHistoryItem = (item: SavedAIHistoryItem) => {
    setSelectedTask(item.taskType);
    setLanguage(item.language);
    setChatTurns([
      {
        id: item.id,
        prompt: item.prompt,
        taskType: item.taskType,
        language: item.language,
        createdAt: item.createdAt,
        result: item.result
      }
    ]);
    setErrorMsg(null);
    setIsHistoryDrawerOpen(false);
    setIsPlusMenuOpen(false);
    scrollToLatestTurn();
  };

  const handleSelectStarterTask = (task: typeof TASK_CARDS[number]) => {
    setSelectedTask(task.id);
    setIsPlusMenuOpen(false);
    inputRef.current?.focus();
  };

  const activeTaskMeta = TASK_CARDS.find((t) => t.id === selectedTask);
  const activeLanguageMeta = LANGUAGE_OPTIONS.find((l) => l.id === language) || LANGUAGE_OPTIONS[0];

  const buildFullCopyText = (res: AIGrowthResult) => {
    const parts: string[] = [];
    if (res.titles?.length > 0) {
      parts.push(`VIRAL TITLES:\n${res.titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
    }
    if (res.seoTags?.length > 0) {
      parts.push(`SEO TAGS & KEYWORDS:\n${res.seoTags.join(', ')}`);
    }
    if (res.videoConcepts?.length > 0) {
      parts.push(
        `VIDEO CONCEPTS:\n${res.videoConcepts
          .map((c, i) => `Concept ${i + 1}: ${c.title}\n${c.concept}`)
          .join('\n\n')}`
      );
    }
    if (res.openingHook) {
      parts.push(`15-SECOND OPENING HOOK SCRIPT:\n${res.openingHook}`);
    }
    if (res.thumbnailOverlays?.length > 0) {
      parts.push(`THUMBNAIL TEXT OVERLAYS:\n${res.thumbnailOverlays.map((t) => `• ${t}`).join('\n')}`);
    }
    if (res.thumbnailBackgrounds?.length > 0) {
      parts.push(`THUMBNAIL BACKGROUND IDEAS:\n${res.thumbnailBackgrounds.map((t) => `• ${t}`).join('\n')}`);
    }
    if (res.thumbnailColors?.length > 0) {
      parts.push(`HIGH-CONTRAST COLOR COMBINATIONS:\n${res.thumbnailColors.map((t) => `• ${t}`).join('\n')}`);
    }
    if (res.descriptionText) {
      parts.push(`VIDEO DESCRIPTION:\n${res.descriptionText}`);
    }
    if (res.hashtags?.length > 0) {
      parts.push(`HASHTAGS:\n${res.hashtags.join(' ')}`);
    }
    if (parts.length === 0 && res.cleanFormattedOutput) {
      return res.cleanFormattedOutput;
    }
    return parts.join('\n\n');
  };

  const isZeroState = chatTurns.length === 0 && !isGenerating;

  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex flex-col justify-between bg-gradient-to-b from-white via-blue-50/35 to-blue-100/45 rounded-3xl border border-zinc-200/70 overflow-hidden pb-36 md:pb-32">
      {/* Top Minimal Gemini-Style Sub-Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-white/85 backdrop-blur-md border-b border-zinc-200/60">
        <button
          type="button"
          onClick={() => setIsPlusMenuOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 text-left cursor-pointer group"
        >
          <span className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
            AtoPlay AI
          </span>
          <span className="text-sm sm:text-base font-medium text-zinc-500 group-hover:text-blue-600 transition-colors flex items-center gap-1">
            {activeTaskMeta ? activeTaskMeta.shortLabel : 'Auto'}
            <ChevronDown className="w-4 h-4 text-zinc-400 group-hover:text-blue-600 transition-transform" />
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Language Indicator Button */}
          <button
            type="button"
            onClick={() => setIsPlusMenuOpen(true)}
            className="h-9 px-3 rounded-xl border border-zinc-200/80 bg-zinc-50/90 hover:bg-zinc-100 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Change Output & Voice Language"
          >
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            <span>{activeLanguageMeta.label.split(' ')[0]}</span>
          </button>

          {/* Saved History Drawer Button */}
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setIsHistoryDrawerOpen((prev) => !prev)}
              className="w-9 h-9 rounded-xl border border-zinc-200/80 bg-zinc-50/90 hover:bg-zinc-100 text-zinc-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Recent Generated Ideas"
              aria-label="Recent Generated Ideas"
            >
              <Clock className="w-4 h-4" />
            </button>
          )}

          {/* New Chat Button (Matches top-right dashed/pen icon in reference) */}
          <button
            type="button"
            onClick={handleNewChat}
            className="h-9 px-3 rounded-xl border border-zinc-200/80 bg-white hover:bg-blue-50 hover:border-blue-200 text-xs font-semibold text-zinc-800 hover:text-blue-600 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
            title="Start New Chat"
          >
            <SquarePen className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {/* Recent History Popover Drawer */}
      {isHistoryDrawerOpen && history.length > 0 && (
        <div className="mx-4 sm:mx-6 mt-3 bg-white rounded-2xl border border-zinc-200 shadow-lg p-4 space-y-3 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-zinc-900">Recent Saved Ideas</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClearAllHistory}
                className="text-xs font-medium text-zinc-500 hover:text-red-600 transition-colors cursor-pointer"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setIsHistoryDrawerOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer"
                aria-label="Close history"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-zinc-100 max-h-60 overflow-y-auto pr-1">
            {history.map((item) => (
              <div
                key={item.id}
                className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
              >
                <button
                  type="button"
                  onClick={() => handleLoadHistoryItem(item)}
                  className="min-w-0 flex-1 text-left cursor-pointer"
                >
                  <p className="text-xs font-semibold text-zinc-900 group-hover:text-blue-600 truncate transition-colors">
                    {item.prompt}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {item.result.taskTitle} · {item.language.toUpperCase()} · {item.createdAt}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteHistoryItem(item.id)}
                  className="w-8 h-8 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Delete saved idea"
                  aria-label="Delete saved idea"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area: Zero-State Welcome OR Active Chat Results */}
      <div className="flex-1 flex flex-col justify-between max-w-3xl w-full mx-auto px-4 sm:px-6 pt-6 pb-8">
        {isZeroState ? (
          <>
            {/* Center Sparkle & "Where should we start?" Greeting */}
            <div className="my-auto py-10 sm:py-14 flex flex-col items-center text-center">
              <div className="mb-5">
                <FourPointSparkle className="w-11 h-11 sm:w-12 sm:h-12" />
              </div>
              <h1 className="text-2xl sm:text-4xl font-medium text-zinc-900 tracking-tight">
                Where should we start?
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-2 max-w-md">
                Tap <span className="font-semibold text-zinc-700">+</span> below to choose a Creator Task & Language, or use the mic to speak your video topic.
              </p>
            </div>

            {/* Bottom-Aligned Starter Prompt List (Matches Gemini mobile screenshot rows) */}
            <div className="w-full max-w-lg mx-auto space-y-2 pt-4">
              {TASK_CARDS.map((task) => {
                const Icon = task.icon;
                const isSelected = selectedTask === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleSelectStarterTask(task)}
                    className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white/95 shadow-xs border border-blue-200 text-blue-700'
                        : 'hover:bg-white/70 text-zinc-800'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/90 text-zinc-700 border border-zinc-200/80'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-base font-medium truncate">
                        {task.starterPrompt}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          /* Active Conversation & Generated Creator Results Feed */
          <div className="space-y-6">
            {chatTurns.map((turn) => {
              const res = turn.result;
              return (
                <div key={turn.id} className="space-y-4">
                  {/* User Prompt Bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-3xl rounded-tr-lg bg-zinc-900 text-white px-4 py-3 shadow-xs">
                      <p className="text-sm sm:text-base leading-relaxed break-words">
                        {turn.prompt}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-1 text-right">
                        {turn.language.toUpperCase()} · {turn.createdAt}
                      </p>
                    </div>
                  </div>

                  {/* Structured AI Growth Assistant Response Card */}
                  <div className="bg-white rounded-3xl border border-zinc-200/90 p-4 sm:p-6 space-y-5 shadow-xs">
                    {/* Result Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-zinc-100">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FourPointSparkle className="w-6 h-6 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-blue-600 block truncate">
                            {res.taskTitle}
                          </span>
                          <h2 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
                            AtoPlay Creator Growth Pack
                          </h2>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleGenerate(undefined, turn.prompt, turn.taskType)}
                          disabled={isGenerating}
                          className="h-9 px-3 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Regenerate</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopy(buildFullCopyText(res), `full_${turn.id}`)}
                          className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {copiedKey === `full_${turn.id}` ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Copied All</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy All</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 1. Viral Titles Section */}
                    {res.titles && res.titles.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center gap-2">
                            <TypeIcon className="w-4 h-4 text-blue-600" />
                            <span>Viral High-CTR Titles</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => handleCopy(res.titles.join('\n'), `titles_${turn.id}`)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            {copiedKey === `titles_${turn.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy All Titles</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="space-y-2">
                          {res.titles.map((title, idx) => {
                            const itemKey = `title_${turn.id}_${idx}`;
                            return (
                              <div
                                key={itemKey}
                                className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between gap-3"
                              >
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <span className="text-xs font-bold text-blue-600 tabular-nums mt-0.5">
                                    0{idx + 1}.
                                  </span>
                                  <p className="text-sm font-semibold text-zinc-900 break-words">
                                    {title}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(title, itemKey)}
                                  className="px-2.5 py-1.5 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 text-xs font-semibold text-zinc-700 flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
                                >
                                  {copiedKey === itemKey ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. SEO Tags & Keywords Section */}
                    {res.seoTags && res.seoTags.length > 0 && (
                      <div className="space-y-2.5 pt-2 border-t border-zinc-100">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center gap-2">
                            <Hash className="w-4 h-4 text-blue-600" />
                            <span>Trending SEO Tags ({res.seoTags.length})</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => handleCopy(res.seoTags.join(', '), `tags_${turn.id}`)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            {copiedKey === `tags_${turn.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Copied Tags</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Tags</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80">
                          <p className="text-xs sm:text-sm text-zinc-800 leading-relaxed font-medium">
                            {res.seoTags.join(' · ')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 3. Video Concepts & 15-Second Opening Hook */}
                    {(res.videoConcepts?.length > 0 || res.openingHook) && (
                      <div className="space-y-4 pt-2 border-t border-zinc-100">
                        {res.videoConcepts?.length > 0 && (
                          <div className="space-y-2.5">
                            <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center gap-2">
                              <Lightbulb className="w-4 h-4 text-blue-600" />
                              <span>Unique Video Concepts</span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {res.videoConcepts.map((item, idx) => {
                                const cKey = `concept_${turn.id}_${idx}`;
                                return (
                                  <div
                                    key={cKey}
                                    className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-1.5 flex flex-col justify-between"
                                  >
                                    <div className="space-y-1">
                                      <span className="text-xs font-bold text-blue-600">
                                        Concept 0{idx + 1}
                                      </span>
                                      <h4 className="text-sm font-bold text-zinc-900">{item.title}</h4>
                                      <p className="text-xs text-zinc-700 leading-relaxed">
                                        {item.concept}
                                      </p>
                                    </div>
                                    <div className="pt-2 flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(`${item.title}\n${item.concept}`, cKey)}
                                        className="text-xs font-semibold text-zinc-600 hover:text-blue-600 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                      >
                                        {copiedKey === cKey ? (
                                          <>
                                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Copied</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Copy Concept</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {res.openingHook && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center gap-2">
                                <FileVideo className="w-4 h-4 text-blue-600" />
                                <span>15-Second Opening Hook Script</span>
                              </h3>
                              <button
                                type="button"
                                onClick={() => handleCopy(res.openingHook, `hook_${turn.id}`)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                {copiedKey === `hook_${turn.id}` ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Copied Hook</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy Hook Script</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200/80 text-sm text-zinc-900 whitespace-pre-line leading-relaxed font-medium">
                              {res.openingHook}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. Thumbnail Concept Guide */}
                    {(res.thumbnailOverlays?.length > 0 ||
                      res.thumbnailBackgrounds?.length > 0 ||
                      res.thumbnailColors?.length > 0) && (
                      <div className="space-y-3 pt-2 border-t border-zinc-100">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center gap-2">
                            <Palette className="w-4 h-4 text-blue-600" />
                            <span>Thumbnail Concept Guide</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                [
                                  `Overlay Text: ${res.thumbnailOverlays.join(' | ')}`,
                                  `Background Visuals: ${res.thumbnailBackgrounds.join(' | ')}`,
                                  `Color Combos: ${res.thumbnailColors.join(' | ')}`
                                ].join('\n'),
                                `thumb_${turn.id}`
                              )
                            }
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            {copiedKey === `thumb_${turn.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Copied Guide</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Guide</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {res.thumbnailOverlays?.length > 0 && (
                            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                              <span className="text-xs font-bold text-zinc-900 block">
                                Catchy Thumbnail Text
                              </span>
                              <ul className="space-y-1.5 text-xs text-zinc-700 font-medium">
                                {res.thumbnailOverlays.map((txt, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>{txt}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {res.thumbnailBackgrounds?.length > 0 && (
                            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                              <span className="text-xs font-bold text-zinc-900 block">
                                Background Visuals
                              </span>
                              <ul className="space-y-1.5 text-xs text-zinc-700">
                                {res.thumbnailBackgrounds.map((bg, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>{bg}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {res.thumbnailColors?.length > 0 && (
                            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                              <span className="text-xs font-bold text-zinc-900 block">
                                High-Contrast Colors
                              </span>
                              <ul className="space-y-1.5 text-xs text-zinc-700">
                                {res.thumbnailColors.map((col, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>{col}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 5. Video Description & Hashtags */}
                    {(res.descriptionText || res.hashtags?.length > 0) && (
                      <div className="space-y-3 pt-2 border-t border-zinc-100">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <span>Structured Description & Hashtags</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                `${res.descriptionText}\n\n${(res.hashtags || []).join(' ')}`.trim(),
                                `desc_${turn.id}`
                              )
                            }
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            {copiedKey === `desc_${turn.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Copied Description</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy All</span>
                              </>
                            )}
                          </button>
                        </div>

                        {res.descriptionText && (
                          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs sm:text-sm text-zinc-800 whitespace-pre-line leading-relaxed">
                            {res.descriptionText}
                          </div>
                        )}

                        {res.hashtags && res.hashtags.length > 0 && (
                          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-blue-50/50 border border-blue-200/70">
                            <p className="text-xs sm:text-sm font-bold text-blue-700 break-words">
                              {res.hashtags.join('  ')}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleCopy(res.hashtags.join(' '), `hash_${turn.id}`)}
                              className="px-2.5 py-1.5 rounded-xl bg-white border border-blue-200 text-xs font-semibold text-blue-700 shrink-0 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                            >
                              {copiedKey === `hash_${turn.id}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Hashtags</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fallback Clean Formatted Output */}
                    {res.cleanFormattedOutput &&
                      res.titles.length === 0 &&
                      res.seoTags.length === 0 &&
                      res.videoConcepts.length === 0 &&
                      !res.openingHook &&
                      !res.descriptionText && (
                        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-sm text-zinc-800 whitespace-pre-line leading-relaxed">
                          {res.cleanFormattedOutput}
                        </div>
                      )}
                  </div>
                </div>
              );
            })}

            {isGenerating && (
              <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 flex items-center gap-4 shadow-xs">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-zinc-900">
                    Generating High-CTR Creator Output...
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Crafting {activeTaskMeta ? activeTaskMeta.shortLabel : 'AtoPlay Growth Pack'} in{' '}
                    {activeLanguageMeta.label}
                  </p>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>
        )}
      </div>

      {/* Fixed Bottom Input Area + (+) Creator Task & Language Sheet above Mobile Bottom Nav */}
      <div className="fixed bottom-16 md:bottom-4 left-0 right-0 z-30 px-3 sm:px-6 pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto space-y-2.5">
          {/* (+) Action Bottom Sheet Drawer: Choose Creator Task & Output Language */}
          {isPlusMenuOpen && (
            <div className="bg-white rounded-3xl border border-zinc-200/90 shadow-xl p-4 sm:p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Creator Task & Output Language
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Choose what AtoPlay AI should generate and your preferred voice/text language
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPlusMenuOpen(false)}
                  className="w-8 h-8 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer"
                  aria-label="Close task and language menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 1. Choose Creator Task */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-700">1. Choose Creator Task</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTask('auto');
                      setIsPlusMenuOpen(false);
                    }}
                    className={`text-xs font-semibold cursor-pointer ${
                      selectedTask === 'auto'
                        ? 'text-blue-600 underline underline-offset-4'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    {selectedTask === 'auto' ? 'Auto-Detect Active' : 'Use Auto-Detect'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TASK_CARDS.map((task) => {
                    const Icon = task.icon;
                    const isSelected = selectedTask === task.id;
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => {
                          setSelectedTask(task.id);
                          setIsPlusMenuOpen(false);
                          inputRef.current?.focus();
                        }}
                        className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-600 text-blue-900 shadow-2xs'
                            : 'bg-zinc-50/70 border-zinc-200/80 hover:bg-zinc-100/80 text-zinc-800'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-white text-zinc-700 border border-zinc-200'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-900 truncate">
                            {task.number}. {task.title}
                          </p>
                          <p className="text-[11px] text-zinc-600 line-clamp-1 mt-0.5">
                            {task.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Choose Output & Voice Language */}
              <div className="space-y-2 pt-1 border-t border-zinc-100">
                <span className="text-xs font-bold text-zinc-700 block">
                  2. Select Output & Voice Recognition Language
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {LANGUAGE_OPTIONS.map((lang) => {
                    const isSelected = language === lang.id;
                    return (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => {
                          setLanguage(lang.id);
                          setIsPlusMenuOpen(false);
                        }}
                        className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                            : 'bg-zinc-50 border-zinc-200/80 text-zinc-800 hover:bg-zinc-100'
                        }`}
                      >
                        <span className="text-xs font-bold block whitespace-nowrap">
                          {lang.label}
                        </span>
                        <span
                          className={`text-[10px] block truncate mt-0.5 ${
                            isSelected ? 'text-blue-100' : 'text-zinc-500'
                          }`}
                        >
                          {lang.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Error or Voice Notice Banner */}
          {(errorMsg || speechNotice || isListening) && (
            <div
              className={`px-4 py-2 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-sm border ${
                errorMsg
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : isListening
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <span className="truncate">
                {errorMsg ||
                  (isListening
                    ? `Listening in ${language === 'hindi' ? 'Hindi (hi-IN)' : 'English / Hinglish (en-IN)'}... Speak your video topic now`
                    : speechNotice)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSpeechNotice(null);
                  if (isListening) handleToggleVoiceInput();
                }}
                className="text-xs underline shrink-0 cursor-pointer"
              >
                {isListening ? 'Stop' : 'Dismiss'}
              </button>
            </div>
          )}

          {/* Gemini-Style Rounded Pill Input Bar */}
          <form
            onSubmit={(e) => handleGenerate(e)}
            className="bg-white rounded-[32px] border border-zinc-200/90 shadow-lg shadow-zinc-900/5 px-3 sm:px-4 py-2 flex items-center gap-2"
          >
            {/* Left (+) Button to open Creator Task & Language Sheet */}
            <button
              type="button"
              onClick={() => setIsPlusMenuOpen((prev) => !prev)}
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                isPlusMenuOpen
                  ? 'bg-zinc-900 text-white rotate-45'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800'
              }`}
              title="Choose Creator Task & Language"
              aria-label="Choose Creator Task and Language"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Center Editable Input Field */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <textarea
                ref={inputRef}
                rows={1}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder={
                  activeTaskMeta ? activeTaskMeta.placeholder : 'Ask AtoPlay AI...'
                }
                className="w-full max-h-28 bg-transparent border-0 px-1 py-1.5 text-sm sm:text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none resize-none leading-snug"
              />
            </div>

            {/* Right Voice Input (Web Speech API) Button */}
            <button
              type="button"
              onClick={handleToggleVoiceInput}
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                isListening
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/25 scale-105'
                  : 'hover:bg-zinc-100 text-zinc-700'
              }`}
              title={isListening ? 'Stop voice input' : 'Speak video topic (Voice-to-Text)'}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Send Button (Appears prominently when text is present or always accessible) */}
            {prompt.trim().length > 0 && (
              <button
                type="submit"
                disabled={isGenerating || !prompt.trim()}
                className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-200 text-white flex items-center justify-center shrink-0 shadow-sm transition-all cursor-pointer"
                title="Generate AI Output"
                aria-label="Send prompt"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

