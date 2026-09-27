import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { createSession, verifyPassword, errorResponse } from '@/lib/auth';
import { lockedMinutes, recordFailure, clearFailures } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const { id, password } = await req.json();
    if (!id || !password) return NextResponse.json({ success: false, message: 'أدخل المعرّف وكلمة المرور' }, { status: 400 });
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    // المفتاح الخاص بالمعرّف يقي من تخمين كلمة حساب بعينه، ومفتاح الـ IP يحدّ من المسح الواسع.
    const keys = ['id:' + String(id).toLowerCase().trim(), 'ip:' + ip];
    const mins = await lockedMinutes(keys);
    if (mins > 0) return NextResponse.json({ success: false, message: `محاولات كثيرة خاطئة — حاول بعد ${mins} دقيقة` }, { status: 429 });

    const u = (await db.select().from(users).where(sql`lower(${users.id}) = lower(${id})`))[0];
    const ok = u ? await verifyPassword(String(password), u.passwordHash) : false;
    if (!u || !ok) {
      await recordFailure(keys);
      return NextResponse.json({ success: false, message: 'المعرّف أو كلمة المرور غير صحيحة' });
    }
    await clearFailures([keys[0]]);
    await createSession(u);
    return NextResponse.json({ success: true, user: { ID: u.id, Name: u.name, Role: u.role, mustChangePw: u.mustChangePw || false, isAdmin: u.isAdmin || false } });
  } catch (e: any) {
    return errorResponse(e);
  }
}
