import { NextRequest, NextResponse } from 'next/server';
import { logPoints } from '@/lib/triggers';
import { requireRole, AuthError } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { studentId, itemId } = await req.json();
    const r = await logPoints(studentId, itemId, teacher.id);
    return NextResponse.json(r);
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ success: false, message: e?.message || 'غير مصرّح' }, { status: 401 });
    }
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
