import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId, today, buildPlanTarget, SURAHS, SURAH_AYAH_COUNT } from '@/lib/utils';
import { applyPlanStatus, revokeRefs } from '@/lib/triggers';

// مسار «الإتقان» أُلغي من الخلفية؛ نقتصر على حفظ ومراجعة، وأي قيمة قادمة
// mastery تُطوى إلى conserve حتى لا يُكتب النوع الملغى من جديد.
function normType(t: any): 'conserve' | 'revision' {
  return String(t || '').toLowerCase() === 'revision' ? 'revision' : 'conserve';
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { studentId, plan } = await req.json();
    const id = genId('P');
    const dailyTarget = buildPlanTarget({
      fromSurah: plan.From_Surah, fromAyah: plan.From_Ayah,
      toSurah: plan.To_Surah, toAyah: plan.To_Ayah, amount: plan.Amount
    }) || plan.Daily_Target || 'مراجعة وتسميع';
    await db.insert(plans).values({
      id, studentId, date: plan.Date || today(),
      dailyTarget, fromSurah: plan.From_Surah||'', fromAyah: plan.From_Ayah||'',
      toSurah: plan.To_Surah||'', toAyah: plan.To_Ayah||'',
      amount: plan.Amount||'', type: normType(plan.Type),
      status: 'Pending', source: 'Manual'
    });
    return NextResponse.json({ success: true, id });
  } catch (e: any) { return errorResponse(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { id, upd } = await req.json();
    const p = (await db.select().from(plans).where(eq(plans.id, id)))[0];
    if (!p) return NextResponse.json({ success: false, message: 'الخطة غير موجودة' });
    const patch: any = {};
    if (upd.From_Surah !== undefined) patch.fromSurah = upd.From_Surah;
    if (upd.From_Ayah !== undefined) patch.fromAyah = upd.From_Ayah;
    if (upd.To_Surah !== undefined) patch.toSurah = upd.To_Surah;
    if (upd.To_Ayah !== undefined) patch.toAyah = upd.To_Ayah;
    if (upd.Amount !== undefined) patch.amount = upd.Amount;
    if (upd.Type !== undefined) patch.type = normType(upd.Type);
    if (upd.Date !== undefined) patch.date = upd.Date;
    if (upd.Accomplishment_Status !== undefined) {
      if (!['Pending', 'Done', 'Partial', 'Missed'].includes(upd.Accomplishment_Status)) return NextResponse.json({ success: false, message: 'حالة غير صالحة' }, { status: 400 });
      patch.status = upd.Accomplishment_Status;
    }
    // التحقق من صحة حدود الآيات عند تعديل النطاق
    const fsName = patch.fromSurah ?? p.fromSurah;
    const tsName = patch.toSurah ?? p.toSurah;
    if (patch.fromSurah !== undefined || patch.fromAyah !== undefined) {
      const si = SURAHS.indexOf(String(fsName || ''));
      const fa = Number(patch.fromAyah ?? p.fromAyah);
      if (si < 0) return NextResponse.json({ success: false, message: 'اسم سورة البداية غير صالح' }, { status: 400 });
      if (fa > SURAH_AYAH_COUNT[si]) return NextResponse.json({ success: false, message: `آية البداية تتجاوز آيات سورة ${fsName} (${SURAH_AYAH_COUNT[si]})` }, { status: 400 });
    }
    if (patch.toSurah !== undefined || patch.toAyah !== undefined) {
      const si = SURAHS.indexOf(String(tsName || ''));
      const ta = Number(patch.toAyah ?? p.toAyah);
      if (si < 0) return NextResponse.json({ success: false, message: 'اسم سورة النهاية غير صالح' }, { status: 400 });
      if (ta > SURAH_AYAH_COUNT[si]) return NextResponse.json({ success: false, message: `آية النهاية تتجاوز آيات سورة ${tsName} (${SURAH_AYAH_COUNT[si]})` }, { status: 400 });
    }

    patch.dailyTarget = buildPlanTarget({
      fromSurah: patch.fromSurah ?? p.fromSurah, fromAyah: patch.fromAyah ?? p.fromAyah,
      toSurah: patch.toSurah ?? p.toSurah, toAyah: patch.toAyah ?? p.toAyah,
      amount: patch.amount ?? p.amount
    }) || upd.Daily_Target || p.dailyTarget;
    if (p.source === 'Nazem') patch.locked = true;
    await db.update(plans).set(patch).where(eq(plans.id, id));

    // تغيّر الحالة → نسحب نقاط الحالة السابقة ونمنح نقاط الجديدة (مرة واحدة لكل ورد).
    let awarded: any[] = [];
    if (upd.Accomplishment_Status !== undefined) {
      awarded = await applyPlanStatus({ id: p.id, studentId: p.studentId, type: patch.type ?? p.type }, p.status, upd.Accomplishment_Status, teacher.id);
    }
    return NextResponse.json({ success: true, awarded });
  } catch (e: any) { return errorResponse(e); }
}

/**
 * حذف ورد واحد { id }، أو كل الأوراد اليدوية لطالب { studentId, source: 'Manual' }
 * (بطلب واحد بدل طلب لكل ورد — كان مسح خطة فصل كامل يستغرق دقائق على الجوال).
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id, studentId, source, type } = await req.json();
    if (id) {
      // حذف ورد بعينه (غالباً أُضيف خطأً) → تُسحب نقاطه أيضاً
      const ids = (await db.delete(plans).where(eq(plans.id, id)).returning({ id: plans.id })).map(r => r.id);
      await revokeRefs(ids.map(pid => 'plan:' + pid));
      return NextResponse.json({ success: true, deleted: ids.length });
    }
    if (studentId && source === 'Manual') {
      // مسح الخطة كاملة لإعادة بنائها: لا نسحب نقاط أيام سُمّعت فعلاً.
      // type اختياري: يقصر الحذف على خطة الحفظ أو المراجعة وحدها.
      const conds = [eq(plans.studentId, studentId), eq(plans.source, 'Manual')];
      if (type === 'conserve' || type === 'revision') conds.push(eq(plans.type, type));
      const ids = (await db.delete(plans).where(and(...conds)).returning({ id: plans.id }));
      return NextResponse.json({ success: true, deleted: ids.length });
    }
    return NextResponse.json({ success: false, message: 'بيانات الحذف ناقصة' }, { status: 400 });
  } catch (e: any) { return errorResponse(e); }
}
