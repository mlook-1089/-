import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taahudAssignments, taahudRecords, taahudPeriods } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId } from '@/lib/utils';

/**
 * إسناد مجموعة أحزاب (مزامنة): نرسل القائمة الكاملة للأحزاب المطلوبة لطالب في فترة،
 * فنُضيف الجديد ونحذف ما لم يَعُد موجوداً — بشرط ألا يكون قد رُصد (محمي بالكاسكيد الذي يمنع فقدان البيانات).
 * body: { periodId, studentId, hizbs: number[] }
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { periodId, studentId, hizbs } = await req.json();
    if (!periodId || !studentId) return NextResponse.json({ success: false, message: 'periodId و studentId مطلوبان' }, { status: 400 });
    if (!Array.isArray(hizbs)) return NextResponse.json({ success: false, message: 'hizbs يجب أن تكون قائمة' }, { status: 400 });

    // تأكد أن الفترة موجودة
    const prow = (await db.select().from(taahudPeriods).where(eq(taahudPeriods.id, periodId)))[0];
    if (!prow) return NextResponse.json({ success: false, message: 'الفترة غير موجودة' }, { status: 404 });

    // نقّي وحوّل القائمة لأعداد صحيحة فريدة في المدى 1..60
    const want = Array.from(new Set(hizbs.map((n: any) => Number(n)).filter(n => Number.isInteger(n) && n >= 1 && n <= 60)));

    // الحالي
    const existing = await db.select().from(taahudAssignments).where(and(
      eq(taahudAssignments.periodId, periodId),
      eq(taahudAssignments.studentId, studentId)
    ));
    const existingNums = new Set(existing.map(e => e.hizbNumber));
    const wantSet = new Set(want);

    // أحزاب يجب حذفها (إن لم تكن مرصودة)
    const toRemove = existing.filter(e => !wantSet.has(e.hizbNumber));
    if (toRemove.length) {
      const ids = toRemove.map(e => e.id);
      // لا تحذف ما له سجل رصد
      const recs = await db.select({ assignmentId: taahudRecords.assignmentId }).from(taahudRecords).where(inArray(taahudRecords.assignmentId, ids));
      const recorded = new Set(recs.map(r => r.assignmentId));
      const safeIds = ids.filter(id => !recorded.has(id));
      if (safeIds.length) await db.delete(taahudAssignments).where(inArray(taahudAssignments.id, safeIds));
    }

    // أحزاب يجب إضافتها
    const toAdd = want.filter(n => !existingNums.has(n));
    if (toAdd.length) {
      const rows = toAdd.map(n => ({ id: genId('TA'), periodId, studentId, hizbNumber: n }));
      await db.insert(taahudAssignments).values(rows);
    }

    return NextResponse.json({ success: true, added: toAdd.length, removed: toRemove.length });
  } catch (e: any) { return errorResponse(e); }
}

/* حذف إسناد واحد (إن لم يكن مرصوداً). */
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: 'المعرّف مطلوب' }, { status: 400 });
    const rec = (await db.select().from(taahudRecords).where(eq(taahudRecords.assignmentId, id)))[0];
    if (rec) return NextResponse.json({ success: false, message: 'لا يمكن حذف حزب مرصود؛ احذف الرصد أولاً' }, { status: 409 });
    await db.delete(taahudAssignments).where(eq(taahudAssignments.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}
