import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pointItems } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';
import { genId } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { description, pointValue, trigger } = await req.json();
    const id = genId('I');
    await db.insert(pointItems).values({ id, description, pointValue: Number(pointValue)||0, trigger: trigger||'none' });
    return NextResponse.json({ success: true, item: { Item_ID: id, Description: description, Point_Value: pointValue, Trigger: trigger||'none' } });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
export async function PATCH(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id, upd } = await req.json();
    const patch: any = {};
    if (upd.Description !== undefined) patch.description = upd.Description;
    if (upd.Point_Value !== undefined) patch.pointValue = Number(upd.Point_Value);
    if (upd.Trigger !== undefined) patch.trigger = upd.Trigger;
    await db.update(pointItems).set(patch).where(eq(pointItems.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    await db.delete(pointItems).where(eq(pointItems.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
