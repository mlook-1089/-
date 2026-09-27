import { NextResponse } from 'next/server';
import { requireRole, AuthError, errorResponse } from '@/lib/auth';
import { nzStatus } from '@/lib/nazem';
export async function GET() {
  try {
    await requireRole('Teacher');
    return NextResponse.json({ success: true, ...(await nzStatus()) });
  } catch (e: any) { return errorResponse(e); }
}
