import { NextRequest, NextResponse } from 'next/server';
import { requireRole, errorResponse } from '@/lib/auth';
import { nzFollowUp } from '@/lib/nazem';

export async function GET(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const u = new URL(req.url).searchParams;
    return NextResponse.json({ success: true, data: await nzFollowUp(u.get('planId')||'', u.get('date')||'') });
  } catch (e: any) { return errorResponse(e); }
}
