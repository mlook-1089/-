import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, attendance } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';

/** خطط وحضور يوم واحد — للأيام الأقدم من نافذة /api/teacher-data. نفس شكل الحقول هناك. */
export async function GET(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const date = new URL(req.url).searchParams.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ success: false, message: 'تاريخ غير صالح' }, { status: 400 });
    const [pl, at] = await Promise.all([
      db.select().from(plans).where(eq(plans.date, date)),
      db.select().from(attendance).where(eq(attendance.date, date))
    ]);
    return NextResponse.json({
      success: true, date,
      plans: pl.map(p => ({
        Plan_ID: p.id, Student_ID: p.studentId, Date: String(p.date),
        Daily_Target: p.dailyTarget, From_Surah: p.fromSurah, From_Ayah: p.fromAyah,
        To_Surah: p.toSurah, To_Ayah: p.toAyah, Amount: p.amount, Type: p.type,
        Accomplishment_Status: p.status, Source: p.source, Locked: p.locked ? 'TRUE' : '',
        Nazem_Item_Day_ID: p.nazemItemDayId, Mistakes: p.mistakes, Hearing: p.hearing,
        Repetition: p.repetition, Link: p.link
      })),
      attendance: at.map(x => ({ Att_ID: x.id, Student_ID: x.studentId, Date: String(x.date), Status: x.status, Note: x.note }))
    });
  } catch (e: any) { return errorResponse(e); }
}
