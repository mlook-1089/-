import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData, pointLogs } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireRole, errorResponse, hashPassword } from '@/lib/auth';
import { genId } from '@/lib/utils';
import { recomputeGroups } from '@/lib/triggers';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const data = await req.json();
    if (!data?.Name || !data?.Password) return NextResponse.json({ success: false, message: 'الاسم وكلمة المرور مطلوبان' });
    if (data.ID && !/^[\w\-.]+$/.test(String(data.ID))) return NextResponse.json({ success: false, message: 'المعرّف يحتوي على أحرف غير مسموح بها' });
    const id = data.ID || genId('U');
    const existing = await db.select().from(users).where(eq(users.id, id));
    if (existing.length) return NextResponse.json({ success: false, message: 'المعرّف موجود مسبقاً' });

    // إنشاء ولي أمر تلقائياً إذا طُلب ذلك أو لم يُحدَّد ولي أمر موجود
    let parentId: string | null = data.Parent_ID || null;
    let autoParent: { id: string; name: string; password: string } | null = null;
    const ops: any[] = [
      db.insert(users).values({ id, name: data.Name, role: 'Student', passwordHash: await hashPassword(String(data.Password)), mustChangePw: true })
    ];
    if (data.AutoParent !== false && !parentId) {
      const pw = String(data.Parent_Password || data.Password);
      const pid = genId('P');
      const pName = 'ولي أمر ' + data.Name;
      ops.push(db.insert(users).values({ id: pid, name: pName, role: 'Parent', passwordHash: await hashPassword(pw), mustChangePw: true }));
      parentId = pid;
      autoParent = { id: pid, name: pName, password: pw };
    }
    ops.push(db.insert(studentsData).values({
      studentId: id, parentId, groupId: data.Group_ID || null,
      studentPhone: data.Student_Phone || '', parentPhone: data.Parent_Phone || '',
      nazemId: data.Nazem_ID || ''
    }));
    await db.batch(ops as any); // معاملة واحدة: لا يبقى حساب بلا سجل بيانات
    return NextResponse.json({ success: true, id, autoParent });
  } catch (e: any) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id, upd } = await req.json();
    const s = (await db.select().from(studentsData).where(eq(studentsData.studentId, id)))[0];
    if (!s) return NextResponse.json({ success: false, message: 'الطالب غير موجود' });
    if (upd.Name) await db.update(users).set({ name: upd.Name }).where(eq(users.id, id));
    if (upd.Password) {
      // كلمة جديدة من المعلم → يُطلب تغييرها، وتُبطَل الجلسات القديمة.
      await db.update(users).set({ passwordHash: await hashPassword(String(upd.Password)), mustChangePw: true, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id));
    }
    const patch: any = {};
    if (upd.Parent_ID !== undefined) patch.parentId = upd.Parent_ID || null;
    if (upd.Student_Phone !== undefined) patch.studentPhone = upd.Student_Phone;
    if (upd.Parent_Phone !== undefined) patch.parentPhone = upd.Parent_Phone;
    if (upd.Nazem_ID !== undefined) patch.nazemId = upd.Nazem_ID;
    const groupChanged = upd.Group_ID !== undefined && String(upd.Group_ID || '') !== String(s.groupId || '');
    if (groupChanged) patch.groupId = upd.Group_ID || null;
    if (Object.keys(patch).length) await db.update(studentsData).set(patch).where(eq(studentsData.studentId, id));
    if (groupChanged) await recomputeGroups([s.groupId, upd.Group_ID]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    const s = (await db.select().from(studentsData).where(eq(studentsData.studentId, id)))[0];
    const parentId = s?.parentId || null; // نحفظه قبل الحذف (الحذف يفكّ ارتباط students_data)
    // point_logs بلا مفتاح أجنبي، فلا تُحذف تلقائياً — نحذفها يدوياً حتى لا تبقى سجلات نقاط يتيمة.
    await db.batch([
      db.delete(pointLogs).where(eq(pointLogs.studentId, id)),
      db.delete(users).where(eq(users.id, id)) // cascades to students_data, plans, attendance, badges via FK
    ] as any);
    await recomputeGroups([s?.groupId]);

    // تنظيف ولي الأمر اليتيم: إن كان منشأً تلقائياً (اسمه يبدأ بـ 'ولي أمر ') ولم يبقَ له أي ابن.
    if (parentId) {
      try {
        const others = await db.select().from(studentsData).where(eq(studentsData.parentId, parentId));
        if (others.length === 0) {
          const parent = (await db.select().from(users).where(eq(users.id, parentId)))[0];
          if (parent && (parent.name || '').startsWith('ولي أمر ')) {
            await db.delete(users).where(eq(users.id, parentId));
          }
        }
      } catch { /* لا نكسر الحذف الأساسي إن فشل التنظيف */ }
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return errorResponse(e);
  }
}
