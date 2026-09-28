import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireSession, verifyPassword, hashPassword, createSession, errorResponse } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const { oldPassword, newPassword } = await req.json();
    const pw = String(newPassword || '');
    if (pw.length < 6) return NextResponse.json({ success: false, message: 'كلمة المرور يجب أن تكون ٦ خانات على الأقل' });
    if (/^(\d)\1+$/.test(pw) || ['123456', '1234567', '12345678', '654321'].includes(pw))
      return NextResponse.json({ success: false, message: 'كلمة المرور سهلة التخمين — اختر غيرها' });
    const u = (await db.select().from(users).where(eq(users.id, s.id)))[0];
    if (!u) return NextResponse.json({ success: false, message: 'المستخدم غير موجود' });
    // كلمة افتراضية/مؤقتة (mustChangePw): لا نطلب الحالية — الحساب موسوم بأنه يحتاج تعيين كلمة أولية.
    // في غير ذلك نتحقق من الحالية كالمعتاد ولا نسمح بنفس القيمة.
    if (!u.mustChangePw) {
      const ok = await verifyPassword(String(oldPassword || ''), u.passwordHash);
      if (!ok) return NextResponse.json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
      if (pw === String(oldPassword)) return NextResponse.json({ success: false, message: 'اختر كلمة مرور مختلفة عن الحالية' });
    }
    // نزيد نسخة الجلسة لإبطال الجلسات على الأجهزة الأخرى، ثم نصدر جلسة جديدة لهذا الجهاز.
    const [row] = await db.update(users)
      .set({ passwordHash: await hashPassword(pw), mustChangePw: false, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, s.id))
      .returning();
    await createSession(row);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return errorResponse(e);
  }
}
