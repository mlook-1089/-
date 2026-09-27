import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { users, studentsData, groups } from '@/db/schema';
import { requireRole, AuthError, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole('Teacher');

    const [allUsers, allData, allGroups] = await Promise.all([
      db.select().from(users),
      db.select().from(studentsData),
      db.select().from(groups),
    ]);

    const groupNameById = new Map<string, string>();
    for (const g of allGroups) groupNameById.set(g.id, g.name);

    const dataByStudentId = new Map<string, typeof allData[number]>();
    for (const d of allData) dataByStudentId.set(d.studentId, d);

    const students = allUsers.filter(u => u.role === 'Student');
    const rows = students.map(u => {
      const sd = dataByStudentId.get(u.id);
      return {
        'المعرّف': u.id,
        'الاسم': u.name,
        'المجموعة': sd?.groupId ? (groupNameById.get(sd.groupId) || '') : '',
        'النقاط': sd?.totalPoints || 0,
        'جوال الطالب': sd?.studentPhone || '',
        'جوال الولي': sd?.parentPhone || '',
        'معرف ناظم': sd?.nazemId || '',
        'ولي الأمر': sd?.parentId || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 15 }, // المعرّف
      { wch: 25 }, // الاسم
      { wch: 18 }, // المجموعة
      { wch: 10 }, // النقاط
      { wch: 15 }, // جوال الطالب
      { wch: 15 }, // جوال الولي
      { wch: 12 }, // معرف ناظم
      { wch: 12 }, // ولي الأمر
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');

    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="students.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) { return errorResponse(e); }
}
