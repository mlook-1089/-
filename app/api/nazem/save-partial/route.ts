import { NextRequest, NextResponse } from 'next/server';
import { requireRole, errorResponse } from '@/lib/auth';
import { nzSavePartial } from '@/lib/nazem';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { itemDayId, payload } = await req.json();
    return NextResponse.json(await nzSavePartial(itemDayId, payload));
  } catch (e: any) { return errorResponse(e); }
}
