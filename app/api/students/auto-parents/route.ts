import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData } from '@/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { requireRole, hashPassword } from '@/lib/auth';
import { genId } from '@/lib/utils';

/**
 * إنشاء حساب ولي أمر تلقائي لكل طالب لا يوجد لديه حساب ولي أمر مرتبط.
 * كلمة المرور الافتراضية: 1234 — يجب تغييرها لاحقاً.
 * اسم الحساب: "ولي أمر [اسم الطالب]"
 */
export async function POST() {
  try {
    await requireRole('Teacher');
    const sd = await db.select().from(studentsData);
    const all = await db.select().from(users);
    const nameMap: Record<string, string> = {};
    all.forEach(u => { nameMap[u.id] = u.name; });

    const targets = sd.filter(s => !s.parentId);
    let created = 0;
    const results: Array<{ studentId: string; parentId: string; parentName: string; password: string }> = [];
    const defaultPw = '1234';
    const pwHash = await hashPassword(defaultPw);

    for (const s of targets) {
      const studentName = nameMap[s.studentId] || s.studentId;
      const pid = genId('P');
      const pName = 'ولي أمر ' + studentName;
      await db.insert(users).values({ id: pid, name: pName, role: 'Parent', passwordHash: pwHash, mustChangePw: true });
      await db.update(studentsData).set({ parentId: pid }).where(eq(studentsData.studentId, s.studentId));
      created++;
      results.push({ studentId: s.studentId, parentId: pid, parentName: pName, password: defaultPw });
    }

    return NextResponse.json({
      success: true, created,
      message: created ? `تم إنشاء ${created} حساب ولي أمر — كلمة المرور الافتراضية: ${defaultPw}` : 'كل الطلاب لديهم أولياء أمور',
      results
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
