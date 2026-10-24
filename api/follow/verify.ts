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
    const {
      campaignId,
      countBefore: reqCountBefore,
      videoUrl = '',
      channelId = '',
      channelName = 'AtoPlay Creator',
      creatorId = '',
      title = 'Follow AtoPlay Channel',
      followerUsername = ''
    } = body;

    const baseline = typeof reqCountBefore === 'number' && reqCountBefore >= 0 ? reqCountBefore : 0;

    let liveRes = await fetchLiveAtoPlayFollowerCount({
      videoUrl,
      channelId,
      channelName
    });

    // Retry once after 1.2s if AtoPlay DB is still committing the new follow
    if ((!liveRes.isRealAtoPlay || (typeof liveRes.count === 'number' && liveRes.count <= baseline)) && (videoUrl || channelId)) {
      await new Promise(r => setTimeout(r, 1200));
      liveRes = await fetchLiveAtoPlayFollowerCount({
        videoUrl,
        channelId: liveRes.channelId || channelId,
        channelName
      });
    }

    if (!liveRes.isRealAtoPlay || typeof liveRes.count !== 'number') {
      return res.status(200).json({
        success: false,
        verified: false,
        countBefore: baseline,
        countAfter: baseline,
        message: `Could not verify live follower count from AtoPlay right now. Please make sure the channel link is valid and try again.`
      });
    }

    const countAfter = liveRes.count;
    const followerIncreased = countAfter > baseline;

    if (!followerIncreased) {
      return res.status(200).json({
        success: false,
        verified: false,
        countBefore: baseline,
        countAfter,
        message: `AtoPlay live check: Follower count did not increase (Previous: ${baseline}, Current: ${countAfter}). Please click 'Follow' on the AtoPlay channel first, then tap 'Verify Follow'.`
      });
    }

    const userId = (req.headers?.['x-user-id'] as string) || body.userId || 'user';
    const currentCoins = req.headers?.['x-user-coins'] ? parseInt(req.headers['x-user-coins'] as string, 10) : undefined;
    const newBalance = typeof currentCoins === 'number' && !isNaN(currentCoins) ? currentCoins + 30 : undefined;

    const resolvedChannelName = liveRes.channelName || channelName || 'AtoPlay Creator';
    const followLog = {
      id: `flog_${Date.now()}_${String(userId).slice(-4)}`,
      campaignId: campaignId || 'camp',
      creatorId: creatorId || 'creator',
      followerUserId: userId,
      followerUsername: followerUsername || 'AtoPlay User',
      timestamp: new Date().toISOString(),
      status: 'active' as const,
      campaignTitle: title
    };

    return res.status(200).json({
      success: true,
      verified: true,
      earnedCoins: 30,
      newBalance,
      countBefore: baseline,
      countAfter,
      channelName: resolvedChannelName,
      campaignId,
      followLog,
      message: `AtoPlay Live Verified! Creator followers increased from ${baseline} to ${countAfter} (+${countAfter - baseline} Follower). +30 Coins added to your wallet!`
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      verified: false,
      message: err?.message || 'Failed to verify follow with AtoPlay API'
    });
  }
}
