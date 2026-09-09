import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attendance } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { genId, today } from '@/lib/utils';

export async function POST(req: NextRequest) {
  await requireRole('Teacher');
  const { date, list } = await req.json();
  const d = date || today();
  let count = 0;
  for (const x of (list || [])) {
    const existing = (await db.select().from(attendance).where(and(eq(attendance.studentId, x.Student_ID), eq(attendance.date, d))))[0];
    if (existing) await db.update(attendance).set({ status: x.Status, note: x.Note||'' }).where(eq(attendance.id, existing.id));
    else await db.insert(attendance).values({ id: genId('A'), studentId: x.Student_ID, date: d, status: x.Status, note: x.Note||'' });
    count++;
  }
  return NextResponse.json({ success: true, count });
}
