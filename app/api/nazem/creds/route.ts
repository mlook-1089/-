import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/auth';
import { nzSaveCredentials, clearNazemCredentials } from '@/lib/nazem';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { username, password } = await req.json();
    if (!username || !password) return NextResponse.json({ success: false, message: 'أدخل البيانات' });
    await nzSaveCredentials(username, password);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
export async function DELETE() {
  try {
    await requireRole('Teacher');
    await clearNazemCredentials();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
