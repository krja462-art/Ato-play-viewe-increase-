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

/**
 * Helper to render clean formatted AI text with **bold** spans, headings, and bullet points
 * inside a ChatGPT / Gemini style conversational bubble.
 */
const FormattedAIMessage: React.FC<{ text: string }> = ({ text }) => {
  const lines = String(text || '').split('\n');

  const renderInlineBold = (lineText: string) => {
    const parts = lineText.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={idx} className="font-bold text-zinc-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-2 text-sm sm:text-[15px] text-zinc-800 leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1.5" />;
        }

        // Heading line (e.g. ### Heading or full **Heading**)
        if (line.startsWith('### ') || line.startsWith('## ')) {
          const cleanHeading = line.replace(/^#{2,3}\s+/, '').replace(/\*\*/g, '');
          return (
            <h3 key={idx} className="text-sm sm:text-base font-bold text-zinc-900 pt-2 first:pt-0">
              {cleanHeading}
            </h3>
          );
        }

        if (
          line.startsWith('**') &&
          line.endsWith('**') &&
          line.indexOf('**', 2) === line.length - 2
        ) {
          return (
            <h3 key={idx} className="text-sm sm:text-base font-bold text-zinc-900 pt-2 first:pt-0">
              {line.slice(2, -2)}
            </h3>
          );
        }

        // Bullet point line
        if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
          const bulletBody = line.slice(2).trim();
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1">
              <span className="text-blue-600 font-bold mt-0.5 select-none">•</span>
              <p className="flex-1 break-words">{renderInlineBold(bulletBody)}</p>
            </div>
          );
        }

        // Numbered list line (e.g., "1. Title...")
        const numMatch = line.match(/^(\d+\.)\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1">
              <span className="text-blue-600 font-bold tabular-nums shrink-0 mt-0.5">
                {numMatch[1]}
              </span>
              <p className="flex-1 break-words">{renderInlineBold(numMatch[2])}</p>
            </div>
          );
        }

        return (
          <p key={idx} className="break-words">
            {renderInlineBold(rawLine)}
          </p>
        );
      })}
    </div>
  );
};

