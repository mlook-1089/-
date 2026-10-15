import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taahudPeriods } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId } from '@/lib/utils';

/* إنشاء فترة جديدة. يُؤرشف الفترة النشطة تلقائياً. */
export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { name, startDate, endDate } = await req.json();
    const nm = String(name || '').trim();
    if (!nm) return NextResponse.json({ success: false, message: 'الاسم مطلوب' }, { status: 400 });

    // أرشف أي فترة نشطة
    await db.update(taahudPeriods).set({ status: 'archived' }).where(eq(taahudPeriods.status, 'active'));

    const id = genId('TP');
    const vals: any = { id, name: nm, status: 'active' };
    if (startDate) vals.startDate = String(startDate);
    if (endDate) vals.endDate = String(endDate);
    await db.insert(taahudPeriods).values(vals);
    return NextResponse.json({ success: true, id });
  } catch (e: any) { return errorResponse(e); }
}

/* تعديل فترة: الاسم، التواريخ، أو تفعيل/أرشفة. */
export async function PATCH(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id, name, startDate, endDate, status } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: 'المعرّف مطلوب' }, { status: 400 });
    const upd: any = {};
    if (name !== undefined) upd.name = String(name).trim();
    if (startDate !== undefined) upd.startDate = startDate ? String(startDate) : null;
    if (endDate !== undefined) upd.endDate = endDate ? String(endDate) : null;
    if (status !== undefined) {
      if (!['active', 'archived'].includes(String(status))) return NextResponse.json({ success: false, message: 'حالة غير صحيحة' }, { status: 400 });
      // إن أردنا تنشيط فترة، أرشف غيرها أولاً
      if (status === 'active') {
        await db.update(taahudPeriods).set({ status: 'archived' }).where(eq(taahudPeriods.status, 'active'));
      }
      upd.status = String(status);
    }
    if (!Object.keys(upd).length) return NextResponse.json({ success: false, message: 'لا تغييرات' }, { status: 400 });
    await db.update(taahudPeriods).set(upd).where(eq(taahudPeriods.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}

/* حذف فترة (ومعها إسناداتها وسجلاتها بالكاسكيد). */
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: 'المعرّف مطلوب' }, { status: 400 });
    await db.delete(taahudPeriods).where(eq(taahudPeriods.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}
