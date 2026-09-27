import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attendance } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId, today } from '@/lib/utils';
import { applyAttendanceStatus } from '@/lib/triggers';
import { notifyAbsence } from '@/lib/push';

const STATUSES = ['Present', 'Late', 'Absent'];

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { studentId, date, status, note } = await req.json();
    if (!studentId || !STATUSES.includes(status)) return NextResponse.json({ success: false, message: 'بيانات الحضور غير صالحة' }, { status: 400 });
    const d = date || today();
    const existing = (await db.select().from(attendance)
      .where(and(eq(attendance.studentId, studentId), eq(attendance.date, d))))[0];
    let attId = existing?.id;
    if (existing) {
      await db.update(attendance).set({ status, note: note || '' }).where(eq(attendance.id, existing.id));
    } else {
      attId = genId('A');
      // القيد الفريد (طالب+تاريخ) يمنع التكرار عند النقر المزدوج؛ نعيد قراءة الصف إن سبقنا طلب آخر.
      const ins = await db.insert(attendance).values({ id: attId, studentId, date: d, status, note: note || '' }).onConflictDoNothing().returning({ id: attendance.id });
      if (!ins.length) return NextResponse.json({ success: true, awarded: [] });
    }
    const awarded = await applyAttendanceStatus(attId!, studentId, existing?.status, status, teacher.id);
    if (status === 'Absent' && existing?.status !== 'Absent') {
      try { await notifyAbsence(studentId, d); } catch {}
    }
    return NextResponse.json({ success: true, awarded });
  } catch (e: any) {
    return errorResponse(e);
  }
}
