import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attendance, studentsData } from '@/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { requireSession, AuthError } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

/** تحقق أن المستخدم مصرّح له بعرض سجل حضور الطالب sid — نمط مطابق لبقية مسارات الطالب */
async function canViewStudent(s: SessionUser, sid: string): Promise<boolean> {
  if (s.role === 'Teacher') return true;
  if (s.role === 'Student') return s.id === sid;
  if (s.role === 'Parent') {
    const rel = (await db.select().from(studentsData).where(and(eq(studentsData.studentId, sid), eq(studentsData.parentId, s.id))))[0];
    return !!rel;
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || '';
    if (!studentId) return NextResponse.json({ success: false, message: 'studentId مطلوب' }, { status: 400 });
    if (!(await canViewStudent(s, studentId))) return NextResponse.json({ success: false, message: 'غير مصرح' }, { status: 403 });

    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    // نبني شروط الاستعلام ديناميكياً حتى نتجنّب `undefined` داخل `and()`
    const conds: any[] = [eq(attendance.studentId, studentId)];
    if (from) conds.push(gte(attendance.date, from));
    if (to) conds.push(lte(attendance.date, to));
    const rows = await db.select().from(attendance).where(and(...conds));

    const history = rows
      .map(a => ({ Date: String(a.date), Status: a.status, Note: a.note || '' }))
      .sort((a, b) => b.Date.localeCompare(a.Date));

    const stats = {
      present: history.filter(h => h.Status === 'Present').length,
      late:    history.filter(h => h.Status === 'Late').length,
      absent:  history.filter(h => h.Status === 'Absent').length
    };

    return NextResponse.json({ success: true, history, stats });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
