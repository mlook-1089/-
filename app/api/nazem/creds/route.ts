import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { nzSaveCredentials, clearNazemCredentials } from '@/lib/nazem';

export async function POST(req: NextRequest) {
  await requireRole('Teacher');
  const { username, password } = await req.json();
  if (!username || !password) return NextResponse.json({ success: false, message: 'أدخل البيانات' });
  await nzSaveCredentials(username, password);
  return NextResponse.json({ success: true });
}
export async function DELETE() {
  await requireRole('Teacher');
  await clearNazemCredentials();
  return NextResponse.json({ success: true });
}
