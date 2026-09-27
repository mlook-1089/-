import { NextRequest, NextResponse } from 'next/server';
import { logPoints } from '@/lib/triggers';
import { requireRole, AuthError, errorResponse } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { studentId, itemId } = await req.json();
    const r = await logPoints(studentId, itemId, teacher.id);
    return NextResponse.json(r);
  } catch (e: any) { return errorResponse(e); }
}
