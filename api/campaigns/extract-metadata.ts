import { extractVideoMetadata, fetchLiveAtoPlayFollowerCount } from '../../src/lib/videoExtractor';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-user-id'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

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

    // Ensure real live follower count from /api/channel/:id/count is always populated
    const liveRes = await fetchLiveAtoPlayFollowerCount({
      videoUrl: url,
      channelId: metadata?.channelId,
      channelName: metadata?.channelName
    });

    if (liveRes.isRealAtoPlay && metadata) {
      if (typeof liveRes.count === 'number') {
        metadata.channelFollowers = liveRes.count;
      }
      if (liveRes.channelId) {
        metadata.channelId = liveRes.channelId;
      }
      if (liveRes.channelName) {
        metadata.channelName = liveRes.channelName;
      }
      if (liveRes.channelBanner) {
        metadata.channelBanner = liveRes.channelBanner;
        if (/(?:channels?\/|c\/|user\/|@)/i.test(url)) {
          metadata.thumbnailUrl = liveRes.channelBanner;
        }
      }
      if (liveRes.channelImage) {
        metadata.channelImage = liveRes.channelImage;
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
