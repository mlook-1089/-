import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData } from '@/db/schema';
import { requireRole, errorResponse } from '@/lib/auth';
import { nzFollowUp } from '@/lib/nazem';
import { normAr } from '@/lib/utils';
import { createStudents, CreatedStudent } from '@/lib/accounts';

// Nazem أصبح مصدر أسماء فقط: لا نحفظ خططاً ولا حضوراً ولا نقاطاً من ناظم.
// كل المتابعة (الأوراد، الحفظ، أين وصل الطالب، الحضور) تُدار يدوياً من المنصة.
// هذا المسار: يسحب الطلاب غير المرتبطين ويُنشئ لهم حسابات فقط.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { planId, date } = await req.json();
    const data = await nzFollowUp(planId, date);
    const students = data.students || [];

    const [allUsers, allSd] = await Promise.all([
      db.select().from(users),
      db.select().from(studentsData)
    ]);
    const nameToId: Record<string, string> = {};
    allUsers.forEach(u => { if (u.role === 'Student') nameToId[normAr(u.name)] = u.id; });
    const nazemToId: Record<string, string> = {};
    allSd.forEach(s => { if (s.nazemId) nazemToId[String(s.nazemId)] = s.studentId; });

    let newAccounts: CreatedStudent[] = [];
    const unmatched: any[] = [];

    // إنشاء حسابات كل الطلاب غير المرتبطين تلقائياً (بكلمات مؤقتة عشوائية تُعاد للمعلم)
    const missing = students.filter((st: any) => {
      const nsid = st.student_id || st.id;
      return st.student_name && !((nsid && nazemToId[String(nsid)]) || nameToId[normAr(st.student_name)]);
    });
    if (missing.length) {
      const r = await createStudents(
        missing.map((st: any) => ({ name: st.student_name, nazemId: String(st.student_id || st.id || '') })),
        { autoParent: true }
      );
      newAccounts = r.created;
      // من فشل إنشاؤه (اسم مكرر مثلاً) يظهر في «بدون تطابق» ليربطه المعلم يدوياً
      r.errors.forEach(e => unmatched.push({ nazem_id: e.nazemId, name: e.name, reason: e.message }));
    }

    return NextResponse.json({
      success: true,
      created: newAccounts.length,
      newAccounts,
      unmatched,
      message: newAccounts.length
        ? `تم إنشاء ${newAccounts.length} حساب طالب${unmatched.length ? ` · ${unmatched.length} يحتاج ربطاً يدوياً` : ''}`
        : (unmatched.length ? `${unmatched.length} طالب بلا حساب — يحتاج ربطاً يدوياً` : 'كل الطلاب مرتبطون بحسابات')
    });
  } catch (e: any) {
    return errorResponse(e);
  }
}
