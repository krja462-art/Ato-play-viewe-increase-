/**
 * Unified Video Metadata Extractor
 * Compatible with Node.js (Vercel Serverless / Express) and Browser (Client-side / Vercel SPA)
 */

export interface VideoMetadata {
  displayId: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelId?: string;
  channelFollowers?: number;
  durationSeconds: number;
  durationText: string;
  isRealVideo: boolean;
  platform?: 'atoplay' | 'youtube' | 'generic';
}

function parseFollowersNumber(val: any): number | undefined {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return undefined;
  const s = val.trim().toUpperCase();
  if (s.endsWith('M')) return Math.round(parseFloat(s) * 1000000);
  if (s.endsWith('K')) return Math.round(parseFloat(s) * 1000);
  const n = parseInt(s.replace(/,/g, ''), 10);
  return isNaN(n) ? undefined : n;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

export function generate4CharId(input: string): string {
  if (!input) return 'PLAY';
  const clean = input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length >= 4) {
    return clean.slice(-4);
  }
  return clean.padEnd(4, 'X');
}

export function formatDuration(seconds: number): string {
  const s = Math.max(1, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const remSecs = s % 60;
  return `${mins}:${remSecs.toString().padStart(2, '0')}`;
}

const ATOPLAY_FALLBACK_THUMBNAILS = [
  "https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp",
  "https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/b079eff5-e942-4d88-813d-6bc5a40d08e9.webp",
  "https://banner-atoplay.b-cdn.net/atoplay-social-banner.jpg"
];

/**
 * Real Video Metadata Extractor Engine
 * Uses AtoPlay official API (which supports open CORS), YouTube oEmbed, and HTML metadata
 */
export async function extractVideoMetadata(rawUrl: string): Promise<VideoMetadata | null> {
  const trimmed = (rawUrl || '').trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;

  let urlObj: URL;
  try {
    const toParse = !trimmed.startsWith('http://') && !trimmed.startsWith('https://')
      ? `https://${trimmed}`
      : trimmed;
    urlObj = new URL(toParse);
  } catch {
    return null;
  }

  const hostname = urlObj.hostname.toLowerCase();
  const isAtoPlay = hostname.includes('atoplay.com') || hostname.includes('atoplay.in');
  const isYouTube = hostname.includes('youtube.com') || hostname.includes('youtu.be');

  // -------------------------------------------------------------
  // 1. ATOPLAY VIDEO EXTRACTION
  // -------------------------------------------------------------
  if (isAtoPlay) {
    // Extract potential UUID from path
    const uuidMatch = urlObj.pathname.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) ||
                      urlObj.pathname.match(/(?:video\/|v\/|watch\/|post\/)?([0-9a-f]{32})/i);
    
    let videoId = '';
    if (uuidMatch) {
      if (uuidMatch[1] && uuidMatch[1].includes('-')) {
        videoId = uuidMatch[1].toLowerCase();
      } else if (uuidMatch[0].includes('-')) {
        videoId = uuidMatch[0].toLowerCase();
      } else {
        const h = (uuidMatch[1] || uuidMatch[0]).toLowerCase();
        if (h.length === 32) {
          videoId = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
        }
      }
    }

    // Step 1a: If UUID found, query official AtoPlay video endpoints
    if (videoId) {
      const displayId = generate4CharId(videoId);
      
      // Probe /api/videos/${videoId}
      try {
        const res = await fetch(`https://api.atoplay.com/api/videos/${videoId}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          const vData = await res.json();
          if (vData && (vData.id || vData.title)) {
            const title = decodeHtmlEntities(vData.title || 'AtoPlay Video');
            let thumbnailUrl = vData.thumbnailUrl || ATOPLAY_FALLBACK_THUMBNAILS[0];
            if (!thumbnailUrl.startsWith('http')) {
              thumbnailUrl = `https://cdn.atoplay.in/${thumbnailUrl.replace(/^\//, '')}`;
            }
            const channelName = vData.channel?.name || vData.channelName || 'AtoPlay Creator';
            const durationSeconds = Number(vData.durationSeconds || vData.duration) || 60;
            return {
              displayId,
              title,
              thumbnailUrl,
              channelName,
              durationSeconds,
              durationText: formatDuration(durationSeconds),
              isRealVideo: true,
              platform: 'atoplay'
            };
          }
        }
      } catch (err) {
        console.warn('AtoPlay API probe 1 note:', err);
      }

      // Probe /api/videos/v2/${videoId}
      try {
        const res2 = await fetch(`https://api.atoplay.com/api/videos/v2/${videoId}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (res2.ok) {
          const vData = await res2.json();
          if (vData && (vData.id || vData.title)) {
            const title = decodeHtmlEntities(vData.title || 'AtoPlay Video');
            let thumbnailUrl = vData.thumbnailUrl || ATOPLAY_FALLBACK_THUMBNAILS[0];
            if (!thumbnailUrl.startsWith('http')) {
              thumbnailUrl = `https://cdn.atoplay.in/${thumbnailUrl.replace(/^\//, '')}`;
            }
            const channelName = vData.channel?.name || vData.channelName || 'AtoPlay Creator';
            const durationSeconds = Number(vData.durationSeconds || vData.duration) || 60;
            return {
              displayId,
              title,
              thumbnailUrl,
              channelName,
              durationSeconds,
              durationText: formatDuration(durationSeconds),
              isRealVideo: true,
              platform: 'atoplay'
            };
          }
        }
      } catch {
        // continue
      }

      // Probe /api/videos/user/${videoId}?limit=1 (if UUID was ownerId/channelId)
      try {
        const res3 = await fetch(`https://api.atoplay.com/api/videos/user/${videoId}?limit=1`, {
          headers: { 'Accept': 'application/json' }
        });
        if (res3.ok) {
          const list = await res3.json();
          if (Array.isArray(list) && list.length > 0) {
            const best = list[0];
            const title = decodeHtmlEntities(best.title || 'AtoPlay Video');
            let thumbnailUrl = best.thumbnailUrl || ATOPLAY_FALLBACK_THUMBNAILS[0];
            if (!thumbnailUrl.startsWith('http')) {
              thumbnailUrl = `https://cdn.atoplay.in/${thumbnailUrl.replace(/^\//, '')}`;
            }
            const channelName = best.channel?.name || best.channelName || 'AtoPlay Creator';
            const durationSeconds = Number(best.durationSeconds || best.duration) || 60;
            return {
              displayId: generate4CharId(best.id || videoId),
              title,
              thumbnailUrl,
              channelName,
              durationSeconds,
              durationText: formatDuration(durationSeconds),
              isRealVideo: true,
              platform: 'atoplay'
            };
          }
        }
      } catch {
        // continue
      }
    }

    // Step 1b: Search by keywords or slug in URL
    const segments = urlObj.pathname.split('/').filter(Boolean);
    const lastSeg = segments[segments.length - 1] || '';
    const rawKeywords = decodeURIComponent(lastSeg)
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
      .replace(/[-_]/g, ' ')
      .trim();

    if (rawKeywords && rawKeywords.length > 2 && rawKeywords !== 'video' && rawKeywords !== 'watch' && rawKeywords !== 'post') {
      try {
        const searchRes = await fetch(`https://api.atoplay.com/api/search/search?query=${encodeURIComponent(rawKeywords)}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (searchRes.ok) {
          const sData = await searchRes.json();
          if (Array.isArray(sData) && sData.length > 0) {
            const item = sData[0];
            const title = decodeHtmlEntities(item.title || rawKeywords);
            let thumbnailUrl = item.thumbnailUrl || ATOPLAY_FALLBACK_THUMBNAILS[0];
            if (!thumbnailUrl.startsWith('http')) {
              thumbnailUrl = `https://cdn.atoplay.in/${thumbnailUrl.replace(/^\//, '')}`;
            }
            const channelName = item.channel?.name || item.channelName || 'AtoPlay Creator';
            return {
              displayId: generate4CharId(item.id || item.videoId || 'PLAY'),
              title,
              thumbnailUrl,
              channelName,
              durationSeconds: 60,
              durationText: '1:00',
              isRealVideo: true,
              platform: 'atoplay'
            };
          }
        }
      } catch {
        // continue
      }

      // Format readable title from slug
      const formattedTitle = rawKeywords.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      return {
        displayId: generate4CharId(videoId || lastSeg),
        title: formattedTitle || 'AtoPlay Video Promotion',
        thumbnailUrl: ATOPLAY_FALLBACK_THUMBNAILS[0],
        channelName: 'AtoPlay Creator',
        durationSeconds: 60,
        durationText: '1:00',
        isRealVideo: true,
        platform: 'atoplay'
      };
    }

    // Step 1c: Fallback for valid AtoPlay URL
    return {
      displayId: generate4CharId(videoId || 'PLAY'),
      title: 'AtoPlay Video Promotion',
      thumbnailUrl: ATOPLAY_FALLBACK_THUMBNAILS[0],
      channelName: 'AtoPlay Creator',
      durationSeconds: 60,
      durationText: '1:00',
      isRealVideo: true,
      platform: 'atoplay'
    };
  }

  // -------------------------------------------------------------
  // 2. YOUTUBE VIDEO EXTRACTION
  // -------------------------------------------------------------
  if (isYouTube) {
    let ytId = '';
    if (hostname.includes('youtu.be')) {
      ytId = urlObj.pathname.slice(1).split('?')[0];
    } else if (urlObj.pathname.includes('/shorts/')) {
      ytId = urlObj.pathname.split('/shorts/')[1]?.split('/')[0]?.split('?')[0] || '';
    } else if (urlObj.pathname.includes('/embed/')) {
      ytId = urlObj.pathname.split('/embed/')[1]?.split('/')[0]?.split('?')[0] || '';
    } else {
      ytId = urlObj.searchParams.get('v') || '';
    }

    if (ytId) {
      const displayId = generate4CharId(ytId);
      let title = `YouTube Video (${ytId})`;
      let channelName = 'YouTube Creator';
      const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

      // Use YouTube official public oEmbed (open CORS)
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          if (data.title) title = decodeHtmlEntities(data.title);
          if (data.author_name) channelName = data.author_name;
        }
      } catch {
        // oembed failed, standard fallback is ready
      }

      return {
        displayId,
        title,
        thumbnailUrl,
        channelName,
        durationSeconds: 60,
        durationText: '1:00',
        isRealVideo: true,
        platform: 'youtube'
      };
    }
  }

  // -------------------------------------------------------------
  // 3. GENERIC VIDEO / WEB LINK EXTRACTION
  // -------------------------------------------------------------
  const segs = urlObj.pathname.split('/').filter(Boolean);
  const fallbackId = generate4CharId(segs[segs.length - 1] || 'VID');
  let cleanTitle = 'Video Promotion';
  if (segs.length > 0) {
    cleanTitle = decodeURIComponent(segs[segs.length - 1]).replace(/[-_]/g, ' ');
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  }

  return {
    displayId: fallbackId,
    title: cleanTitle,
    thumbnailUrl: ATOPLAY_FALLBACK_THUMBNAILS[0],
    channelName: hostname.replace(/^www\./, ''),
    durationSeconds: 60,
    durationText: '1:00',
    isRealVideo: true,
    platform: 'generic'
  };
}
