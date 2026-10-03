import type { IncomingMessage, ServerResponse } from 'http';
import { extractVideoMetadata } from '../../src/lib/videoExtractor';

export default async function handler(req: any, res: any) {
  // Setup standard CORS headers for Vercel Serverless Function
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-user-id'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    let url = '';
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      url = body?.url || '';
    } else {
      url = req.query?.url || '';
      if (!url && req.url) {
        const parsed = new URL(req.url, 'http://localhost');
        url = parsed.searchParams.get('url') || '';
      }
    }

    if (!url) {
      return res.status(400).json({ success: false, message: 'URL parameter is required' });
    }

    let metadata = await extractVideoMetadata(url);

    // If metadata doesn't have a real banner or was missed, probe official AtoPlay channel API directly
    const isChannel = /(?:channels?\/|c\/|user\/|@)/i.test(url);
    if ((!metadata || !metadata.thumbnailUrl || metadata.thumbnailUrl.includes('unsplash') || isChannel) && isChannel) {
      try {
        const slugMatch = url.match(/(?:channels?\/|c\/|user\/|@)([a-zA-Z0-9_-]+)/i);
        const parts = url.split(/[/?#]/).filter(Boolean);
        const slug = slugMatch ? slugMatch[1] : parts[parts.length - 1];
        if (slug && slug !== 'channel' && slug !== 'channels') {
          const cRes = await fetch(`https://api.atoplay.com/api/channels/${slug}`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
          });
          if (cRes.ok) {
            const cData = await cRes.json();
            const ch = cData?.channel || cData?.data || cData;
            if (ch && (ch.name || ch.channelBanner || ch.channelImage)) {
              const name = ch.name || ch.username || ch.title || metadata?.channelName || 'AtoPlay Channel';
              const banner = ch.channelBanner || ch.channelImage || (Array.isArray(ch.videos) && ch.videos[0]?.thumbnailUrl) || metadata?.thumbnailUrl;
              const fCount = Number(ch.followersCount ?? ch.followers ?? ch.subscribersCount) || metadata?.channelFollowers || 0;
              metadata = {
                displayId: metadata?.displayId || slug.slice(-4).toUpperCase(),
                title: name,
                thumbnailUrl: banner || 'https://cdn.atoplay.in/atoplay-thumbnails/58d4d4aa-c235-48a1-8423-57fbeefa914e/thumbnails/61f8d5c2-3b2b-4789-8581-c6727ce0388a.webp',
                channelName: name,
                channelId: ch.id || slug,
                channelFollowers: fCount,
                durationSeconds: 60,
                durationText: '1:00',
                isRealVideo: true,
                platform: 'atoplay'
              };
            }
          }
        }
      } catch (directErr) {
        console.warn('Direct channel probe on Vercel error:', directErr);
      }
    }

    if (!metadata) {
      return res.status(400).json({ success: false, message: 'Invalid video or channel URL provided' });
    }

    return res.status(200).json({
      success: true,
      metadata
    });
  } catch (err: any) {
    console.error('Vercel serverless extract-metadata error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to extract video metadata',
      error: err?.message || String(err)
    });
  }
}
