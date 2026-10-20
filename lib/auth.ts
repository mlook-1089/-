import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from '@/db/schema';

const COOKIE_NAME = 'ibk_session';
const TTL_DAYS = 30;

// المفتاح يُقرأ عند أول استخدام (لا عند تحميل الوحدة) حتى لا يفشل البناء.
// لا قيمة احتياطية: غياب SESSION_SECRET يعني أن أي أحد يستطيع تزوير الجلسات.
let _key: Uint8Array | null = null;
function secretKey(): Uint8Array {
  if (_key) return _key;
  const s = process.env.SESSION_SECRET || '';
  if (s.replace(/^﻿/, '').trim().length < 32) throw new Error('SESSION_SECRET غير مضبوط أو أقصر من 32 حرفاً');
  _key = new TextEncoder().encode(s); // القيمة كما هي (دون تنظيف) حتى تبقى الجلسات الحالية صالحة
  return _key;
}

export type Role = 'Teacher' | 'Student' | 'Parent';
export type SessionUser = { id: string; name: string; role: Role; isAdmin: boolean; mustChangePw: boolean };

/** sv = نسخة الجلسة؛ تزيد عند تغيير كلمة المرور فتُبطل كل الجلسات السابقة. */
export async function createSession(user: { id: string; name: string; role: string; sessionVersion?: number | null }) {
  const token = await new SignJWT({ id: user.id, name: user.name, role: user.role, sv: Number(user.sessionVersion) || 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_DAYS}d`)
    .sign(secretKey());
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: TTL_DAYS * 24 * 60 * 60, path: '/'
  });
}

export function clearSession() {
  cookies().delete(COOKIE_NAME);
}

/**
 * يتحقق من التوقيع ثم من قاعدة البيانات: المستخدم موجود، ونسخة الجلسة مطابقة.
 * الدور والاسم وصلاحية المشرف تُقرأ من القاعدة لا من التوكن، فأي تعديل عليها يسري فوراً.
 */
export async function getSession(): Promise<SessionUser | null> {
  const t = cookies().get(COOKIE_NAME)?.value;
  if (!t) return null;
  let payload: any;
  try { ({ payload } = await jwtVerify(t, secretKey())); } catch { return null; }
  const row = (await db.select({
    id: users.id, name: users.name, role: users.role, isAdmin: users.isAdmin,
    mustChangePw: users.mustChangePw, sessionVersion: users.sessionVersion
  }).from(users).where(eq(users.id, String(payload.id))))[0];
  if (!row) return null;
  if ((Number(payload.sv) || 0) !== (Number(row.sessionVersion) || 0)) return null;
  return { id: row.id, name: row.name, role: row.role as Role, isAdmin: !!row.isAdmin, mustChangePw: !!row.mustChangePw };
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new AuthError('غير مصادَق عليه');
  return s;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const s = await requireSession();
  if (!roles.includes(s.role)) throw new ForbiddenError('غير مصرح');
  return s;
}

/** معلم بصلاحية مشرف */
export async function requireAdmin(): Promise<SessionUser> {
  const s = await requireRole('Teacher');
  if (!s.isAdmin) throw new ForbiddenError('هذه العملية مقصورة على المشرف');
  return s;
}

export class AuthError extends Error { constructor(message?: string){ super(message); this.name = 'AuthError'; } }
export class ForbiddenError extends Error { constructor(message?: string){ super(message); this.name = 'ForbiddenError'; } }

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

/** ردّ خطأ موحّد: 401 لانتهاء الجلسة (تعيد الواجهة لشاشة الدخول)، 403 للرفض، 500 لغيرها. */
export function errorResponse(e: any) {
  if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ success: false, message: e.message }, { status: 403 });
  // Postgres 23505: unique_violation — نُترجم ما يخصّ خطط الأوراد لرسالة بالعربية بدل stack technical.
  const pgCode = e?.code || e?.cause?.code;
  const pgConstraint = String(e?.constraint_name || e?.constraint || e?.cause?.constraint_name || e?.cause?.constraint || '');
  if (pgCode === '23505') {
    let friendly = 'سجل مكرّر: هذا الصف موجود مسبقاً.';
    if (pgConstraint.includes('plans_student_date_type_uniq')) {
      friendly = 'يوجد ورد لهذا الطالب في نفس اليوم والنوع — عدّله بدلاً من إنشاء ورد ثانٍ.';
    } else if (pgConstraint.includes('att_student_date_uniq')) {
      friendly = 'يوجد سجل حضور لهذا الطالب في هذا اليوم — عدّله بدلاً من إنشاء آخر.';
    } else if (pgConstraint.includes('badges_student_code_uniq')) {
      friendly = 'الطالب يملك شارة بهذا الرمز مسبقاً.';
    } else if (pgConstraint.includes('ta_period_student_hizb_uniq')) {
      friendly = 'هذا الحزب أُسنِد للطالب في هذه الفترة من قبل.';
    } else if (pgConstraint.includes('tr_assignment_uniq')) {
      friendly = 'يوجد سجل سرد لهذا الإسناد مسبقاً.';
    }
    return NextResponse.json({ success: false, message: friendly }, { status: 409 });
  }
  console.error(e);
  return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
}

/** غلاف مسارات API لإرجاع أخطاء المصادقة كـ 401/403 */
export function apiHandler(fn: () => Promise<any>) {
  return async () => {
    try {
      const data = await fn();
      return NextResponse.json({ success: true, ...data });
    } catch (e: any) {
      return errorResponse(e);
    }
  };
}

/**
 * تجزئة كلمة مرور مؤقتة (يُجبَر صاحبها على تغييرها عند أول دخول، فتُعاد تجزئتها بالكلفة الكاملة).
 * كلفة أقل تجعل إنشاء عشرات الحسابات دفعة واحدة ممكناً ضمن مهلة الخادم.
 */
export async function hashTempPassword(pw: string) { return bcrypt.hash(pw, 8); }
