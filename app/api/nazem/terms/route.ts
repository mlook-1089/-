import { NextResponse } from 'next/server';
import { requireRole, errorResponse } from '@/lib/auth';
import { nzTerms } from '@/lib/nazem';
export async function GET() {
  try { await requireRole('Teacher'); return NextResponse.json({ success: true, terms: await nzTerms() }); }
  catch (e: any) { return errorResponse(e); }
}
