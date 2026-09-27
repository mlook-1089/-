import { db } from './db';
import { loginAttempts } from '@/db/schema';
import { eq, inArray, lt } from 'drizzle-orm';

// حدّ تخمين كلمات المرور: بعد MAX_FAILS محاولات فاشلة خلال WINDOW يُقفل المفتاح لمدة LOCK.
// المفتاح لكل حساب (id:<معرّف>) ولكل عنوان IP (ip:<عنوان>) بحد أعلى، لأن عدة طلاب قد يدخلون من شبكة المسجد نفسها.
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const LIMITS: Record<string, number> = { id: 5, ip: 100 };

function limitOf(key: string) { return LIMITS[key.split(':')[0]] || 5; }

/** يعيد عدد الدقائق المتبقية على القفل إن كان أي مفتاح مقفلاً، وإلا 0. لا يُفشل الدخول إن تعذّرت القراءة. */
export async function lockedMinutes(keys: string[]): Promise<number> {
  try {
    const rows = await db.select().from(loginAttempts).where(inArray(loginAttempts.key, keys));
    const now = Date.now();
    let max = 0;
    for (const r of rows) {
      const until = r.lockedUntil ? +new Date(r.lockedUntil) : 0;
      if (until > now) max = Math.max(max, Math.ceil((until - now) / 60000));
    }
    return max;
  } catch { return 0; }
}

export async function recordFailure(keys: string[]) {
  try {
    const now = new Date();
    // تنظيف خفيف: سجلات انتهت نافذتها وقفلها منذ أكثر من يوم (معرّفات عشوائية جرّبها أحدهم)
    if (Math.random() < 0.05) await db.delete(loginAttempts).where(lt(loginAttempts.windowStart, new Date(+now - 864e5)));
    for (const key of keys) {
      const r = (await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)))[0];
      const fresh = !r || (+now - +new Date(r.windowStart)) > WINDOW_MS;
      const fails = fresh ? 1 : r.fails + 1;
      const lockedUntil = fails >= limitOf(key) ? new Date(+now + LOCK_MS) : null;
      const values = { fails, windowStart: fresh ? now : new Date(r!.windowStart), lockedUntil };
      if (r) await db.update(loginAttempts).set(values).where(eq(loginAttempts.key, key));
      else await db.insert(loginAttempts).values({ key, ...values }).onConflictDoNothing();
    }
  } catch { /* لا نكسر الدخول إن فشل التسجيل */ }
}

export async function clearFailures(keys: string[]) {
  try { await db.delete(loginAttempts).where(inArray(loginAttempts.key, keys)); } catch {}
}
