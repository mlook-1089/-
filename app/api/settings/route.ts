import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireRole, getSession, AuthError } from '@/lib/auth';

const PUBLIC_KEYS = new Set(['logo_url', 'halaqa_name', 'halaqa_tagline']);
const ALLOWED_SET = new Set(['logo_url', 'halaqa_name', 'halaqa_tagline', 'nz_term', 'nz_plan', 'push_enabled', 'push_audience', 'push_news_enabled', 'push_absence_enabled']);

export async function GET(req: NextRequest) {
  try {
    const keys = new URL(req.url).searchParams.get('keys')?.split(',') || [];
    const s = await getSession();
    const values: Record<string,string> = {};

    if (!s) {
      // بدون جلسة: أرجع فقط المفاتيح العامة (رشّح المطلوب على PUBLIC_KEYS، أو كل العامة إن لم تُطلب مفاتيح)
      const wanted = keys.length ? keys.filter(k => PUBLIC_KEYS.has(k)) : [...PUBLIC_KEYS];
      const rows = wanted.length ? await db.select().from(settings).where(inArray(settings.key, wanted)) : [];
      wanted.forEach(k => { values[k] = ''; });
      rows.forEach(r => { values[r.key] = r.value || ''; });
      return NextResponse.json({ success: true, values });
    }

    // مع جلسة: السلوك الحالي (المفاتيح المطلوبة، أو كل الصفوف إن لم تُطلب مفاتيح)
    const rows = keys.length ? await db.select().from(settings).where(inArray(settings.key, keys)) : await db.select().from(settings);
    keys.forEach(k => { values[k] = ''; });
    rows.forEach(r => { values[r.key] = r.value || ''; });
    return NextResponse.json({ success: true, values });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { key, value } = await req.json();
    if (!ALLOWED_SET.has(key)) return NextResponse.json({ success: false, message: 'مفتاح غير مسموح' }, { status: 400 });
    const existing = (await db.select().from(settings).where(eq(settings.key, key)))[0];
    if (existing) await db.update(settings).set({ value }).where(eq(settings.key, key));
    else await db.insert(settings).values({ key, value });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
