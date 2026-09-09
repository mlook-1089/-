import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { nzStatus } from '@/lib/nazem';
export async function GET() {
  await requireRole('Teacher');
  return NextResponse.json({ success: true, ...(await nzStatus()) });
}
