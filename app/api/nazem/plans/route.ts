import { NextRequest, NextResponse } from 'next/server';
import { requireRole, errorResponse } from '@/lib/auth';
import { nzPlans } from '@/lib/nazem';

export async function GET(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const termId = new URL(req.url).searchParams.get('term') || '';
    return NextResponse.json({ success: true, plans: await nzPlans(termId) });
  } catch (e: any) { return errorResponse(e); }
}
