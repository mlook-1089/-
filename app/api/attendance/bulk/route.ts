import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attendance } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId, today } from '@/lib/utils';
import { applyAttendanceBulk, revokeRefs } from '@/lib/triggers';
import { notifyAbsence } from '@/lib/push';

const STATUSES = ['Present', 'Late', 'Absent'];

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { date, list, allIds, clearMissing } = await req.json();
    const d = date || today();
    // صف واحد لكل طالب (الأخير يفوز) — التكرار في القائمة كان يمنح النقاط مرتين
    const byId = new Map<string, any>();
    for (const x of ((list || []) as any[])) if (x?.Student_ID && STATUSES.includes(x.Status)) byId.set(String(x.Student_ID), x);
    const items = [...byId.values()];
    const doClear = clearMissing !== false; // افتراضياً true
    let deleted = 0;

    // اجلب حضور اليوم لكل الطلاب المعنيين دفعة واحدة
    const ids = items.map(x => String(x.Student_ID));
    const existingRows = ids.length
      ? await db.select().from(attendance).where(and(eq(attendance.date, d), inArray(attendance.studentId, ids)))
      : [];
    const map = new Map(existingRows.map(r => [r.studentId, r]));

    const changes: { attId: string; studentId: string; newStatus: string }[] = [];
    const newAbsent: string[] = [];
    const ops: any[] = [];
    const inserts: any[] = [];
    for (const x of items) {
      const ex = map.get(x.Student_ID);
      if (ex) {
        if (ex.status !== x.Status || (ex.note || '') !== (x.Note || '')) {
          ops.push(db.update(attendance).set({ status: x.Status, note: x.Note || '' }).where(eq(attendance.id, ex.id)));
        }
        if (ex.status !== x.Status) changes.push({ attId: ex.id, studentId: x.Student_ID, newStatus: x.Status });
      } else {
        inserts.push({ id: genId('A'), studentId: x.Student_ID, date: d, status: x.Status, note: x.Note || '' });
      }
      if (x.Status === 'Absent' && ex?.status !== 'Absent') newAbsent.push(x.Student_ID);
    }
    if (ops.length) await db.batch(ops as any);
    if (inserts.length) {
      // القيد الفريد يتجاهل صفاً سبقنا إليه طلب آخر (نقر مزدوج) — لا نمنح نقاطاً إلا لما أُدرج فعلاً
      const ins = await db.insert(attendance).values(inserts).onConflictDoNothing()
        .returning({ id: attendance.id, studentId: attendance.studentId, status: attendance.status });
      for (const r of ins) changes.push({ attId: r.id, studentId: r.studentId, newStatus: r.status });
    }

    const awarded = await applyAttendanceBulk(changes, teacher.id);

    // إلغاء التعليم: احذف صفوف الحضور لهذا التاريخ للطلاب المعروضين (allIds) الذين لم يُعلَّموا، واسحب نقاطها.
    if (doClear && Array.isArray(allIds) && allIds.length) {
      const marked = new Set(ids);
      const toClear = allIds.map((x: any) => String(x)).filter((x: string) => x && !marked.has(x));
      if (toClear.length) {
        const rows = await db.delete(attendance)
          .where(and(eq(attendance.date, d), inArray(attendance.studentId, toClear)))
          .returning({ id: attendance.id });
        deleted = rows.length;
        await revokeRefs(rows.map(r => 'att:' + r.id));
      }
    }

    await Promise.all(newAbsent.map(sid => notifyAbsence(sid, d).catch(() => {})));
    return NextResponse.json({ success: true, count: items.length, awarded, deleted });
  } catch (e: any) {
    return errorResponse(e);
  }
}
