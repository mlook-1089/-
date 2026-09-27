import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, AuthError, errorResponse } from '@/lib/auth';
import { genId, today } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { title, description, date, type } = await req.json();
    const id = genId('E');
    const rec = { id, title, description: description||'', date: date || today(), type: type||'عام' };
    await db.insert(events).values(rec);
    return NextResponse.json({ success: true, event: { Event_ID: id, Title: title, Description: rec.description, Date: rec.date, Type: rec.type } });
  } catch (e: any) { return errorResponse(e); }
}
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    await db.delete(events).where(eq(events.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}
