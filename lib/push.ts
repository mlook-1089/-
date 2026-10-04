import webpush from 'web-push';
import { db } from '@/lib/db';
import { pushSubscriptions, studentsData, users, settings } from '@/db/schema';
import { inArray, eq } from 'drizzle-orm';

// تهيئة كسولة لمفاتيح VAPID — تُضبط مرة واحدة فقط
// إزالة BOM/مسافات دفاعياً (PowerShell pipe قد يضيف U+FEFF عند ضبط متغيّرات البيئة)
export function cleanEnv(v?: string | null): string {
  const s = String(v == null ? '' : v);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code === 0xFEFF || code === 0x200B || code === 0xFFFE) continue;
    out += s[i];
  }
  return out.trim();
}

let _vapidReady: boolean | null = null;
function ensureVapid(): boolean {
  if (_vapidReady !== null) return _vapidReady;
  const pub = cleanEnv(process.env.PUSH_VAPID_PUBLIC);
  const priv = cleanEnv(process.env.PUSH_VAPID_PRIVATE);
  if (!pub || !priv) {
    _vapidReady = false;
    return false;
  }
  try {
    webpush.setVapidDetails(
      cleanEnv(process.env.PUSH_VAPID_SUBJECT) || 'mailto:admin@example.com',
      pub,
      priv
    );
    _vapidReady = true;
  } catch {
    _vapidReady = false;
  }
  return _vapidReady;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type PushAudience = 'all' | 'students' | 'parents' | 'students_parents';
export type PushPolicy = { enabled: boolean; audience: PushAudience; news: boolean; absence: boolean };

const POLICY_DEFAULT: PushPolicy = { enabled: true, audience: 'all', news: true, absence: true };

/**
 * قراءة سياسة الإشعارات من جدول settings. دفاعية — تُرجع الافتراضيات عند أي فشل.
 */
async function loadPolicy(): Promise<PushPolicy> {
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, [
      'push_enabled', 'push_audience', 'push_news_enabled', 'push_absence_enabled'
    ]));
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value || ''; });

    const enabled = map['push_enabled'] === undefined || map['push_enabled'] === '' ? true : map['push_enabled'] === 'true';
    const rawAud = (map['push_audience'] || '') as PushAudience;
    const audience: PushAudience = (['all','students','parents','students_parents'] as const).includes(rawAud as any) ? rawAud : 'all';
    const news = map['push_news_enabled'] === undefined || map['push_news_enabled'] === '' ? true : map['push_news_enabled'] === 'true';
    const absence = map['push_absence_enabled'] === undefined || map['push_absence_enabled'] === '' ? true : map['push_absence_enabled'] === 'true';

    return { enabled, audience, news, absence };
  } catch {
    return { ...POLICY_DEFAULT };
  }
}

/**
 * أرسل إشعاراً لمجموعة مستخدمين. دفاعية بالكامل — لا ترمي أبداً.
 * تحذف الاشتراكات المنتهية (404/410) تلقائياً.
 * `kind` يتحكّم في تطبيق سياسة الإشعارات: 'news' يحترم push_news_enabled، 'absence' يحترم push_absence_enabled.
 */
export async function notifyUsers(userIds: string[], payload: PushPayload, kind?: 'news' | 'absence' | 'other' | 'staff'): Promise<void> {
  try {
    if (!ensureVapid()) return; // no-op عند غياب المفاتيح
    const ids = (userIds || []).filter(Boolean);
    if (!ids.length) return;

    // بوابة السياسة
    const policy = await loadPolicy();
    if (!policy.enabled) return;
    if (kind === 'news' && !policy.news) return;
    if (kind === 'absence' && !policy.absence) return;

    // فلتر الجمهور: اجلب أدوار المستخدمين وارشح
    // 'staff' موجّه للمعلمين/المشرفين — لا يخضع لجمهور الطلاب/الأولياء
    let allowedIds = ids;
    if (policy.audience !== 'all' && kind !== 'staff') {
      const uRows = await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, ids));
      const roleMap = new Map<string, string>();
      uRows.forEach(u => { roleMap.set(u.id, u.role); });
      allowedIds = ids.filter(id => {
        const r = roleMap.get(id);
        if (!r) return false;
        if (policy.audience === 'students') return r === 'Student';
        if (policy.audience === 'parents') return r === 'Parent';
        if (policy.audience === 'students_parents') return r === 'Student' || r === 'Parent';
        return true;
      });
    }
    if (!allowedIds.length) return;

    const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, allowedIds));
    if (!subs.length) return;

    const data = JSON.stringify(payload);

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data
        );
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          // اشتراك منتهٍ — احذفه
          try { await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)); } catch {}
        }
        // غير ذلك: نتجاهل الخطأ ولا نُفشل البقية
      }
    }));
  } catch {
    // دفاعية: لا ترمي أبداً
  }
}

/**
 * أرسل تنبيه غياب لولي أمر الطالب. دفاعية — لا ترمي أبداً.
 */
export async function notifyAbsence(studentId: string, date: string): Promise<void> {
  try {
    if (!studentId) return;

    const sdRows = await db.select({ parentId: studentsData.parentId })
      .from(studentsData)
      .where(eq(studentsData.studentId, studentId))
      .limit(1);
    const parentId = sdRows[0]?.parentId;
    if (!parentId) return;

    const uRows = await db.select({ name: users.name })
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);
    const studentName = uRows[0]?.name || 'الطالب';

    await notifyUsers([parentId], {
      title: 'تنبيه غياب',
      body: 'ابنك ' + studentName + ' سُجّل غائباً اليوم',
      url: '/',
      tag: 'absence-' + studentId
    }, 'absence');
  } catch {
    // دفاعية: لا ترمي أبداً
  }
}
