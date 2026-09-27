import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { studentsData, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireSession, AuthError } from '@/lib/auth';

export async function GET() {
  try {
    const s = await requireSession();
    const rows = await db.select({
      id: studentsData.studentId, name: users.name
    }).from(studentsData).leftJoin(users, eq(users.id, studentsData.studentId))
      .where(eq(studentsData.parentId, s.id));
    return NextResponse.json(rows); // legacy DS returns an array
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
