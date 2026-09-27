import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { badges } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId, today } from '@/lib/utils';

/* منح شارة يدوياً لطالب */
export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { studentId, title, icon, code } = await req.json();
    if (!studentId || !title) return NextResponse.json({ success: false, message: 'الطالب والعنوان مطلوبان' }, { status: 400 });
    const id = genId('B');
    const c = code || ('MANUAL_' + Date.now());
    const ic = icon || '🏅';
    const d = today();
    const ins = await db.insert(badges).values({ id, studentId, code: c, title, icon: ic, date: d }).onConflictDoNothing().returning({ id: badges.id });
    if (!ins.length) return NextResponse.json({ success: false, message: 'الطالب يملك هذه الشارة مسبقاً' }, { status: 409 });
    return NextResponse.json({ success: true, badge: { Badge_ID: id, Student_ID: studentId, Code: c, Title: title, Icon: ic, Date: d } });
  } catch (e: any) { return errorResponse(e); }
}

/* سحب (حذف) شارة */
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: 'المعرّف مطلوب' }, { status: 400 });
    await db.delete(badges).where(eq(badges.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}
