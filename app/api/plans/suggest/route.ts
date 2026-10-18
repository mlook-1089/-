import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { planDefinitions, studentsData } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireSession, errorResponse } from '@/lib/auth';
import { suggestNext, getProgress, type PlanDefLike } from '@/lib/plan-progress';

// GET /api/plans/suggest?studentId=&type=conserve|revision
// قراءة محضة — لا يُنشئ أي صف. يحسب موضع تقدّم الخطة النشطة ثم اقتراح ورد اليوم.
// الوصول: Teacher (أي طالب)، Student (نفسه فقط)، Parent (أبناؤه فقط).
export async function GET(req: NextRequest) {
  try {
    const s = await requireSession();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || '';
    const type = (searchParams.get('type') || '').toLowerCase();

    if (!studentId) return NextResponse.json({ success: false, message: 'studentId مطلوب' }, { status: 400 });
    if (!['conserve', 'revision'].includes(type)) {
      return NextResponse.json({ success: false, message: 'نوع الخطة غير صالح' }, { status: 400 });
    }

    // التحقّق من الصلاحية
    if (s.role === 'Student') {
      if (s.id !== studentId) return NextResponse.json({ success: false, message: 'غير مصرّح' }, { status: 403 });
    } else if (s.role === 'Parent') {
      const [rel] = await db.select().from(studentsData)
        .where(and(eq(studentsData.studentId, studentId), eq(studentsData.parentId, s.id)));
      if (!rel) return NextResponse.json({ success: false, message: 'غير مصرّح' }, { status: 403 });
    } else if (s.role !== 'Teacher') {
      return NextResponse.json({ success: false, message: 'غير مصرّح' }, { status: 403 });
    }

    // الخطة النشطة لهذا الطالب+النوع
    const [def] = await db.select().from(planDefinitions)
      .where(and(
        eq(planDefinitions.studentId, studentId),
        eq(planDefinitions.type, type),
        eq(planDefinitions.active, true)
      ))
      .limit(1);

    if (!def) {
      return NextResponse.json({ success: true, suggestion: null, completed: false, progressOrd: null, hasActivePlan: false });
    }

    const progress = await getProgress(def as any as PlanDefLike);
    const suggestion = progress.isComplete ? null : await suggestNext(def as any as PlanDefLike);

    return NextResponse.json({
      success: true,
      suggestion,
      completed: progress.isComplete,
      progressOrd: progress.progressOrd,
      planDefId: def.id,
      hasActivePlan: true
    });
  } catch (e: any) { return errorResponse(e); }
}
