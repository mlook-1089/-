import { NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/auth';
import { nzStatus } from '@/lib/nazem';
export async function GET() {
  try {
    await requireRole('Teacher');
    return NextResponse.json({ success: true, ...(await nzStatus()) });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
