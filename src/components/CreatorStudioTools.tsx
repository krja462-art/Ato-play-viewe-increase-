import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  Download,
  Share2,
  Play,
  Pause,
  RotateCcw,
  FileText,
  Palette,
  Type,
  Check,
  Plus,
  Trash2,
  Gauge,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

interface SavedScriptNote {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

const THUMBNAIL_THEMES = [
  { id: 'royal', label: 'Royal Blue', bgStart: '#0f172a', bgEnd: '#1d4ed8', accent: '#facc15', text: '#ffffff' },
  { id: 'fire', label: 'Viral Red', bgStart: '#450a0a', bgEnd: '#dc2626', accent: '#fde047', text: '#ffffff' },
  { id: 'emerald', label: 'Tech Green', bgStart: '#022c22', bgEnd: '#059669', accent: '#34d399', text: '#ffffff' },
  { id: 'gold', label: 'Dark Gold', bgStart: '#18181b', bgEnd: '#3f3f46', accent: '#f59e0b', text: '#ffffff' }
];

export const CreatorStudioTools: React.FC<{ userId: string }> = ({ userId }) => {
  const [activeTool, setActiveTool] = useState<'teleprompter' | 'thumbnail' | 'notepad'>('teleprompter');

  // --- Tool 1: Native Camera Teleprompter State ---
  const [teleScript, setTeleScript] = useState<string>(
    'Namaskar dosto! Aaj ke is video me hum baat karenge kaise aap apne AtoPlay channel ko fast grow kar sakte hain.\n\n1. Sabse pehle apne video ka opening hook strong rakhein.\n2. Trending SEO tags aur clean thumbnail use karein.\n3. Video pasand aaye to channel ko follow zaroor karein!'
  );
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(2); // 1 to 5
  const [fontSize, setFontSize] = useState<number>(20);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // --- Tool 2: HD Thumbnail Canvas Maker State ---
  const [thumbHeadline, setThumbHeadline] = useState('HOW TO GROW FAST IN 2026');
  const [thumbSubtext, setThumbSubtext] = useState('100% Working Creator Strategy');
  const [thumbBadge, setThumbBadge] = useState('NEW TRICK');
  const [selectedTheme, setSelectedTheme] = useState(THUMBNAIL_THEMES[0]);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- Tool 3: Offline Script & SEO Title Analyzer Notepad ---
  const notesKey = `atoplay_native_notes_${userId || 'default'}`;
  const [notes, setNotes] = useState<SavedScriptNote[]>(() => {
    try {
      const saved = localStorage.getItem(notesKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'note_1',
        title: 'My Next Viral Video Script',
        content: 'Hook (0-15s): Show the final result first.\nMain Content: 3 practical steps.\nCTA: Follow channel & share!',
        updatedAt: 'Saved Offline'
      }
    ];
  });
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteSavedToast, setNoteSavedToast] = useState(false);

