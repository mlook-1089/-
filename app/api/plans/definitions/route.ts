import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { planDefinitions } from '@/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';

// آخر تعريف خطة لطالب+نوع. تستعمله الواجهة لإعادة فتح نموذج التحرير بالقيم
// الأصلية (نطاقات، كمية يومية، مدى زمني) بدل استنتاجها من أيام الورد.
export async function GET(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || '';
    const type = (searchParams.get('type') || '').toLowerCase();

    if (!studentId) {
      return NextResponse.json({ success: false, message: 'studentId مطلوب' }, { status: 400 });
    }
    if (type && !['conserve', 'revision'].includes(type)) {
      return NextResponse.json({ success: false, message: 'نوع الخطة غير صالح' }, { status: 400 });
    }

    const conds = [eq(planDefinitions.studentId, studentId)];
    if (type) conds.push(eq(planDefinitions.type, type));

    const rows = await db
      .select()
      .from(planDefinitions)
      .where(and(...conds))
      .orderBy(desc(planDefinitions.createdAt))
      .limit(1);

    const def = rows[0];
    if (!def) return NextResponse.json({ success: true, definition: null });

    return NextResponse.json({
      success: true,
      definition: {
        id: def.id,
        studentId: def.studentId,
        type: def.type,
        ranges: def.ranges,
        dailyPages: def.dailyPages,
        workDays: def.workDays ? def.workDays.split(',').map(n => Number(n)).filter(n => n >= 0 && n <= 6) : [],
        termStart: String(def.termStart),
        termEnd: String(def.termEnd),
        direction: def.direction || 'asc',
        createdAt: def.createdAt
      }
    });
  } catch (e: any) { return errorResponse(e); }
}
