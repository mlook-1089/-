import { NextResponse } from 'next/server';
import { clearSession, AuthError } from '@/lib/auth';
export async function POST() {
  try {
    clearSession();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
