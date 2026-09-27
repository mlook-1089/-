import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, hashTempPassword, errorResponse } from '@/lib/auth';
import { genId } from '@/lib/utils';
import { randomPin } from '@/lib/accounts';

/**
 * إنشاء حساب ولي أمر تلقائي لكل طالب لا يوجد لديه حساب ولي أمر مرتبط.
 * كلمة المرور مؤقتة عشوائية (٦ أرقام) لكل حساب، ويُجبر صاحبها على تغييرها عند أول دخول.
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
    const results: Array<{ studentId: string; studentName: string; parentId: string; parentName: string; password: string }> = [];
    const ops: any[] = [];
    for (const s of targets) {
      const studentName = nameMap[s.studentId] || s.studentId;
      const pid = genId('P');
      const pName = 'ولي أمر ' + studentName;
      const pw = randomPin();
      ops.push(db.insert(users).values({ id: pid, name: pName, role: 'Parent', passwordHash: await hashTempPassword(pw), mustChangePw: true }));
      ops.push(db.update(studentsData).set({ parentId: pid }).where(eq(studentsData.studentId, s.studentId)));
      results.push({ studentId: s.studentId, studentName, parentId: pid, parentName: pName, password: pw });
    }
    if (ops.length) await db.batch(ops as any);

    return NextResponse.json({
      success: true, created: results.length,
      message: results.length ? `تم إنشاء ${results.length} حساب ولي أمر بكلمات مرور مؤقتة` : 'كل الطلاب لديهم أولياء أمور',
      results
    });
  } catch (e: any) { return errorResponse(e); }
}
