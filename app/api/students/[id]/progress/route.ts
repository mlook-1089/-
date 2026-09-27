import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, studentsData } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { requireSession, AuthError, errorResponse } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

/** تحقق أن المستخدم مصرّح له بعرض ملف الطالب sid */
async function canViewStudent(s: SessionUser, sid: string): Promise<boolean> {
  if (s.role === 'Teacher') return true;
  if (s.role === 'Student') return s.id === sid;
  if (s.role === 'Parent') {
    const rel = (await db.select().from(studentsData).where(and(eq(studentsData.studentId, sid), eq(studentsData.parentId, s.id))))[0];
    return !!rel;
  }
  return false;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const s = await requireSession();
    const sid = params.id;
    if (!(await canViewStudent(s, sid))) return NextResponse.json({ success: false }, { status: 403 });

    const rows = await db.select().from(plans).where(and(eq(plans.studentId, sid), eq(plans.status, 'Done')))
      .orderBy(desc(plans.date), desc(plans.createdAt)); // الأحدث أولاً: أول صف لكل نوع = آخر موضع وصل إليه
    // مسار «الإتقان» أُلغي من الخلفية؛ نقتصر على حفظ ومراجعة، وأي صفوف قديمة
    // بقيمة mastery في القاعدة تُطوى إلى conserve حتى لا تُهمَل عدّاً.
    const byType: Record<string, any> = { conserve: null, revision: null };
    const counts = { conserve: 0, revision: 0 };
    rows.forEach(p => {
      const raw = (p.type || 'conserve');
      const t = (raw === 'revision' ? 'revision' : 'conserve') as keyof typeof byType;
      counts[t]++;
      if (!p.toSurah) return;
      if (!byType[t]) byType[t] = { surah: p.toSurah, ayah: p.toAyah };
    });
    return NextResponse.json({ success: true, ...byType, counts });
  } catch (e: any) { return errorResponse(e); }
}