export const AIVideoAssistant: React.FC<AIVideoAssistantProps> = ({ user }) => {
  const [selectedTask, setSelectedTask] = useState<CreatorTaskType>('auto');
  const [language, setLanguage] = useState<OutputLanguage>('hinglish');
  const [prompt, setPrompt] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
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
    setPendingPrompt(null);
    setErrorMsg(null);
    setSpeechNotice(null);
    setIsPlusMenuOpen(false);
    setIsHistoryDrawerOpen(false);
  };

  const buildFullCopyText = (res: AIGrowthResult) => {
    if (res.cleanFormattedOutput && res.cleanFormattedOutput.trim()) {
      return res.cleanFormattedOutput.replace(/\*\*/g, '').trim();
    }
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
    return parts.join('\n\n');
  };

  const getDisplayBubbleText = (res: AIGrowthResult) => {
    if (res.cleanFormattedOutput && res.cleanFormattedOutput.trim()) {
      return res.cleanFormattedOutput.trim();
    }
    return buildFullCopyText(res);
  };

  const handleGenerate = async (
    e?: React.FormEvent,
    customTopic?: string,
    overrideTask?: CreatorTaskType
  ) => {
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
    setPendingPrompt(targetPrompt);
    setErrorMsg(null);
    setSpeechNotice(null);
    setIsPlusMenuOpen(false);
    if (customTopic === undefined) {
      setPrompt('');
    }
    scrollToLatestTurn();

    // Build multi-turn conversation history for follow-up AI context memory
    const conversationHistory = chatTurns.flatMap((turn) => [
      { role: 'user', text: turn.prompt },
      { role: 'model', text: getDisplayBubbleText(turn.result) }
    ]);

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
          language,
          messages: conversationHistory
        })
      });

      if (!data?.success || !data?.result) {
        throw new Error(data?.message || 'Could not generate AI response. Please try again.');
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

      saveHistoryToLocal(
        [newHistoryItem, ...history.filter((h) => h.prompt !== targetPrompt)].slice(0, 15)
      );
      scrollToLatestTurn();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error while generating AI content. Please try again.');
      if (customTopic === undefined) {
        setPrompt(targetPrompt);
      }
    } finally {
      setIsGenerating(false);
      setPendingPrompt(null);
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

  const handleSelectStarterTask = (task: (typeof TASK_CARDS)[number]) => {
    setSelectedTask((prev) => (prev === task.id ? 'auto' : task.id));
    setIsPlusMenuOpen(false);
    inputRef.current?.focus();
  };

  const activeTaskMeta = TASK_CARDS.find((t) => t.id === selectedTask);
  const activeLanguageMeta =
    LANGUAGE_OPTIONS.find((l) => l.id === language) || LANGUAGE_OPTIONS[0];

  const isZeroState = chatTurns.length === 0 && !isGenerating;

  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex flex-col justify-between bg-gradient-to-b from-white via-blue-50/35 to-blue-100/45 rounded-3xl border border-zinc-200/70 overflow-hidden pb-36 md:pb-32">
      {/* Top Minimal Sub-Header */}
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
            {activeTaskMeta ? activeTaskMeta.shortLabel : 'All-in-One Chat'}
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

          {/* New Chat Button */}
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

      {/* Main Content Area: Zero-State Welcome OR Active Conversational Chat Thread */}
      <div className="flex-1 flex flex-col justify-between max-w-3xl w-full mx-auto px-4 sm:px-6 pt-6 pb-8">
        {isZeroState ? (
          /* Clean Text-Only Greeting Without Any Gemini Logo Above It */
          <div className="my-auto py-12 sm:py-16 flex flex-col items-center text-center">
            <h1 className="text-2xl sm:text-4xl font-semibold text-zinc-900 tracking-tight text-balance">
              Where should we start?
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 mt-2.5 max-w-md leading-relaxed">
              Ask any question, pick a quick task chip below, tap{' '}
              <span className="font-semibold text-zinc-700">+</span> to change language, or use the
              mic to speak your video topic.
            </p>
          </div>
        ) : (
          /* Active Conversational AI Chat Feed (Clean Formatted Text Bubbles + Copy Button) */
          <div className="space-y-6">
            {chatTurns.map((turn) => {
              const res = turn.result;
              const bubbleText = getDisplayBubbleText(res);
              const copyableText = buildFullCopyText(res);

              return (
                <div key={turn.id} className="space-y-3">
                  {/* User Message Bubble */}
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

                  {/* Clean ChatGPT / Gemini Style Formatted AI Text Bubble */}
                  <div className="flex justify-start">
                    <div className="w-full max-w-[96%] sm:max-w-[90%] bg-white rounded-3xl rounded-tl-lg border border-zinc-200/90 p-4 sm:p-5 space-y-4 shadow-xs">
                      {/* Bubble Top Bar: Task Label + Copy & Regenerate Actions */}
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-100">
                        <span className="text-xs font-bold text-blue-600 truncate">
                          {res.taskTitle || 'AtoPlay AI Assistant'}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleGenerate(undefined, turn.prompt, turn.taskType)}
                            disabled={isGenerating}
                            className="h-8 px-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-semibold text-zinc-700 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                            title="Regenerate response"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Regenerate</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopy(copyableText, `full_${turn.id}`)}
                            className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {copiedKey === `full_${turn.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
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
                      </div>

                      {/* Formatted Conversational AI Text Content */}
                      <FormattedAIMessage text={bubbleText} />

                      {/* Optional Quick Copy Row for Titles / Tags / Hashtags */}
                      {(res.titles?.length > 0 ||
                        res.seoTags?.length > 0 ||
                        res.hashtags?.length > 0) && (
                        <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center gap-2">
                          {res.titles?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleCopy(res.titles.join('\n'), `titles_${turn.id}`)}
                              className="px-2.5 py-1.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              {copiedKey === `titles_${turn.id}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Titles Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Copy Titles</span>
                                </>
                              )}
                            </button>
                          )}

                          {res.seoTags?.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(res.seoTags.join(', '), `tags_${turn.id}`)
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              {copiedKey === `tags_${turn.id}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Tags Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Copy SEO Tags</span>
                                </>
                              )}
                            </button>
                          )}

                          {res.hashtags?.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(res.hashtags.join(' '), `hash_${turn.id}`)
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              {copiedKey === `hash_${turn.id}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Hashtags Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Copy Hashtags</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pending User Message + AI Thinking Bubble During Generation */}
            {isGenerating && (
              <div className="space-y-3">
                {pendingPrompt && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-3xl rounded-tr-lg bg-zinc-900 text-white px-4 py-3 shadow-xs">
                      <p className="text-sm sm:text-base leading-relaxed break-words">
                        {pendingPrompt}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-start">
                  <div className="bg-white rounded-3xl rounded-tl-lg border border-zinc-200 px-5 py-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-zinc-900">AtoPlay AI is thinking...</p>
                      <p className="text-xs text-zinc-500">
                        Writing response in {activeLanguageMeta.label}
                      </p>
                    </div>
                  </div>
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

          {/* Horizontal Scrollable Quick Task Chip List Above Chat Input (Gemini Mobile Style) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-0.5">
            {TASK_CARDS.map((task) => {
              const Icon = task.icon;
              const isSelected = selectedTask === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handleSelectStarterTask(task)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer shadow-2xs ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white shadow-blue-600/15'
                      : 'bg-white/95 hover:bg-white border-zinc-200/90 text-zinc-800'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-white' : 'text-blue-600'
                    }`}
                  />
                  <span>{task.title}</span>
                </button>
              );
            })}
          </div>

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

