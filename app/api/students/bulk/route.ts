import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { genId, normAr } from '@/lib/utils';
import { hashPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  await requireRole('Teacher');
  const { students, autoParent, defaultPassword } = await req.json();
  const results: { name: string; id: string; parentId?: string; parentName?: string; parentPassword?: string }[] = [];
  const errors: { name: string; message: string }[] = [];
  let created = 0;

  // نجلب أسماء الطلاب الحاليين المُطبّعة لمنع تكرار الاستيراد (داخل الملف ومع القائمة الحالية).
  const allUsers = await db.select().from(users);
  const studentUsers = allUsers.filter(x => x.role === 'Student');
  const existingNames = new Set(studentUsers.map(u => normAr(u.name || '')));

  for (const row of (students || [])) {
    if (!row?.Name) continue; // نتخطّى الصفوف بلا اسم
    const normName = normAr(row.Name);
    if (normName && existingNames.has(normName)) {
      errors.push({ name: row.Name, message: 'اسم مكرر — تم تخطّيه' });
      continue;
    }
    try {
      const id = genId('U');
      const pw = String(row.Password || defaultPassword || '1234');
      const hash = await hashPassword(pw);
      await db.insert(users).values({ id, name: row.Name, role: 'Student', passwordHash: hash, mustChangePw: true });

      // إنشاء ولي أمر تلقائياً إلا إذا مُنع صراحةً (autoParent === false)
      let parentId: string | null = null;
      let parentName: string | undefined;
      let parentPassword: string | undefined;
      let parentInsertedId: string | null = null;
      if (autoParent !== false) {
        const ppw = String(defaultPassword || '1234');
        const pid = genId('P');
        const pName = 'ولي أمر ' + row.Name;
        await db.insert(users).values({ id: pid, name: pName, role: 'Parent', passwordHash: await hashPassword(ppw), mustChangePw: true });
        parentId = pid;
        parentInsertedId = pid;
        parentName = pName;
        parentPassword = ppw;
      }

      try {
        await db.insert(studentsData).values({
          studentId: id, parentId: parentId, groupId: row.Group_ID || null,
          studentPhone: row.Student_Phone || '', parentPhone: row.Parent_Phone || '',
          nazemId: row.Nazem_ID || ''
        });
      } catch (e) {
        await db.delete(users).where(eq(users.id, id));
        if (parentInsertedId) await db.delete(users).where(eq(users.id, parentInsertedId));
        throw e;
      }

      created++;
      if (normName) existingNames.add(normName); // نمنع التكرار داخل نفس الدفعة
      results.push({ name: row.Name, id, ...(parentId ? { parentId, parentName, parentPassword } : {}) });
    } catch (e: any) {
      errors.push({ name: row?.Name || '', message: e?.message || 'خطأ' });
    }
  }

  return NextResponse.json({ success: true, created, results, errors });
}
