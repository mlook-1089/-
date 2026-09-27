import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, pointLogs, attendance, badges, news, newsComments, events, studentsData, groups, pushSubscriptions } from '@/db/schema';
import { requireRole, AuthError } from '@/lib/auth';
import { sql } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    if (!teacher.isAdmin) {
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

    return NextResponse.json({ success: true, message: 'تم مسح جميع البيانات بنجاح' });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    }
    return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
  }
}
