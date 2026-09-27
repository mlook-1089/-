import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData } from '@/db/schema';
import { requireRole, errorResponse } from '@/lib/auth';

/**
 * إنشاء سجل بيانات طالب (students_data) لكل حساب طالب لا يوجد له سجل مرتبط.
 * يحدث هذا حين يُنشَأ حساب مستخدم بدور "Student" دون المرور بتدفق إضافة الطالب الطبيعي.
 */
export async function POST() {
  try {
    await requireRole('Teacher');
    const allUsers = await db.select().from(users);
    const sd = await db.select().from(studentsData);
    const sdIds = new Set(sd.map(s => s.studentId));

    const targets = allUsers.filter(u => u.role === 'Student' && !sdIds.has(u.id));
    let created = 0;

    for (const u of targets) {
      await db.insert(studentsData).values({
        studentId: u.id,
        parentId: null,
        groupId: null,
        studentPhone: '',
        parentPhone: '',
        nazemId: ''
      });
      created++;
    }

    return NextResponse.json({
      success: true,
      created,
      message: created
        ? `تم ربط ${created} حساب طالب بسجل البيانات`
        : 'كل حسابات الطلاب مرتبطة بسجلاتهم'
    });
  } catch (e: any) { return errorResponse(e); }
}
