import { db } from './db';
import { pointItems, pointLogs, studentsData, groups } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { genId, today } from './utils';
import { tryAwardBadges } from './badges';

/**
 * نقاط المجموعة = نقاطها المباشرة (bonus) + مجموع نقاط أعضائها الحاليين.
 * نعيد حسابها بدل الزيادة/النقص التراكمي حتى لا تنحرف عند نقل الأعضاء أو الحذف.
 */
export async function recomputeGroups(groupIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(groupIds.filter(Boolean) as string[]));
  if (!ids.length) return;
  await db.update(groups).set({
    totalPoints: sql`${groups.bonusPoints} + COALESCE((SELECT SUM(${studentsData.totalPoints}) FROM ${studentsData} WHERE ${studentsData.groupId} = ${groups.id}), 0)`
  }).where(inArray(groups.id, ids));
}

async function addToStudent(studentId: string, delta: number) {
  if (!delta) return null;
  const [row] = await db.update(studentsData)
    .set({ totalPoints: sql`${studentsData.totalPoints} + ${delta}` })
    .where(eq(studentsData.studentId, studentId))
    .returning({ totalPoints: studentsData.totalPoints, groupId: studentsData.groupId });
  return row || null;
}

/** منح بند نقاط لطالب. ref يربط المنح بمصدره (plan:<id> / att:<id>) ليمكن سحبه لاحقاً. */
export async function logPoints(studentId: string, itemId: string, teacherId: string, ref = '') {
  const it = (await db.select().from(pointItems).where(eq(pointItems.id, itemId)))[0];
  if (!it) return { success: false, message: 'البند غير موجود' };
  const sd = (await db.select().from(studentsData).where(eq(studentsData.studentId, studentId)))[0];
  if (!sd) return { success: false, message: 'الطالب غير موجود' };
  const val = Number(it.pointValue) || 0;
  const ins = await db.insert(pointLogs).values({ id: genId('L'), studentId, itemId, teacherId, date: today(), pointValue: val, ref })
    .onConflictDoNothing().returning({ id: pointLogs.id });
  // القيد الفريد (ref,item_id) يمنع منح نفس البند لنفس المصدر مرتين عند طلبين متزامنين
  if (!ins.length) return { success: false, message: 'مُنح مسبقاً' };
  const after = await addToStudent(studentId, val);
  await recomputeGroups([sd.groupId]);
  await tryAwardBadges(studentId);
  return { success: true, points: val, newTotal: Number(after?.totalPoints ?? sd.totalPoints) || 0 };
}

/** سحب كل النقاط التي منحها مصدر معيّن (عند التراجع عن الحالة أو حذف السجل). */
export async function revokeRef(ref: string) {
  return revokeRefs(ref ? [ref] : []);
}

/** سحب نقاط عدة مصادر دفعة واحدة. */
export async function revokeRefs(refs: string[]) {
  if (!refs.length) return 0;
  const logs = await db.select().from(pointLogs).where(inArray(pointLogs.ref, refs));
  if (!logs.length) return 0;
  const byStudent = new Map<string, number>();
  for (const l of logs) byStudent.set(l.studentId, (byStudent.get(l.studentId) || 0) + (Number(l.pointValue) || 0));
  const ops: any[] = [db.delete(pointLogs).where(inArray(pointLogs.ref, refs))];
  for (const [sid, sum] of byStudent) if (sum) ops.push(db.update(studentsData).set({ totalPoints: sql`${studentsData.totalPoints} - ${sum}` }).where(eq(studentsData.studentId, sid)));
  await db.batch(ops as any);
  const sd = await db.select({ groupId: studentsData.groupId }).from(studentsData).where(inArray(studentsData.studentId, [...byStudent.keys()]));
  await recomputeGroups(sd.map(r => r.groupId));
  return logs.length;
}

/**
 * يمنح بنود المُحفِّز. مع ref: مرة واحدة لكل بند لكل مصدر (ورد/حضور).
 * بدون ref (استدعاءات قديمة): مرة واحدة لكل بند في اليوم.
 */
export async function fireTriggers(trigger: string, studentId: string, teacherId: string, ref = '') {
  const items = await db.select().from(pointItems).where(eq(pointItems.trigger, trigger));
  if (!items.length) return [];
  const prior = ref
    ? await db.select().from(pointLogs).where(eq(pointLogs.ref, ref))
    : await db.select().from(pointLogs).where(and(eq(pointLogs.studentId, studentId), eq(pointLogs.date, today())));
  const done = new Set(prior.map(l => l.itemId));
  const awarded: { desc: string; value: number }[] = [];
  for (const it of items) {
    if (done.has(it.id)) continue;
    const r = await logPoints(studentId, it.id, teacherId || 'AUTO', ref);
    if (r.success) awarded.push({ desc: it.description, value: r.points as number });
  }
  return awarded;
}

