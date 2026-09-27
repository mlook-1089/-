import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { news, users } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';
import { genId, today } from '@/lib/utils';
import { notifyUsers } from '@/lib/push';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { title, body, visibility } = await req.json();
    const id = genId('N');
    const vis = visibility || 'All';
    const rec = { id, title, body, visibility: vis, date: today() };
    await db.insert(news).values(rec);

    // إرسال إشعار للجمهور المناسب — لا يُفشل نشر الخبر إن تعثّر الإرسال
    try {
      const roles = vis === 'Students' ? ['Student']
        : vis === 'Parents' ? ['Parent']
        : ['Student', 'Parent']; // All
      const targets = await db.select({ id: users.id }).from(users).where(inArray(users.role, roles));
      const ids = targets.map((u) => u.id);
      const excerpt = String(body || '').slice(0, 120);
      await notifyUsers(ids, { title, body: excerpt, url: '/', tag: 'news' }, 'news');
    } catch (e) {
      console.error('push news notify failed', e);
    }

    return NextResponse.json({ success: true, news: { News_ID: id, Title: title, Body: body, Visibility: rec.visibility, Date: rec.date } });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    console.error(e);
    return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    await db.delete(news).where(eq(news.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    console.error(e);
    return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
  }
}
