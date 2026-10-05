import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin, errorResponse } from '@/lib/auth';

// حذف كل الأوراد التي لم تُسمَّع (status='Pending') لجميع الطلاب.
// النقاط وسجلاتها ومجاميع الطلاب لا تُمَس — لأن الأوراد Pending لم يُمنح لها نقاط أصلاً.
// الأوراد المسمّعة (Done/Partial/Missed) تبقى كاملة مع تفاصيلها.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const { confirm } = await req.json().catch(() => ({}));
    if (confirm !== 'RESET_PENDING_PLANS') {
      return NextResponse.json({ success: false, message: 'رمز التأكيد خاطئ' }, { status: 400 });
    }

    const [{ count: beforeCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(plans);
    const [{ count: pendingBefore }] = await db.select({ count: sql<number>`count(*)::int` }).from(plans).where(eq(plans.status, 'Pending'));

    const deleted = await db.delete(plans).where(eq(plans.status, 'Pending')).returning({ id: plans.id });

    const [{ count: afterCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(plans);

    return NextResponse.json({
      success: true,
      message: `حُذف ${deleted.length} ورد (Pending). الأوراد المسمّعة والنقاط لم تُمَس.`,
      stats: {
        totalBefore: beforeCount,
        pendingBefore,
        deleted: deleted.length,
        totalAfter: afterCount
      }
    });
  } catch (e: any) { return errorResponse(e); }
}
