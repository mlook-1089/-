import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { studentsData } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

export async function POST(req: NextRequest) {
  await requireRole('Teacher');
  const { studentId, nazemId } = await req.json();
  await db.update(studentsData).set({ nazemId: String(nazemId||'') }).where(eq(studentsData.studentId, studentId));
  return NextResponse.json({ success: true });
}
