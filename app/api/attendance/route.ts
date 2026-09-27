import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attendance } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';
import { genId, today } from '@/lib/utils';
import { fireTriggers } from '@/lib/triggers';
import { notifyAbsence } from '@/lib/push';

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { studentId, date, status, note } = await req.json();
    const d = date || today();
    const existing = (await db.select().from(attendance)
      .where(and(eq(attendance.studentId, studentId), eq(attendance.date, d))))[0];
    const isNew = !existing;
    const changed = !existing || existing.status !== status;
    if (existing) await db.update(attendance).set({ status, note: note||'' }).where(eq(attendance.id, existing.id));
    else await db.insert(attendance).values({ id: genId('A'), studentId, date: d, status, note: note||'' });
    let awarded: any[] = [];
    if (isNew || changed) {
      if (status === 'Present') awarded = await fireTriggers('on_attend_present', studentId, teacher.id);
      else if (status === 'Late') awarded = await fireTriggers('on_attend_late', studentId, teacher.id);
      if (status === 'Absent') {
        try { await notifyAbsence(studentId, d); } catch {}
      }
    }
    return NextResponse.json({ success: true, awarded });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
