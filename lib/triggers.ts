import { db } from './db';
import { pointItems, pointLogs, studentsData, groups } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { genId, today } from './utils';
import { tryAwardBadges } from './badges';

export async function logPoints(studentId: string, itemId: string, teacherId: string) {
  const it = (await db.select().from(pointItems).where(eq(pointItems.id, itemId)))[0];
  if (!it) return { success: false, message: 'البند غير موجود' };
  const val = Number(it.pointValue) || 0;
  await db.insert(pointLogs).values({ id: genId('L'), studentId, itemId, teacherId, date: today(), pointValue: val });
  const student = (await db.select().from(studentsData).where(eq(studentsData.studentId, studentId)))[0];
  let newTotal = (Number(student?.totalPoints) || 0) + val;
  if (student) {
    // تحديث ذرّي: نعتمد على القيمة الحالية في القاعدة لا على قراءة JS قديمة (منعاً لفقدان النقاط عند التزامن).
    await db.update(studentsData).set({ totalPoints: sql`${studentsData.totalPoints} + ${val}` }).where(eq(studentsData.studentId, studentId));
    if (student.groupId) {
      await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} + ${val}` }).where(eq(groups.id, student.groupId));
    }
    // نعيد استعلام السجل للحصول على المجموع الصحيح بعد التحديث الذرّي.
    const after = (await db.select().from(studentsData).where(eq(studentsData.studentId, studentId)))[0];
    if (after) newTotal = Number(after.totalPoints) || 0;
  }
  await tryAwardBadges(studentId);
  return { success: true, points: val, newTotal };
}

export async function fireTriggers(trigger: string, studentId: string, teacherId: string) {
  const items = await db.select().from(pointItems).where(eq(pointItems.trigger, trigger));
  const t = today();
  const todayLogs = await db.select().from(pointLogs)
    .where(and(eq(pointLogs.studentId, studentId), eq(pointLogs.date, t)));
  const done = new Set(todayLogs.map(l => l.itemId));
  const awarded: { desc: string; value: number }[] = [];
  for (const it of items) {
    if (done.has(it.id)) continue;
    const r = await logPoints(studentId, it.id, teacherId || 'AUTO');
    if (r.success) awarded.push({ desc: it.description, value: r.points });
  }
  return awarded;
}
