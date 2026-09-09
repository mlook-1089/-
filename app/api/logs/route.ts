import { NextRequest, NextResponse } from 'next/server';
import { logPoints } from '@/lib/triggers';
import { requireRole } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const teacher = await requireRole('Teacher');
  const { studentId, itemId } = await req.json();
  const r = await logPoints(studentId, itemId, teacher.id);
  return NextResponse.json(r);
}
