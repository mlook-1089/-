import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { news, events } from '@/db/schema';
import { or, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  await requireSession();
  const role = new URL(req.url).searchParams.get('role') || 'Student';
  const aud = role === 'Parent' ? 'Parents' : 'Students';
  const newsRows = await db.select().from(news).where(or(eq(news.visibility, 'All'), eq(news.visibility, aud)));
  const eventRows = await db.select().from(events);
  return NextResponse.json({
    news: newsRows.map(n => ({ News_ID: n.id, Title: n.title, Body: n.body, Visibility: n.visibility, Date: String(n.date) })).sort((a, b) => b.Date.localeCompare(a.Date)),
    events: eventRows.map(e => ({ Event_ID: e.id, Title: e.title, Description: e.description, Date: String(e.date), Type: e.type })).sort((a, b) => a.Date.localeCompare(b.Date))
  });
}
