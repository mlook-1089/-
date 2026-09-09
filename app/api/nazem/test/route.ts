import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { nzTest } from '@/lib/nazem';

export async function GET() {
  try {
    await requireRole('Teacher');
    const r = await nzTest();
    return NextResponse.json({ success: true, message: 'تم الاتصال', ...r });
  } catch (e: any) { return NextResponse.json({ success: false, message: e?.message }); }
}
