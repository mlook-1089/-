import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

const SECRET_KEY = new TextEncoder().encode(process.env.SESSION_SECRET || 'change-this-in-production-please-min-32-chars');
const COOKIE_NAME = 'ibk_session';
const TTL_DAYS = 30;

export type SessionUser = { id: string; name: string; role: 'Teacher'|'Student'|'Parent' };

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_DAYS}d`)
    .sign(SECRET_KEY);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: TTL_DAYS * 24 * 60 * 60, path: '/'
  });
}

export function clearSession() {
  cookies().delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const t = cookies().get(COOKIE_NAME)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, SECRET_KEY);
    return { id: String(payload.id), name: String(payload.name), role: payload.role as any };
  } catch { return null; }
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new AuthError('غير مصادَق عليه');
  return s;
}

export async function requireRole(...roles: SessionUser['role'][]): Promise<SessionUser> {
  const s = await requireSession();
  if (!roles.includes(s.role)) throw new AuthError('غير مصرح');
  return s;
}

export class AuthError extends Error {}

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

/** غلاف مسارات API لإرجاع أخطاء المصادقة كـ 401/403 */
export function apiHandler(fn: () => Promise<any>) {
  return async () => {
    try {
      const data = await fn();
      return NextResponse.json({ success: true, ...data });
    } catch (e: any) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
      console.error(e);
      return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
    }
  };
}
