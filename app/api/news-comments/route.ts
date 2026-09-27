import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { newsComments, users } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireSession, AuthError } from '@/lib/auth';
import { genId } from '@/lib/utils';

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const newsId = req.nextUrl.searchParams.get('id');
    if (!newsId) return NextResponse.json({ success: false, message: 'id مطلوب' }, { status: 400 });
    const rows = await db.select().from(newsComments).where(eq(newsComments.newsId, newsId)).orderBy(asc(newsComments.date));
    return NextResponse.json({
      success: true,
      comments: rows.map(c => ({ id: c.id, newsId: c.newsId, userId: c.userId, userName: c.userName, body: c.body, date: c.date }))
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const { newsId, body } = await req.json();
    if (!newsId || !body?.trim()) return NextResponse.json({ success: false, message: 'بيانات ناقصة' }, { status: 400 });
    const userRow = await db.select({ name: users.name }).from(users).where(eq(users.id, s.id));
    const userName = userRow[0]?.name || s.id;
    const id = genId('C');
    await db.insert(newsComments).values({ id, newsId, userId: s.id, userName, body: body.trim() });
    return NextResponse.json({ success: true, comment: { id, newsId, userId: s.id, userName, body: body.trim(), date: new Date() } });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