/** تحديث نقاط ورد عند تغيّر حالته: يسحب ما مُنح سابقاً ثم يمنح ما يناسب الحالة الجديدة. */
export async function applyPlanStatus(p: { id: string; studentId: string; type?: string | null }, oldStatus: string | null | undefined, newStatus: string, teacherId: string) {
  if ((oldStatus || 'Pending') === newStatus) return [];
  const ref = 'plan:' + p.id;
  await revokeRef(ref);
  let awarded: { desc: string; value: number }[] = [];
  if (newStatus === 'Done') awarded = await fireTriggers(p.type === 'revision' ? 'on_review_done' : 'on_done', p.studentId, teacherId, ref);
  else if (newStatus === 'Partial') awarded = await fireTriggers('on_partial', p.studentId, teacherId, ref);
  // شارات الأوراد (أول حفظ/٢٠ ورداً/السلاسل) — logPoints يفحصها فقط إن وُجد بند نقاط للمُحفِّز
  if (!awarded.length && newStatus === 'Done') await tryAwardBadges(p.studentId);
  return awarded;
}

/** تحديث نقاط سجل حضور عند تغيّر حالته. */
export async function applyAttendanceStatus(attId: string, studentId: string, oldStatus: string | null | undefined, newStatus: string, teacherId: string) {
  if ((oldStatus || '') === newStatus) return [];
  const ref = 'att:' + attId;
  await revokeRef(ref);
  if (newStatus === 'Present') return fireTriggers('on_attend_present', studentId, teacherId, ref);
  if (newStatus === 'Late') return fireTriggers('on_attend_late', studentId, teacherId, ref);
  return [];
}

/**
 * نسخة جماعية من applyAttendanceStatus للحضور الجماعي: بضعة استعلامات لكل الطلاب
 * بدل ~8 استعلامات متتالية لكل طالب (كانت تقترب من مهلة الخادم مع حلقة كبيرة).
 */
export async function applyAttendanceBulk(changes: { attId: string; studentId: string; newStatus: string }[], teacherId: string) {
  if (!changes.length) return 0;
  const refs = changes.map(c => 'att:' + c.attId);
  const [oldLogs, items] = await Promise.all([
    db.select().from(pointLogs).where(inArray(pointLogs.ref, refs)),
    db.select().from(pointItems).where(inArray(pointItems.trigger, ['on_attend_present', 'on_attend_late']))
  ]);
  const delta = new Map<string, number>();
  const add = (sid: string, v: number) => delta.set(sid, (delta.get(sid) || 0) + v);
  for (const l of oldLogs) add(l.studentId, -(Number(l.pointValue) || 0));
  const t = today();
  const newLogs: any[] = [];
  for (const c of changes) {
    const trig = c.newStatus === 'Present' ? 'on_attend_present' : c.newStatus === 'Late' ? 'on_attend_late' : '';
    for (const it of items.filter(i => i.trigger === trig)) {
      const val = Number(it.pointValue) || 0;
      newLogs.push({ id: genId('L'), studentId: c.studentId, itemId: it.id, teacherId: teacherId || 'AUTO', date: t, pointValue: val, ref: 'att:' + c.attId });
      add(c.studentId, val);
    }
  }
  const ops: any[] = [];
  if (oldLogs.length) ops.push(db.delete(pointLogs).where(inArray(pointLogs.ref, refs)));
  if (newLogs.length) ops.push(db.insert(pointLogs).values(newLogs).onConflictDoNothing());
  for (const [sid, d] of delta) if (d) ops.push(db.update(studentsData).set({ totalPoints: sql`${studentsData.totalPoints} + ${d}` }).where(eq(studentsData.studentId, sid)));
  if (!ops.length) return 0;
  await db.batch(ops as any);
  const touched = [...delta.keys()];
  const sd = touched.length ? await db.select({ groupId: studentsData.groupId }).from(studentsData).where(inArray(studentsData.studentId, touched)) : [];
  await recomputeGroups(sd.map(s => s.groupId));
  await Promise.all(touched.filter(sid => (delta.get(sid) || 0) > 0).map(sid => tryAwardBadges(sid).catch(() => {})));
  return newLogs.length;
}
