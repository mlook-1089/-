import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { genId, today, buildPlanTarget } from '@/lib/utils';
import { fireTriggers } from '@/lib/triggers';
import { tryAwardBadges } from '@/lib/badges';

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
      amount: plan.Amount||'', type: plan.Type||'conserve',
      status: 'Pending', source: 'Manual'
    });
    return NextResponse.json({ success: true, id });
  } catch (e: any) { return NextResponse.json({ success: false, message: e?.message }, { status: 500 }); }
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
    if (upd.Type !== undefined) patch.type = upd.Type;
    if (upd.Date !== undefined) patch.date = upd.Date;
    if (upd.Accomplishment_Status !== undefined) patch.status = upd.Accomplishment_Status;
    patch.dailyTarget = buildPlanTarget({
      fromSurah: patch.fromSurah ?? p.fromSurah, fromAyah: patch.fromAyah ?? p.fromAyah,
      toSurah: patch.toSurah ?? p.toSurah, toAyah: patch.toAyah ?? p.toAyah,
      amount: patch.amount ?? p.amount
    }) || upd.Daily_Target || p.dailyTarget;
    if (p.source === 'Nazem') patch.locked = true;
    await db.update(plans).set(patch).where(eq(plans.id, id));

    let awarded: any[] = [];
    if (upd.Accomplishment_Status === 'Done') {
      await tryAwardBadges(p.studentId);
      awarded = await fireTriggers(patch.type === 'revision' ? 'on_review_done' : 'on_done', p.studentId, teacher.id);
    } else if (upd.Accomplishment_Status === 'Partial') {
      awarded = await fireTriggers('on_partial', p.studentId, teacher.id);
    }
    return NextResponse.json({ success: true, awarded });
  } catch (e: any) { return NextResponse.json({ success: false, message: e?.message }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    await db.delete(plans).where(eq(plans.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ success: false, message: e?.message }, { status: 500 }); }
}
