import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { studentsData } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { studentId, nazemId } = await req.json();
    const nz = String(nazemId || '').trim();
    // معرّف ناظم الواحد لا يُربط بطالبين (وإلا ذهبت متابعة أحدهما للآخر)
    if (nz) {
      const other = (await db.select().from(studentsData).where(and(eq(studentsData.nazemId, nz), ne(studentsData.studentId, studentId))))[0];
      if (other) return NextResponse.json({ success: false, message: 'معرّف ناظم هذا مرتبط بطالب آخر — افكّ ربطه أولاً' }, { status: 409 });
    }
    await db.update(studentsData).set({ nazemId: nz }).where(eq(studentsData.studentId, studentId));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return errorResponse(e);
  }
}
