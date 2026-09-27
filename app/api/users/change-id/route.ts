import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData, plans, pointLogs, attendance, badges, pushSubscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { oldId, newId } = await req.json();
    if (!oldId || !newId || oldId === newId) return NextResponse.json({ success: false, message: 'معرّفان مختلفان مطلوبان' }, { status: 400 });
    if (!/^[\w_\-\.]+$/.test(newId)) return NextResponse.json({ success: false, message: 'المعرّف يحتوي على أحرف غير مسموح بها' }, { status: 400 });

    const [oldUser] = await db.select().from(users).where(eq(users.id, oldId));
    if (!oldUser) return NextResponse.json({ success: false, message: 'المستخدم غير موجود' }, { status: 404 });

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, newId));
    if (existing.length) return NextResponse.json({ success: false, message: 'المعرّف الجديد مستخدم مسبقاً' }, { status: 409 });

    // نُنشئ المستخدم الجديد أولاً، ثم ننقل الإشارات، ثم نحذف القديم
    await db.insert(users).values({
      id: newId, name: oldUser.name, role: oldUser.role,
      passwordHash: oldUser.passwordHash, mustChangePw: oldUser.mustChangePw ?? false,
      isAdmin: oldUser.isAdmin ?? false, createdAt: oldUser.createdAt
    });

    // نقل بيانات الطالب (student_id)
    await db.update(studentsData).set({ studentId: newId }).where(eq(studentsData.studentId, oldId));
    // نقل ولي الأمر إن كان هو المستخدم القديم (parent_id)
    await db.update(studentsData).set({ parentId: newId }).where(eq(studentsData.parentId, oldId));
    // نقل الخطط
    await db.update(plans).set({ studentId: newId }).where(eq(plans.studentId, oldId));
    // نقل سجلات النقاط (بدون FK)
    await db.update(pointLogs).set({ studentId: newId }).where(eq(pointLogs.studentId, oldId));
    // نقل الحضور
    await db.update(attendance).set({ studentId: newId }).where(eq(attendance.studentId, oldId));
    // نقل الشارات
    await db.update(badges).set({ studentId: newId }).where(eq(badges.studentId, oldId));
    // نقل اشتراكات الإشعارات
    await db.update(pushSubscriptions).set({ userId: newId }).where(eq(pushSubscriptions.userId, oldId));

    // الآن نحذف المستخدم القديم (لا توجد إشارات متبقية)
    await db.delete(users).where(eq(users.id, oldId));

    return NextResponse.json({ success: true, newId });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    console.error('change-id error', e);
    return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
  }
}