  const triggerHaptic = (ms = 25) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch {}
  };

  // Teleprompter auto-scroll effect
  useEffect(() => {
    if (!isScrolling) return;
    const interval = setInterval(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop += scrollSpeed;
      }
    }, 50);
    return () => clearInterval(interval);
  }, [isScrolling, scrollSpeed]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const toggleCamera = async () => {
    triggerHaptic(30);
    setCameraError(null);
    if (cameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera preview is not supported on this device.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      setCameraError('Camera permission denied or unavailable. You can still use the Teleprompter!');
    }
  };

  // Render HD 1280x720 Thumbnail on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1280;
    const H = 720;
    canvas.width = W;
    canvas.height = H;

    // Background Gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, selectedTheme.bgStart);
    grad.addColorStop(1, selectedTheme.bgEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle decorative geometric glow circles
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(W - 180, 160, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(160, H - 120, 200, 0, Math.PI * 2);
    ctx.fill();

    // Border Frame
    ctx.strokeStyle = selectedTheme.accent;
    ctx.lineWidth = 14;
    ctx.strokeRect(28, 28, W - 56, H - 56);

    // Top Badge
    if (thumbBadge.trim()) {
      ctx.fillStyle = selectedTheme.accent;
      ctx.beginPath();
      ctx.roundRect(76, 80, 320, 68, 18);
      ctx.fill();

      ctx.fillStyle = '#09090b';
      ctx.font = '900 32px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(thumbBadge.toUpperCase().slice(0, 18), 76 + 160, 126);
    }

    // Main Headline (Word wrapped up to 2 lines)
    ctx.fillStyle = selectedTheme.text;
    ctx.textAlign = 'left';
    ctx.font = '900 78px "Plus Jakarta Sans", sans-serif';
    const words = (thumbHeadline || 'YOUR VIRAL TITLE').toUpperCase().split(' ');
    let line1 = '';
    let line2 = '';
    for (const w of words) {
      if ((line1 + ' ' + w).trim().length <= 18) {
        line1 = (line1 + ' ' + w).trim();
      } else {
        line2 = (line2 + ' ' + w).trim();
      }
    }
    ctx.fillText(line1, 76, 290);
    if (line2) {
      ctx.fillStyle = selectedTheme.accent;
      ctx.fillText(line2.slice(0, 22), 76, 385);
    }

    // Subtitle bar
    if (thumbSubtext.trim()) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.roundRect(76, 460, W - 152, 96, 20);
      ctx.fill();

      ctx.fillStyle = '#f4f4f5';
      ctx.font = '700 42px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(thumbSubtext.slice(0, 38), 108, 522);
    }

    // Footer Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Created with AtoPlay Booster Studio', 76, H - 64);
  }, [thumbHeadline, thumbSubtext, thumbBadge, selectedTheme, activeTool]);

  const handleDownloadThumbnail = () => {
    triggerHaptic(40);
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `atoplay-thumbnail-${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2500);
    } catch (e) {
      console.error('Thumbnail export error:', e);
    }
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() && !noteBody.trim()) return;
    triggerHaptic(30);
    const newItem: SavedScriptNote = {
      id: `note_${Date.now()}`,
      title: noteTitle.trim() || 'Untitled Video Idea',
      content: noteBody.trim(),
      updatedAt: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    };
    const updated = [newItem, ...notes];
    setNotes(updated);
    localStorage.setItem(notesKey, JSON.stringify(updated));
    setNoteTitle('');
    setNoteBody('');
    setNoteSavedToast(true);
    setTimeout(() => setNoteSavedToast(false), 2000);
  };

  const handleDeleteNote = (id: string) => {
    triggerHaptic(20);
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    localStorage.setItem(notesKey, JSON.stringify(updated));
  };

  const handleShareNote = async (note: SavedScriptNote) => {
    triggerHaptic(25);
    const text = `${note.title}\n\n${note.content}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: note.title, text });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  // SEO Score calculation for the title in Notepad
  const titleLen = noteTitle.trim().length;
  const seoScore =
    titleLen === 0 ? 0 : titleLen >= 35 && titleLen <= 70 ? 96 : titleLen >= 20 && titleLen <= 85 ? 78 : 55;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-5 pb-28 bg-white min-h-screen">
      {/* Studio Header */}
      <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3.5">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
            Creator Studio Toolkit
          </h1>
          <p className="text-xs text-zinc-500">
            Built-in offline device tools: Camera Teleprompter, HD Thumbnail Maker &amp; Script Pad
          </p>
        </div>
        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
          Works Offline
        </span>
      </div>

      {/* Tool Selector Tabs */}
      <div className="grid grid-cols-3 gap-1.5 bg-zinc-100 p-1 rounded-xl border border-zinc-200/80">
        <button
          type="button"
          onClick={() => {
            triggerHaptic(15);
            setActiveTool('teleprompter');
          }}
          className={`py-2.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeTool === 'teleprompter'
              ? 'bg-white text-blue-600 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Camera className="w-4 h-4 shrink-0" />
          <span>Teleprompter</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(15);
            setActiveTool('thumbnail');
          }}
          className={`py-2.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeTool === 'thumbnail'
              ? 'bg-white text-blue-600 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Palette className="w-4 h-4 shrink-0" />
          <span>Thumbnail Studio</span>
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic(15);
            setActiveTool('notepad');
          }}
          className={`py-2.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeTool === 'notepad'
              ? 'bg-white text-blue-600 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>Script &amp; SEO Pad</span>
        </button>
      </div>

      {/* 1. TELEPROMPTER & CAMERA RECORDER TOOL */}
      {activeTool === 'teleprompter' && (
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-lg min-h-[290px] flex flex-col justify-between">
            {/* Optional Front Camera Mirror Feed */}
            {cameraActive && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover opacity-45 scale-x-[-1]"
              />
            )}

            {/* Top Teleprompter Controls */}
            <div className="relative z-10 flex items-center justify-between px-4 py-2.5 bg-black/60 backdrop-blur-xs border-b border-white/10 text-white">
              <div className="flex items-center space-x-2">
                <Gauge className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold">Speed: {scrollSpeed}x</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(Number(e.target.value))}
                  className="w-20 accent-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setFontSize((f) => (f >= 28 ? 16 : f + 4))}
                  className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold inline-flex items-center space-x-1 cursor-pointer"
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>{fontSize}px</span>
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center space-x-1 cursor-pointer ${
                    cameraActive ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                  }`}
                >
                  {cameraActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                  <span>{cameraActive ? 'Stop Cam' : 'Front Cam'}</span>
                </button>
              </div>
            </div>

            {/* Scrolling Script Viewport */}
            <div
              ref={scrollerRef}
              className="relative z-10 h-56 overflow-y-auto px-5 py-6 text-center text-white font-bold leading-relaxed select-none"
              style={{ fontSize: `${fontSize}px` }}
            >
              {teleScript.split('\n').map((line, i) => (
                <p key={i} className="mb-3 drop-shadow">
                  {line || '\u00A0'}
                </p>
              ))}
              <div className="h-32" />
            </div>

            {/* Bottom Play / Pause / Reset Bar */}
            <div className="relative z-10 flex items-center justify-center space-x-3 px-4 py-3 bg-black/70 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(25);
                  setIsScrolling((prev) => !prev);
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs flex items-center space-x-1.5 cursor-pointer shadow-md"
              >
                {isScrolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{isScrolling ? 'Pause Scroll' : 'Start Teleprompter'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  setIsScrolling(false);
                  if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
                }}
                className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {cameraError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2 font-medium">
              {cameraError}
            </p>
          )}

          {/* Script Editor Input */}
          <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/80 space-y-2">
            <label className="text-xs font-bold text-zinc-700 block">
              Edit Teleprompter Script (Paste from AI Assistant or write your own):
            </label>
            <textarea
              rows={4}
              value={teleScript}
              onChange={(e) => setTeleScript(e.target.value)}
              placeholder="Write or paste your video script here..."
              className="w-full rounded-xl bg-white border border-zinc-200 p-3 text-xs sm:text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* 2. HD THUMBNAIL CANVAS DESIGNER TOOL */}
      {activeTool === 'thumbnail' && (
        <div className="space-y-4">
          <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow-sm bg-zinc-950 p-2">
            <canvas
              ref={canvasRef}
              className="w-full aspect-video rounded-xl block"
            />
          </div>

          <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/80 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  Main Bold Headline
                </label>
                <input
                  type="text"
                  value={thumbHeadline}
                  onChange={(e) => setThumbHeadline(e.target.value)}
                  placeholder="e.g. HOW TO GROW FAST"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs sm:text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">
                  Top Corner Badge
                </label>
                <input
                  type="text"
                  value={thumbBadge}
                  onChange={(e) => setThumbBadge(e.target.value)}
                  placeholder="e.g. NEW TRICK"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs sm:text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">
                Bottom Subtitle Text
              </label>
              <input
                type="text"
                value={thumbSubtext}
                onChange={(e) => setThumbSubtext(e.target.value)}
                placeholder="e.g. Step-by-step Hindi Tutorial"
                className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs sm:text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1.5">
                Color Theme
              </label>
              <div className="grid grid-cols-4 gap-2">
                {THUMBNAIL_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setSelectedTheme(theme);
                    }}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedTheme.id === theme.id
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-2xs'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadThumbnail}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-extrabold text-xs sm:text-sm shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Saved HD Thumbnail (1280×720 PNG) to Device!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download HD Thumbnail (PNG)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 3. OFFLINE SCRIPT NOTEPAD & LIVE SEO SCORE METER */}
      {activeTool === 'notepad' && (
        <div className="space-y-4">
          <form
            onSubmit={handleSaveNote}
            className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/80 space-y-3"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-800">
                Video Title &amp; Live SEO Score Meter
              </label>
              <span
                className={`text-xs font-extrabold tabular-nums ${
                  seoScore >= 90
                    ? 'text-emerald-600'
                    : seoScore >= 70
                    ? 'text-blue-600'
                    : 'text-amber-600'
                }`}
              >
                SEO Score: {seoScore}/100 ({titleLen}/70 chars)
              </span>
            </div>

            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Enter video title to test SEO length (ideal: 35–70 chars)..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-zinc-200 text-xs sm:text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <textarea
              rows={3}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Write video script, tags, or description ideas to save offline on your phone..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-zinc-200 text-xs sm:text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
            >
              {noteSavedToast ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Saved to Device Offline Storage!</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Save Script Note Offline</span>
                </>
              )}
            </button>
          </form>

          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold text-zinc-500 uppercase tracking-wider px-1">
              Saved Device Notes ({notes.length})
            </h3>
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-3.5 rounded-2xl bg-white border border-zinc-200/80 shadow-2xs space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-zinc-900">{note.title}</h4>
                    <span className="text-[11px] text-zinc-400">{note.updatedAt}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTeleScript(note.content);
                        setActiveTool('teleprompter');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-[11px] font-bold cursor-pointer"
                    >
                      Send to Teleprompter
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareNote(note)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 cursor-pointer"
                      title="Share Note"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                      title="Delete Note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-zinc-600 whitespace-pre-line leading-relaxed">
                  {note.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
