import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans } from '@/db/schema';
import { and, eq, gte, lte, asc } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const type = (searchParams.get('type') || 'all').toLowerCase();

    if (!studentId) {
      return NextResponse.json({ success: false, message: 'studentId مطلوب' }, { status: 400 });
    }
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json({ success: false, message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ success: false, message: 'from يجب أن يسبق أو يساوي to' }, { status: 400 });
    }
    if (!['all', 'conserve', 'revision'].includes(type)) {
      return NextResponse.json({ success: false, message: 'نوع الخطة غير صالح' }, { status: 400 });
    }

    const conds = [
      eq(plans.studentId, studentId),
      gte(plans.date, from),
      lte(plans.date, to)
    ];
    if (type !== 'all') conds.push(eq(plans.type, type));

    const rows = await db.select().from(plans).where(and(...conds)).orderBy(asc(plans.date));

    return NextResponse.json({
      success: true,
      plans: rows.map(p => ({
        Plan_ID: p.id,
        Date: String(p.date),
        Type: p.type,
        Source: p.source,
        Locked: p.locked ? 'TRUE' : '',
        From_Surah: p.fromSurah,
        From_Ayah: p.fromAyah,
        To_Surah: p.toSurah,
        To_Ayah: p.toAyah,
        Amount: p.amount,
        Daily_Target: p.dailyTarget,
        Accomplishment_Status: p.status,
        Mistakes: p.mistakes,
        Hearing: p.hearing,
        Repetition: p.repetition
      }))
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
  }
}
