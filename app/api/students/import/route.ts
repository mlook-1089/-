import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { users, studentsData, groups } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, AuthError, hashPassword } from '@/lib/auth';
import { genId, normAr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

function pick(row: any, keys: string[]): string {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, message: 'الملف مطلوب' }, { status: 400 });
    }
    const autoParentFlag = form.get('autoParent');
    const autoParent = autoParentFlag === null ? true : String(autoParentFlag) !== 'false';
    const defaultPassword = String(form.get('defaultPassword') || '1234');

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return NextResponse.json({ success: false, message: 'الملف لا يحتوي على أوراق' }, { status: 400 });
    }
    const ws = wb.Sheets[firstSheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, message: `تجاوز الحد الأقصى ${MAX_ROWS} صف` },
        { status: 413 }
      );
    }

    // خريطة اسم المجموعة → المعرف (مطبّعة)
    const allGroups = await db.select().from(groups);
    const groupIdByNorm = new Map<string, string>();
    for (const g of allGroups) groupIdByNorm.set(normAr(g.name || ''), g.id);

    // بناء صفوف الطلاب من أعمدة عربية/إنجليزية مرنة
    const students = rows.map(r => {
      const name = pick(r, ['الاسم', 'Name', 'name']);
      const password = pick(r, ['كلمة المرور', 'Password', 'password']);
      const groupName = pick(r, ['المجموعة', 'Group', 'Group_Name']);
      const groupIdRaw = pick(r, ['Group_ID', 'معرف المجموعة']);
      const groupId = groupIdRaw || (groupName ? (groupIdByNorm.get(normAr(groupName)) || '') : '');
      const studentPhone = pick(r, ['جوال الطالب', 'Student_Phone', 'StudentPhone']);
      const parentPhone = pick(r, ['جوال الولي', 'Parent_Phone', 'ParentPhone']);
      const nazemId = pick(r, ['معرف ناظم', 'Nazem_ID', 'NazemId']);
      return {
        Name: name,
        Password: password,
        Group_ID: groupId,
        Student_Phone: studentPhone,
        Parent_Phone: parentPhone,
        Nazem_ID: nazemId,
      };
    });

    // فحص الأسماء المكررة (منطق مطابق لـ students/bulk/route.ts)
    const allUsers = await db.select().from(users);
    const studentUsers = allUsers.filter(x => x.role === 'Student');
    const existingNames = new Set(studentUsers.map(u => normAr(u.name || '')));

    const errors: { name: string; message: string }[] = [];
    let created = 0;

    for (const row of students) {
      if (!row.Name) continue;
      const normName = normAr(row.Name);
      if (normName && existingNames.has(normName)) {
        errors.push({ name: row.Name, message: 'اسم مكرر — تم تخطّيه' });
        continue;
      }
      try {
        const id = genId('U');
        const pw = String(row.Password || defaultPassword || '1234');
        const hash = await hashPassword(pw);
        await db.insert(users).values({
          id, name: row.Name, role: 'Student', passwordHash: hash, mustChangePw: true
        });

        // إنشاء ولي أمر تلقائياً إلا إذا مُنع صراحةً
        let parentId: string | null = null;
        let parentInsertedId: string | null = null;
        if (autoParent !== false) {
          const ppw = String(defaultPassword || '1234');
          const pid = genId('P');
          const pName = 'ولي أمر ' + row.Name;
          await db.insert(users).values({
            id: pid, name: pName, role: 'Parent',
            passwordHash: await hashPassword(ppw), mustChangePw: true
          });
          parentId = pid;
          parentInsertedId = pid;
        }

        try {
          await db.insert(studentsData).values({
            studentId: id,
            parentId: parentId,
            groupId: row.Group_ID || null,
            studentPhone: row.Student_Phone || '',
            parentPhone: row.Parent_Phone || '',
            nazemId: row.Nazem_ID || '',
          });
        } catch (e) {
          await db.delete(users).where(eq(users.id, id));
          if (parentInsertedId) await db.delete(users).where(eq(users.id, parentInsertedId));
          throw e;
        }

        created++;
        if (normName) existingNames.add(normName);
      } catch (e: any) {
        errors.push({ name: row?.Name || '', message: e?.message || 'خطأ' });
      }
    }

    return NextResponse.json({ success: true, created, errors });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
  }
}
