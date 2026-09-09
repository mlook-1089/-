import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData, plans, pointLogs, attendance, badges, groups } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { genId } from '@/lib/utils';
import { hashPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const data = await req.json();
    if (!data?.Name || !data?.Password) return NextResponse.json({ success: false, message: 'الاسم وكلمة المرور مطلوبان' });
    const id = data.ID || genId('U');
    const existing = await db.select().from(users).where(eq(users.id, id));
    if (existing.length) return NextResponse.json({ success: false, message: 'المعرّف موجود مسبقاً' });
    const hash = await hashPassword(String(data.Password));
    await db.insert(users).values({ id, name: data.Name, role: 'Student', passwordHash: hash });
    try {
      await db.insert(studentsData).values({
        studentId: id, parentId: data.Parent_ID || null, groupId: data.Group_ID || null,
        studentPhone: data.Student_Phone || '', parentPhone: data.Parent_Phone || '',
        nazemId: data.Nazem_ID || ''
      });
    } catch (e) {
      await db.delete(users).where(eq(users.id, id));
      throw e;
    }
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id, upd } = await req.json();
    const s = (await db.select().from(studentsData).where(eq(studentsData.studentId, id)))[0];
    if (!s) return NextResponse.json({ success: false, message: 'الطالب غير موجود' });
    if (upd.Name) await db.update(users).set({ name: upd.Name }).where(eq(users.id, id));
    if (upd.Password) await db.update(users).set({ passwordHash: await hashPassword(upd.Password) }).where(eq(users.id, id));
    const patch: any = {};
    if (upd.Parent_ID !== undefined) patch.parentId = upd.Parent_ID || null;
    if (upd.Student_Phone !== undefined) patch.studentPhone = upd.Student_Phone;
    if (upd.Parent_Phone !== undefined) patch.parentPhone = upd.Parent_Phone;
    if (upd.Nazem_ID !== undefined) patch.nazemId = upd.Nazem_ID;
    if (upd.Group_ID !== undefined && String(upd.Group_ID) !== String(s.groupId||'')) {
      const pts = Number(s.totalPoints) || 0;
      if (s.groupId) await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} - ${pts}` }).where(eq(groups.id, s.groupId));
      if (upd.Group_ID) await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} + ${pts}` }).where(eq(groups.id, upd.Group_ID));
      patch.groupId = upd.Group_ID || null;
    }
    if (Object.keys(patch).length) await db.update(studentsData).set(patch).where(eq(studentsData.studentId, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    const s = (await db.select().from(studentsData).where(eq(studentsData.studentId, id)))[0];
    if (s?.groupId) {
      const pts = Number(s.totalPoints) || 0;
      await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} - ${pts}` }).where(eq(groups.id, s.groupId));
    }
    await db.delete(users).where(eq(users.id, id)); // cascades to students_data, plans, attendance, badges via FK
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
