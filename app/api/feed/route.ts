import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { news, events } from '@/db/schema';
import { or, eq } from 'drizzle-orm';
import { requireSession, AuthError } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // الدور يُشتق من الجلسة فقط — يُتجاهل أي معامل role في الاستعلام (منع كشف إعلانات فئة أخرى).
    const s = await requireSession();
    const role = s.role;
    // المعلم يرى كل الإعلانات، وليّ الأمر All+Parents، والطالب All+Students.
    const newsRows = role === 'Teacher'
      ? await db.select().from(news)
      : await db.select().from(news).where(or(eq(news.visibility, 'All'), eq(news.visibility, role === 'Parent' ? 'Parents' : 'Students')));
    const eventRows = await db.select().from(events);
    return NextResponse.json({
      news: newsRows.map(n => ({ News_ID: n.id, Title: n.title, Body: n.body, Visibility: n.visibility, Type: n.type || 'post', Video_URL: n.videoUrl || '', Date: String(n.date) })).sort((a, b) => b.Date.localeCompare(a.Date)),
      events: eventRows.map(e => ({ Event_ID: e.id, Title: e.title, Description: e.description, Date: String(e.date), Type: e.type })).sort((a, b) => a.Date.localeCompare(b.Date))
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
