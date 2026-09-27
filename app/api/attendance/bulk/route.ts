import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attendance } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';
import { genId, today } from '@/lib/utils';
import { fireTriggers } from '@/lib/triggers';
import { notifyAbsence } from '@/lib/push';

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { date, list, allIds, clearMissing } = await req.json();
    const d = date || today();
    const items = list || [];
    const doClear = clearMissing !== false; // افتراضياً true
    let count = 0;
    let awarded = 0;
    let deleted = 0;

    // اجلب حضور اليوم لكل الطلاب المعنيين دفعة واحدة (استعلام واحد بدل استعلام لكل طالب)
    const ids = items.map((x: any) => x.Student_ID);
    const existingRows = ids.length
      ? await db.select().from(attendance).where(and(eq(attendance.date, d), inArray(attendance.studentId, ids)))
      : [];
    const map = new Map<string, typeof existingRows[number]>();
    for (const r of existingRows) map.set(r.studentId, r);

    for (const x of items) {
      const existing = map.get(x.Student_ID);
      const isNew = !existing;
      const changed = !existing || existing.status !== x.Status;
      if (existing) await db.update(attendance).set({ status: x.Status, note: x.Note||'' }).where(eq(attendance.id, existing.id));
      else await db.insert(attendance).values({ id: genId('A'), studentId: x.Student_ID, date: d, status: x.Status, note: x.Note||'' });
      count++;
      if (isNew || changed) {
        let awItems: { desc: string; value: number }[] = [];
        if (x.Status === 'Present') awItems = await fireTriggers('on_attend_present', x.Student_ID, teacher.id);
        else if (x.Status === 'Late') awItems = await fireTriggers('on_attend_late', x.Student_ID, teacher.id);
        awarded += awItems.length;
        if (x.Status === 'Absent') {
          try { await notifyAbsence(x.Student_ID, d); } catch {}
        }
      }
    }

    // إلغاء التعليم: احذف صفوف الحضور لهذا التاريخ للطلاب المعروضين (allIds) الذين لم يُعلَّموا في القائمة المُرسلة.
    // إن لم تُرسل allIds لا نحذف شيئاً (سلوك آمن متوافق مع الخلف).
    if (doClear && Array.isArray(allIds) && allIds.length) {
      const marked = new Set(ids.map((x: any) => String(x)));
      const toClear = allIds.map((x: any) => String(x)).filter((x: string) => x && !marked.has(x));
      if (toClear.length) {
        const clearCond = and(eq(attendance.date, d), inArray(attendance.studentId, toClear));
        const rows = await db.select().from(attendance).where(clearCond);
        if (rows.length) {
          await db.delete(attendance).where(clearCond);
          deleted = rows.length;
        }
      }
    }

    return NextResponse.json({ success: true, count, awarded, deleted });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
