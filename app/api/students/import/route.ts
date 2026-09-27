import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { groups } from '@/db/schema';
import { requireRole, errorResponse } from '@/lib/auth';
import { normAr } from '@/lib/utils';
import { createStudents } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

function pick(row: any, keys: string[]): string {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export const maxDuration = 60;

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
    const defaultPassword = String(form.get('defaultPassword') || '') || undefined; // فارغ → كلمة عشوائية لكل حساب

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
    const validGroupIds = new Set(allGroups.map(g => g.id));

    // بناء صفوف الطلاب من أعمدة عربية/إنجليزية مرنة
    const students = rows.map(r => {
      const name = pick(r, ['الاسم', 'Name', 'name']);
      const password = pick(r, ['كلمة المرور', 'Password', 'password']);
      const groupName = pick(r, ['المجموعة', 'Group', 'Group_Name']);
      const groupIdRaw = pick(r, ['Group_ID', 'معرف المجموعة']);
      // معرّف مجموعة غير موجود يُفشل الدفعة كلها (مفتاح أجنبي) — نتجاهله
      const groupId = (groupIdRaw && validGroupIds.has(groupIdRaw) ? groupIdRaw : '') || (groupName ? (groupIdByNorm.get(normAr(groupName)) || '') : '');
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

    const { created, errors } = await createStudents(students.map(r => ({
      name: r.Name, password: r.Password, groupId: r.Group_ID || null,
      studentPhone: r.Student_Phone, parentPhone: r.Parent_Phone, nazemId: r.Nazem_ID
    })), { autoParent, defaultPassword });
    return NextResponse.json({ success: true, created: created.length, results: created, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
}
