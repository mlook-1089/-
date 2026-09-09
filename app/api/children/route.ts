import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { studentsData, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';

export async function GET() {
  const s = await requireSession();
  const rows = await db.select({
    id: studentsData.studentId, name: users.name
  }).from(studentsData).leftJoin(users, eq(users.id, studentsData.studentId))
    .where(eq(studentsData.parentId, s.id));
  return NextResponse.json(rows); // legacy DS returns an array
}
