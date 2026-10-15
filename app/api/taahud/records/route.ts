import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taahudRecords, taahudAssignments, settings } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId } from '@/lib/utils';

/**
 * رصد سرد حزب. ينشئ سجلاً جديداً (الإسناد يُسرد مرة واحدة فقط — UNIQUE على assignmentId).
 * body: { assignmentId, mistakes, warnings }
 * نحسب الدرجة لحظة الرصد ونخزّن لقطة الإعدادات.
 */
export async function POST(req: NextRequest) {
  try {
    const s = await requireRole('Teacher');
    const { assignmentId, mistakes, warnings } = await req.json();
    if (!assignmentId) return NextResponse.json({ success: false, message: 'assignmentId مطلوب' }, { status: 400 });

    const assign = (await db.select().from(taahudAssignments).where(eq(taahudAssignments.id, assignmentId)))[0];
    if (!assign) return NextResponse.json({ success: false, message: 'الإسناد غير موجود' }, { status: 404 });

    const existing = (await db.select().from(taahudRecords).where(eq(taahudRecords.assignmentId, assignmentId)))[0];
    if (existing) return NextResponse.json({ success: false, message: 'هذا الحزب رُصد مسبقاً' }, { status: 409 });

    // اقرأ الإعدادات لحظة الرصد
    const cfgRows = await db.select().from(settings).where(inArray(settings.key, ['taahud_total_per_hizb', 'taahud_deduct_per_mistake', 'taahud_deduct_per_warning']));
    const cfg: Record<string, string> = {};
    cfgRows.forEach(r => { cfg[r.key] = r.value || ''; });
    const totalPoints = Math.max(0, Math.round(Number(cfg.taahud_total_per_hizb || 100)));
    const deductPerMistake = Math.max(0, Math.round(Number(cfg.taahud_deduct_per_mistake || 2)));
    const deductPerWarning = Math.max(0, Math.round(Number(cfg.taahud_deduct_per_warning || 1)));

    const m = Math.max(0, Math.round(Number(mistakes) || 0));
    const w = Math.max(0, Math.round(Number(warnings) || 0));
    const score = Math.max(0, totalPoints - (m * deductPerMistake) - (w * deductPerWarning));

    const id = genId('TR');
    await db.insert(taahudRecords).values({
      id, assignmentId, teacherId: s.id,
      mistakes: m, warnings: w,
      totalPoints, deductPerMistake, deductPerWarning, score
    });

    return NextResponse.json({
      success: true,
      record: { id, assignmentId, teacherId: s.id, mistakes: m, warnings: w, totalPoints, deductPerMistake, deductPerWarning, score }
    });
  } catch (e: any) { return errorResponse(e); }
}

/* حذف سجل رصد (ليتمكن المعلم من إعادة الرصد). */
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: 'المعرّف مطلوب' }, { status: 400 });
    await db.delete(taahudRecords).where(eq(taahudRecords.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}
