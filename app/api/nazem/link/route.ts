import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { studentsData } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { studentId, nazemId } = await req.json();
    await db.update(studentsData).set({ nazemId: String(nazemId||'') }).where(eq(studentsData.studentId, studentId));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
