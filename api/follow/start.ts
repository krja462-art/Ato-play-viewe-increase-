import { fetchLiveAtoPlayFollowerCount } from '../../src/lib/videoExtractor';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-user-id, x-user-coins'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { campaignId, videoUrl = '', channelId = '', channelName = 'AtoPlay Creator', countBefore } = body;

    const liveRes = await fetchLiveAtoPlayFollowerCount({
      videoUrl,
      channelId,
      channelName
    });

    const fallbackCount = typeof countBefore === 'number' && countBefore >= 0 ? countBefore : 0;
    const baselineCount = liveRes.isRealAtoPlay && typeof liveRes.count === 'number'
      ? liveRes.count
      : fallbackCount;

    const resolvedChannelId = liveRes.channelId || channelId;
    const resolvedChannelName = liveRes.channelName || channelName || 'AtoPlay Creator';
    const channelUrl = resolvedChannelId
      ? `https://atoplay.com/channels/${resolvedChannelId}`
      : (videoUrl || 'https://atoplay.com');

    return res.status(200).json({
      success: true,
      campaignId,
      countBefore: baselineCount,
      channelKey: resolvedChannelName,
      channelId: resolvedChannelId,
      channelName: resolvedChannelName,
      channelUrl,
      isRealAtoPlay: liveRes.isRealAtoPlay,
      rewardCoins: 30,
      alreadyFollowed: false,
      message: `AtoPlay API captured initial follower count (${baselineCount}). Please follow the channel and tap 'Verify Follow'.`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Failed to start follow session'
    });
  }
}
