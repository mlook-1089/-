import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pointLogs, users, pointItems, studentsData } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { recomputeGroups } from '@/lib/triggers';

/* سجل العمليات: آخر ~200 عملية نقاط، الأحدث أولاً، مع ربط الأسماء والبنود */
export async function GET(_req: NextRequest) {
  try {
    await requireRole('Teacher');
    const rows = await db.select().from(pointLogs).orderBy(desc(pointLogs.createdAt)).limit(200);
    const [u, it] = await Promise.all([
      db.select().from(users),
      db.select().from(pointItems)
    ]);
    const nameMap: Record<string, string> = {}; u.forEach(x => nameMap[x.id] = x.name);
    const itemMap: Record<string, any> = {}; it.forEach(x => itemMap[x.id] = x);
    const logs = rows.map(l => {
      const tId = l.teacherId || '';
      const teacherName = (!tId || tId === 'AUTO') ? 'تلقائي/نظام' : (nameMap[tId] || 'تلقائي/نظام');
      const item = itemMap[l.itemId];
      return {
        id: l.id,
        studentId: l.studentId,
        auto: !!l.ref, // منح تلقائي مرتبط بورد/حضور — الحذف يجب أن يكون من مصدره لا من هنا
        date: String(l.date),
        studentName: nameMap[l.studentId] || '-',
        teacherName,
        itemDesc: item?.description || '-',
        points: (l.pointValue ?? item?.pointValue ?? 0)
      };
    });
    return NextResponse.json({ success: true, logs });
  } catch (e: any) { return errorResponse(e); }
}

/**
 * حذف سجل نقاط: يسحب النقطة من مجموع الطالب ويُعيد حساب مجموع مجموعته.
 * السجلات المُمنَحة تلقائياً (لها ref) لا تُحذف من هنا حتى لا يبقى اختلاف
 * بين حالة الورد/الحضور وأثره في السجل — يُعاد رصده من صفحة المتابعة.
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: 'المعرّف مطلوب' }, { status: 400 });
    const row = (await db.select().from(pointLogs).where(eq(pointLogs.id, id)))[0];
    if (!row) return NextResponse.json({ success: false, message: 'السجل غير موجود' }, { status: 404 });
    if (row.ref) return NextResponse.json({ success: false, message: 'هذا المنح مرتبط بورد/حضور — تراجع عن الحالة من شاشة المتابعة' }, { status: 400 });

    const val = Number(row.pointValue) || 0;
    await db.delete(pointLogs).where(eq(pointLogs.id, id));
    if (val) {
      const [sd] = await db.update(studentsData)
        .set({ totalPoints: sql`${studentsData.totalPoints} - ${val}` })
        .where(eq(studentsData.studentId, row.studentId))
        .returning({ groupId: studentsData.groupId });
      await recomputeGroups([sd?.groupId]);
    }
    return NextResponse.json({ success: true, points: val });
  } catch (e: any) { return errorResponse(e); }
}
