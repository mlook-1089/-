import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import { requireRole, createSession, errorResponse } from '@/lib/auth';

// TTL طويل نسبياً حتى تصلح الباركودات المطبوعة لبضعة أشهر،
// لكن كل باركود يعمل مرة واحدة فقط لأن أول استخدام يبطله عبر sessionVersion+1.
const TOKEN_TTL_DAYS = 90;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET || '';
  if (s.replace(/^﻿/, '').trim().length < 32) throw new Error('SESSION_SECRET غير مضبوط');
  return new TextEncoder().encode(s);
}

/** توليد باركودات دخول: teacher-only. body = { ids: [studentId, …] } */
export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { ids } = await req.json();
    const list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
    if (!list.length) return NextResponse.json({ success: false, message: 'حدّد طالباً واحداً على الأقل' }, { status: 400 });

    const rows = await db.select({ id: users.id, name: users.name, role: users.role, sv: users.sessionVersion })
      .from(users).where(inArray(users.id, list));

    const key = secret();
    const tokens = await Promise.all(rows.filter(u => u.role === 'Student').map(async u => {
      // نُضمّن `sv` (نسخة الجلسة) داخل التوكن: أول استخدام يزيدها في القاعدة
      // فيصبح التوكن نفسه غير صالح للاستخدام مرة أخرى.
      const t = await new SignJWT({ id: u.id, sv: Number(u.sv) || 0, k: 'login' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${TOKEN_TTL_DAYS}d`)
        .sign(key);
      return { id: u.id, name: u.name, token: t };
    }));

    return NextResponse.json({ success: true, tokens });
  } catch (e: any) { return errorResponse(e); }
}

/** استهلاك باركود: body = { token }. ينشئ جلسة ويُلزم بتغيير كلمة المرور. */
export async function PUT(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token || typeof token !== 'string') return NextResponse.json({ success: false, message: 'الرابط غير صالح' }, { status: 400 });

    let payload: any;
    try { ({ payload } = await jwtVerify(token, secret())); }
    catch { return NextResponse.json({ success: false, message: 'الباركود منتهي أو غير صالح' }, { status: 401 }); }
    if (payload.k !== 'login') return NextResponse.json({ success: false, message: 'نوع رابط غير مسموح' }, { status: 401 });

    const u = (await db.select().from(users).where(eq(users.id, String(payload.id))))[0];
    if (!u) return NextResponse.json({ success: false, message: 'الطالب غير موجود' }, { status: 404 });
    if (u.role !== 'Student') return NextResponse.json({ success: false, message: 'هذا الرابط للطلاب فقط' }, { status: 403 });

    // أول استخدام: نُبطل الباركود بزيادة sessionVersion ونطلب تعيين كلمة مرور
    if ((Number(payload.sv) || 0) !== (Number(u.sessionVersion) || 0)) {
      return NextResponse.json({ success: false, message: 'استُخدم الباركود مسبقاً — اطلب من المعلم توليد باركود جديد' }, { status: 401 });
    }
    const [row] = await db.update(users)
      .set({ mustChangePw: true, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, u.id))
      .returning();
    await createSession(row);
    return NextResponse.json({ success: true, user: { ID: row.id, Name: row.name, Role: row.role, mustChangePw: true, isAdmin: false } });
  } catch (e: any) { return errorResponse(e); }
}
