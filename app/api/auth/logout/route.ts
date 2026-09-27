import { NextResponse } from 'next/server';
import { clearSession, errorResponse } from '@/lib/auth';
export async function POST() {
  try {
    clearSession();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return errorResponse(e);
  }
}
