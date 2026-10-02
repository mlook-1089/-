import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { createSession, errorResponse } from '@/lib/auth';
import { normAr } from '@/lib/utils';

const NAZEM_API = 'https://api.nazem-plus.com';
const NAZEM_ORIGIN = 'https://nazem-plus.com';

type CookieMap = Record<string, string>;

function extractCookies(res: Response, current: CookieMap): { cookies: CookieMap; xsrf: string } {
  const sc: string[] = [];
  res.headers.forEach((v, k) => { if (k.toLowerCase() === 'set-cookie') sc.push(v); });
  // @ts-ignore — Node 20+
  if (typeof (res.headers as any).getSetCookie === 'function') sc.push(...(res.headers as any).getSetCookie());
  const map = { ...current };
  let xsrf = '';
  for (const line of sc) {
    const first = line.split(';')[0];
    const idx = first.indexOf('=');
    if (idx > 0) {
      const n = first.slice(0, idx).trim();
      const v = first.slice(idx + 1).trim();
      map[n] = v;
      if (n === 'XSRF-TOKEN') xsrf = decodeURIComponent(v);
    }
  }
  return { cookies: map, xsrf };
}

function cookieHeader(c: CookieMap) {
  return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ');
}

export async function POST(req: NextRequest) {
  try {
    const { identity } = await req.json();
    const id = String(identity || '').trim();
    if (!id || !/^\d{9,10}$/.test(id)) {
      return NextResponse.json({ success: false, message: 'أدخل رقم الهوية أو الإقامة (9-10 أرقام)' }, { status: 400 });
    }

    // Fresh isolated Nazem session — must NOT use nzFetch (would overwrite teacher session in DB)
    let cookies: CookieMap = {};
    let xsrf = '';

    const base = { 'Origin': NAZEM_ORIGIN, 'Referer': NAZEM_ORIGIN + '/', 'Accept': 'application/json' };

    // 1. CSRF cookie
    const csrfRes = await fetch(NAZEM_API + '/api/csrf-cookie', { headers: base, redirect: 'manual' });
    ({ cookies, xsrf } = extractCookies(csrfRes, cookies));

    // 2. Login with identity as username+password (Nazem convention for students)
    const loginRes = await fetch(NAZEM_API + '/api/login', {
      method: 'POST',
      headers: {
        ...base,
        'Content-Type': 'application/json',
        'Cookie': cookieHeader(cookies),
        ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {})
      },
      body: JSON.stringify({ username: id, password: id, remember: true }),
      redirect: 'manual'
    });
    ({ cookies, xsrf } = extractCookies(loginRes, cookies));

    if (loginRes.status !== 200) {
      return NextResponse.json(
        { success: false, message: 'لم يُعثر على حساب في نظام ناظم بهذا الرقم — تأكّد من الرقم أو تواصل مع المعلم' },
        { status: 401 }
      );
    }

    // 3. Fetch student name from Nazem
    const profileRes = await fetch(NAZEM_API + '/api/user', {
      headers: { ...base, 'Cookie': cookieHeader(cookies) }
    });

    if (profileRes.status !== 200) {
      return NextResponse.json({ success: false, message: 'تعذّر جلب بيانات ناظم' }, { status: 502 });
    }

    const profile = await profileRes.json().catch(() => null);
    const nazemName: string = profile?.data?.name || profile?.name || '';
    if (!nazemName) {
      return NextResponse.json({ success: false, message: 'الاسم غير موجود في ناظم — تواصل مع المعلم' }, { status: 502 });
    }

    // 4. Find matching student in Ibn Kathir by normalized Arabic name
    const students = await db.select({
      id: users.id, name: users.name, role: users.role, sessionVersion: users.sessionVersion
    }).from(users).where(sql`${users.role} = 'Student'`);

    const normalized = normAr(nazemName);
    const match = students.find(u => normAr(u.name) === normalized);

    if (!match) {
      return NextResponse.json({
        success: false,
        message: `الاسم في ناظم «${nazemName}» لا يطابق أي طالب مسجَّل في ابن كثير — تواصل مع المعلم`
      }, { status: 404 });
    }

    // 5. Mark mustChangePw and create session
    const [updated] = await db.update(users)
      .set({ mustChangePw: true, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, match.id))
      .returning();

    await createSession(updated);

    return NextResponse.json({
      success: true,
      user: { ID: updated.id, Name: updated.name, Role: updated.role, mustChangePw: true, isAdmin: false }
    });
  } catch (e: any) { return errorResponse(e); }
}
