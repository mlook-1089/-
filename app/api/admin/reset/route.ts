import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, plans, pointLogs, attendance, badges, news, newsComments, events, studentsData, groups, pushSubscriptions } from '@/db/schema';
import { requireRole, AuthError, errorResponse } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const [row] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, teacher.id));
    if (!row?.isAdmin) {
      return NextResponse.json({ success: false, message: 'غير مصرّح — المشرف فقط' }, { status: 403 });
    }
    const { confirm } = await req.json();
    if (confirm !== 'DELETE_ALL_DATA') {
      return NextResponse.json({ success: false, message: 'رمز التأكيد خاطئ' }, { status: 400 });
    }

    await db.delete(newsComments);
    await db.delete(plans);
    await db.delete(pointLogs);
    await db.delete(attendance);
    await db.delete(badges);
    await db.delete(pushSubscriptions);
    await db.delete(news);
    await db.delete(events);
    await db.delete(studentsData);
    await db.delete(groups);
    await db.delete(users).where(inArray(users.role, ['Student', 'Parent']));

    return NextResponse.json({ success: true, message: 'تم مسح جميع البيانات بنجاح' });
  } catch (e: any) { return errorResponse(e); }
}
