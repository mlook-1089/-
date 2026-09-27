import { db } from './db';
import { nazemSession } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

export const NAZEM_API = 'https://api.nazem-plus.com';
export const NAZEM_ORIGIN = 'https://nazem-plus.com';

// المفتاح يُشتق عند أول استخدام، ولا قيمة احتياطية (وإلا شُفّرت كلمة ناظم بمفتاح معروف).
let _key: Buffer | null = null;
function key(): Buffer {
  if (_key) return _key;
  const s = process.env.SESSION_SECRET || '';
  if (s.trim().length < 32) throw new Error('SESSION_SECRET غير مضبوط');
  _key = crypto.scryptSync(s, 'nazem-salt', 32);
  return _key;
}

function enc(text: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}
function dec(payload: string) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12); const tag = buf.subarray(12, 28); const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

async function loadSession() {
  const rows = await db.select().from(nazemSession).where(eq(nazemSession.id, 1));
  return rows[0] || null;
}
async function saveSession(s: { username?: string; passwordEnc?: string; cookies?: any; xsrf?: string }) {
  const existing = await loadSession();
  if (existing) {
    await db.update(nazemSession).set({ ...s, updatedAt: new Date() }).where(eq(nazemSession.id, 1));
  } else {
    await db.insert(nazemSession).values({ id: 1, username: s.username||'', passwordEnc: s.passwordEnc||'', cookies: s.cookies||{}, xsrf: s.xsrf||'', updatedAt: new Date() });
  }
}
export async function clearNazemSession() {
  const existing = await loadSession();
  if (existing) await db.update(nazemSession).set({ cookies: {}, xsrf: '' }).where(eq(nazemSession.id, 1));
}
export async function clearNazemCredentials() {
  await db.update(nazemSession).set({ username: '', passwordEnc: '', cookies: {}, xsrf: '' }).where(eq(nazemSession.id, 1));
}

function cookieHeader(cookies: Record<string,string>) {
  return Object.keys(cookies||{}).map(k => `${k}=${cookies[k]}`).join('; ');
}
function mergeSetCookie(setCookie: string[] | string | null | undefined, current: Record<string,string>) {
  if (!setCookie) return { cookies: current, xsrf: undefined as string | undefined };
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  const map = { ...current };
  let xsrf: string | undefined;
  for (const line of arr) {
    const first = line.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) {
      const n = first.slice(0, eq).trim(); const v = first.slice(eq + 1).trim();
      map[n] = v;
      if (n === 'XSRF-TOKEN') xsrf = decodeURIComponent(v);
    }
  }
  return { cookies: map, xsrf };
}

async function nzFetch(path: string, opts: { method?: string; body?: string; contentType?: string } = {}) {
  const s = await loadSession();
  const headers: Record<string,string> = {
    'Origin': NAZEM_ORIGIN, 'Referer': NAZEM_ORIGIN + '/',
    'Accept': 'application/json, text/plain, */*'
  };
  const cookies = (s?.cookies as Record<string,string>) || {};
  const ck = cookieHeader(cookies);
  if (ck) headers['Cookie'] = ck;
  if (s?.xsrf && (opts.method || 'get').toLowerCase() !== 'get') headers['X-XSRF-TOKEN'] = s.xsrf;
  if (opts.contentType) headers['Content-Type'] = opts.contentType;
  const res = await fetch(NAZEM_API + path, {
    method: opts.method || 'GET', headers, body: opts.body, redirect: 'manual'
  });
  // Merge set-cookie
  const setCookie: string[] = [];
  res.headers.forEach((v, k) => { if (k.toLowerCase() === 'set-cookie') setCookie.push(v); });
  // @ts-ignore — Node 20 provides getSetCookie
  if (typeof (res.headers as any).getSetCookie === 'function') {
    setCookie.push(...(res.headers as any).getSetCookie());
  }
  const merged = mergeSetCookie(setCookie, cookies);
  await saveSession({ cookies: merged.cookies, xsrf: merged.xsrf ?? s?.xsrf ?? '' });
  return res;
}

async function isLoggedIn() {
  const s = await loadSession();
  const cookies = (s?.cookies as Record<string,string>) || {};
  return Object.keys(cookies).some(k => k.indexOf('_session') !== -1 || k === 'laravel_session');
}

export async function nzEnsureLogin() {
  if (await isLoggedIn()) {
    const r = await nzFetch('/api/user');
    if (r.status === 200) return true;
  }
  const s = await loadSession();
  if (!s?.username || !s?.passwordEnc) throw new Error('بيانات دخول ناظم غير محفوظة');
  await clearNazemSession();
  await nzFetch('/api/csrf-cookie');
  const password = dec(s.passwordEnc);
  const r = await nzFetch('/api/login', {
    method: 'POST', contentType: 'application/json',
    body: JSON.stringify({ username: s.username, password, remember: true })
  });
  if (r.status !== 200) {
    const j = await r.json().catch(() => null);
    throw new Error((j?.message) || `فشل الدخول ${r.status}`);
  }
  return true;
}

export async function nzSaveCredentials(u: string, p: string) {
  await saveSession({ username: u, passwordEnc: enc(p), cookies: {}, xsrf: '' });
}

export async function nzStatus() {
  const s = await loadSession();
  return {
    configured: !!(s?.username && s?.passwordEnc),
    user: s?.username || '',
    linked: await isLoggedIn()
  };
}

export async function nzTest() {
  await nzEnsureLogin();
  const r = await nzFetch('/api/user');
  return { user: await r.json().catch(() => ({})) };
}

export async function nzTerms() {
  await nzEnsureLogin();
  const r = await nzFetch('/api/terms');
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const arr = j?.data || (Array.isArray(j) ? j : []);
  return arr.map((t: any) => ({ id: t.id, name: t.name || t.title || String(t.id) }));
}

export async function nzPlans(termId: string) {
  await nzEnsureLogin();
  const r = await nzFetch('/api/educational-plans?term=' + encodeURIComponent(termId || ''));
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return j?.data?.data || [];
}

export async function nzFollowUp(planId: string, date: string) {
  await nzEnsureLogin();
  const r = await nzFetch(`/api/educational-plans/${encodeURIComponent(planId)}/follow-up?date=${encodeURIComponent(date)}`);
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return j?.data || {};
}

export async function nzSavePartial(itemDayId: string, payload: any) {
  await nzEnsureLogin();
  await nzFetch('/api/csrf-cookie');
  const body = {
    actual_end_surah: Number(payload.actual_end_surah),
    actual_end_aya: Number(payload.actual_end_aya),
    mistake: Number(payload.mistake || 0),
    hearing: Number(payload.hearing || 0),
    repetition: Number(payload.repetition || 0),
    link: Number(payload.link || 0),
    attendance_status: Number(payload.attendance_status || 2)
  };
  const r = await nzFetch(`/api/educational-plans/item-days/${encodeURIComponent(itemDayId)}/partial`, {
    method: 'POST', contentType: 'application/json', body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  return { success: r.status === 200, code: r.status, message: j?.message || '', data: j?.data || null };
}
