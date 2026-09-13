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

    const metadata = await extractVideoMetadata(url);
    if (!metadata) {
      return res.status(400).json({ success: false, message: 'Invalid video URL provided' });
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
