import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData, plans, pointLogs, attendance, badges, pushSubscriptions, newsComments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, errorResponse, createSession, ForbiddenError } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const me = await requireRole('Teacher');
    const { oldId, newId } = await req.json();
    if (!oldId || !newId || oldId === newId) return NextResponse.json({ success: false, message: 'معرّفان مختلفان مطلوبان' }, { status: 400 });
    if (!/^[\w\-.]+$/.test(newId)) return NextResponse.json({ success: false, message: 'المعرّف يحتوي على أحرف غير مسموح بها' }, { status: 400 });

    const [oldUser] = await db.select().from(users).where(eq(users.id, oldId));
    if (!oldUser) return NextResponse.json({ success: false, message: 'المستخدم غير موجود' }, { status: 404 });
    if (oldUser.role === 'Teacher' && !me.isAdmin) throw new ForbiddenError('تغيير معرّفات المعلمين مقصور على المشرف');

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, newId));
    if (existing.length) return NextResponse.json({ success: false, message: 'المعرّف الجديد مستخدم مسبقاً' }, { status: 409 });

    // دفعة واحدة داخل معاملة: إما أن تنتقل كل الإشارات أو لا يتغيّر شيء.
    await db.batch([
      db.insert(users).values({
        id: newId, name: oldUser.name, role: oldUser.role,
        passwordHash: oldUser.passwordHash, mustChangePw: oldUser.mustChangePw ?? false,
        isAdmin: oldUser.isAdmin ?? false, sessionVersion: oldUser.sessionVersion ?? 0, createdAt: oldUser.createdAt
      }),
      db.update(studentsData).set({ studentId: newId }).where(eq(studentsData.studentId, oldId)),
      db.update(studentsData).set({ parentId: newId }).where(eq(studentsData.parentId, oldId)),
      db.update(plans).set({ studentId: newId }).where(eq(plans.studentId, oldId)),
      db.update(pointLogs).set({ studentId: newId }).where(eq(pointLogs.studentId, oldId)),
      db.update(pointLogs).set({ teacherId: newId }).where(eq(pointLogs.teacherId, oldId)),
      db.update(attendance).set({ studentId: newId }).where(eq(attendance.studentId, oldId)),
      db.update(badges).set({ studentId: newId }).where(eq(badges.studentId, oldId)),
      db.update(pushSubscriptions).set({ userId: newId }).where(eq(pushSubscriptions.userId, oldId)),
      db.update(newsComments).set({ userId: newId }).where(eq(newsComments.userId, oldId)),
      db.delete(users).where(eq(users.id, oldId))
    ] as any);

    // إن غيّر المعلم معرّفه هو، نصدر له جلسة بالمعرّف الجديد حتى لا يُطرد.
    if (oldId === me.id) await createSession({ ...oldUser, id: newId });

    return NextResponse.json({ success: true, newId });
  } catch (e: any) {
    return errorResponse(e);
  }
}
