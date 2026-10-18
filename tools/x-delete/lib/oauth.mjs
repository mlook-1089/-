import crypto from 'node:crypto';

/**
 * توقيع OAuth 1.0a لطلبات X API v2 التي تتطلب "user context"
 * (مثل DELETE /2/tweets/:id).
 */
export function signRequest({ method, url, consumerKey, consumerSecret, token, tokenSecret, params = {} }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  const allParams = { ...params, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${encode(k)}=${encode(allParams[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encode(url),
    encode(paramString),
  ].join('&');

  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;

  const header = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((k) => `${encode(k)}="${encode(oauthParams[k])}"`)
    .join(', ');

  return header;
}

function encode(s) {
  return encodeURIComponent(String(s))
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}
