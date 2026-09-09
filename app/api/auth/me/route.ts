import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ success: false });
  return NextResponse.json({ success: true, user: { ID: s.id, Name: s.name, Role: s.role } });
}
