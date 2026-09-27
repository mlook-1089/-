import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { createSession, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { id, password } = await req.json();
    if (!id || !password) return NextResponse.json({ success: false, message: 'أدخل المعرّف وكلمة المرور' }, { status: 400 });
    const rows = await db.select().from(users).where(sql`lower(${users.id}) = lower(${id})`);
    const u = rows[0];
    if (!u) return NextResponse.json({ success: false, message: 'المعرّف أو كلمة المرور غير صحيحة' });
    const ok = await verifyPassword(password, u.passwordHash);
    if (!ok) return NextResponse.json({ success: false, message: 'المعرّف أو كلمة المرور غير صحيحة' });
    await createSession({ id: u.id, name: u.name, role: u.role as any });
    return NextResponse.json({ success: true, user: { ID: u.id, Name: u.name, Role: u.role, mustChangePw: u.mustChangePw || false, isAdmin: u.isAdmin || false } });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
