import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { news } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { genId, today } from '@/lib/utils';

export async function POST(req: NextRequest) {
  await requireRole('Teacher');
  const { title, body, visibility } = await req.json();
  const id = genId('N');
  const rec = { id, title, body, visibility: visibility||'All', date: today() };
  await db.insert(news).values(rec);
  return NextResponse.json({ success: true, news: { News_ID: id, Title: title, Body: body, Visibility: rec.visibility, Date: rec.date } });
}
export async function DELETE(req: NextRequest) {
  await requireRole('Teacher');
  const { id } = await req.json();
  await db.delete(news).where(eq(news.id, id));
  return NextResponse.json({ success: true });
}
