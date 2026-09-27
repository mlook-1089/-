import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireSession, verifyPassword, hashPassword, AuthError } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const { oldPassword, newPassword } = await req.json();
    if (!newPassword || String(newPassword).length < 4) return NextResponse.json({ success: false, message: 'كلمة المرور قصيرة جداً' });
    const u = (await db.select().from(users).where(eq(users.id, s.id)))[0];
    if (!u) return NextResponse.json({ success: false, message: 'المستخدم غير موجود' });
    const ok = await verifyPassword(oldPassword, u.passwordHash);
    if (!ok) return NextResponse.json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    await db.update(users).set({ passwordHash: await hashPassword(newPassword), mustChangePw: false }).where(eq(users.id, s.id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
