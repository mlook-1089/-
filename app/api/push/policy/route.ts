import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings, users } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireRole, AuthError, errorResponse } from '@/lib/auth';

type Audience = 'all' | 'students' | 'parents' | 'students_parents';
const AUD_VALUES: Audience[] = ['all', 'students', 'parents', 'students_parents'];

async function readPolicy() {
  const rows = await db.select().from(settings).where(inArray(settings.key, [
    'push_enabled', 'push_audience', 'push_news_enabled', 'push_absence_enabled'
  ]));
  const map: Record<string, string> = {};
  rows.forEach(r => { map[r.key] = r.value || ''; });
  const enabled = map['push_enabled'] === undefined || map['push_enabled'] === '' ? true : map['push_enabled'] === 'true';
  const rawAud = (map['push_audience'] || '') as Audience;
  const audience: Audience = AUD_VALUES.includes(rawAud) ? rawAud : 'all';
  const news = map['push_news_enabled'] === undefined || map['push_news_enabled'] === '' ? true : map['push_news_enabled'] === 'true';
  const absence = map['push_absence_enabled'] === undefined || map['push_absence_enabled'] === '' ? true : map['push_absence_enabled'] === 'true';
  return { enabled, audience, news, absence };
}

async function upsertSetting(key: string, value: string) {
  const existing = (await db.select().from(settings).where(eq(settings.key, key)))[0];
  if (existing) await db.update(settings).set({ value }).where(eq(settings.key, key));
  else await db.insert(settings).values({ key, value });
}

export async function GET(_req: NextRequest) {
  try {
    await requireRole('Teacher');
    const policy = await readPolicy();
    return NextResponse.json({ success: true, policy });
  } catch (e: any) { return errorResponse(e); }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireRole('Teacher');
    const meRow = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
    if (!meRow?.isAdmin) return NextResponse.json({ success: false, message: 'مقصور على المشرف' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { enabled, audience, news, absence } = body || {};

    if (enabled !== undefined) {
      await upsertSetting('push_enabled', enabled ? 'true' : 'false');
    }
    if (audience !== undefined) {
      if (!AUD_VALUES.includes(audience)) {
        return NextResponse.json({ success: false, message: 'جمهور غير مسموح' }, { status: 400 });
      }
      await upsertSetting('push_audience', String(audience));
    }
    if (news !== undefined) {
      await upsertSetting('push_news_enabled', news ? 'true' : 'false');
    }
    if (absence !== undefined) {
      await upsertSetting('push_absence_enabled', absence ? 'true' : 'false');
    }

    const policy = await readPolicy();
    return NextResponse.json({ success: true, policy });
  } catch (e: any) { return errorResponse(e); }
}
