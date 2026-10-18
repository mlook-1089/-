/**
 * Proxy endpoint لتوقيع OAuth 1.0a وتنفيذ عمليات X API.
 * معطّل افتراضياً — ضع X_DELETE_ENABLED=1 في Vercel env لتفعيله.
 *
 * المفاتيح لا تُحفظ على السيرفر: تُستلم في كل طلب ثم تُنسى.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Keys = { apiKey: string; apiSecret: string; token: string; tokenSecret: string };
type Body =
  | { action: 'me'; keys: Keys }
  | { action: 'list'; keys: Keys; userId: string; paginationToken?: string }
  | { action: 'delete'; keys: Keys; tweetId: string };

function pctEncode(s: string) {
  return encodeURIComponent(s)
    .replace(/!/g, '%21').replace(/\*/g, '%2A')
    .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function signOAuth1(opts: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  queryParams?: Record<string, string>;
}) {
  const oauth: Record<string, string> = {
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: opts.token,
    oauth_version: '1.0',
  };

  const all: Record<string, string> = { ...(opts.queryParams || {}), ...oauth };
  const paramString = Object.keys(all).sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(all[k])}`)
    .join('&');

  const base = [opts.method.toUpperCase(), pctEncode(opts.url), pctEncode(paramString)].join('&');
  const signingKey = `${pctEncode(opts.consumerSecret)}&${pctEncode(opts.tokenSecret)}`;
  const sig = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  oauth.oauth_signature = sig;

  return 'OAuth ' + Object.keys(oauth).sort()
    .map((k) => `${pctEncode(k)}="${pctEncode(oauth[k])}"`)
    .join(', ');
}

function validateKeys(keys: unknown): Keys | null {
  if (!keys || typeof keys !== 'object') return null;
  const k = keys as Record<string, unknown>;
  const req = ['apiKey', 'apiSecret', 'token', 'tokenSecret'] as const;
  for (const f of req) {
    if (typeof k[f] !== 'string' || !(k[f] as string).trim()) return null;
  }
  return {
    apiKey: (k.apiKey as string).trim(),
    apiSecret: (k.apiSecret as string).trim(),
    token: (k.token as string).trim(),
    tokenSecret: (k.tokenSecret as string).trim(),
  };
}

export async function POST(req: NextRequest) {
  if (process.env.X_DELETE_ENABLED !== '1') {
    return NextResponse.json({ error: 'disabled' }, { status: 404 });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const keys = validateKeys((body as any).keys);
  if (!keys) return NextResponse.json({ error: 'invalid-keys' }, { status: 400 });

  try {
    let url: string;
    let method: 'GET' | 'DELETE' = 'GET';
    let query: Record<string, string> = {};

    switch (body.action) {
      case 'me':
        url = 'https://api.x.com/2/users/me';
        break;
      case 'list':
        if (!body.userId || !/^\d+$/.test(body.userId)) {
          return NextResponse.json({ error: 'bad-user-id' }, { status: 400 });
        }
        url = `https://api.x.com/2/users/${body.userId}/tweets`;
        query = {
          max_results: '100',
          'tweet.fields': 'created_at,public_metrics,referenced_tweets',
          exclude: 'retweets',
        };
        if (body.paginationToken) query.pagination_token = body.paginationToken;
        break;
      case 'delete':
        if (!body.tweetId || !/^\d+$/.test(body.tweetId)) {
          return NextResponse.json({ error: 'bad-tweet-id' }, { status: 400 });
        }
        url = `https://api.x.com/2/tweets/${body.tweetId}`;
        method = 'DELETE';
        break;
      default:
        return NextResponse.json({ error: 'bad-action' }, { status: 400 });
    }

    const auth = signOAuth1({
      method,
      url,
      consumerKey: keys.apiKey,
      consumerSecret: keys.apiSecret,
      token: keys.token,
      tokenSecret: keys.tokenSecret,
      queryParams: query,
    });

    const fetchUrl = Object.keys(query).length
      ? `${url}?${new URLSearchParams(query).toString()}`
      : url;

    const res = await fetch(fetchUrl, {
      method,
      headers: { Authorization: auth, Accept: 'application/json' },
    });

    const text = await res.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      data,
      rateLimit: {
        remaining: res.headers.get('x-rate-limit-remaining'),
        reset: res.headers.get('x-rate-limit-reset'),
        limit: res.headers.get('x-rate-limit-limit'),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'proxy-error', message: msg }, { status: 500 });
  }
}

export async function GET() {
  if (process.env.X_DELETE_ENABLED !== '1') {
    return NextResponse.json({ error: 'disabled' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, hint: 'POST only' });
}
