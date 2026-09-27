import { db } from './db';
import { badges, plans, studentsData } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { genId, today } from './utils';

export const BADGE_DEFS: { code: string; icon: string; title: string; check: (ctx: any) => boolean }[] = [
  { code: 'FIRST_DONE', icon: '🌱', title: 'أول حفظ', check: ({ donePlans }) => donePlans.length >= 1 },
  { code: 'STREAK_3',   icon: '🔥', title: '٣ أيام متتالية', check: ({ streak }) => streak >= 3 },
  { code: 'STREAK_7',   icon: '⚡', title: 'أسبوع كامل', check: ({ streak }) => streak >= 7 },
  { code: 'STREAK_30',  icon: '🏆', title: 'شهر متواصل', check: ({ streak }) => streak >= 30 },
  { code: 'PT_50',      icon: '⭐', title: '٥٠ نقطة', check: ({ points }) => points >= 50 },
  { code: 'PT_200',     icon: '💎', title: '٢٠٠ نقطة', check: ({ points }) => points >= 200 },
  { code: 'DONE_20',    icon: '📗', title: '٢٠ ورد مكتمل', check: ({ donePlans }) => donePlans.length >= 20 }
];

// تُرجع true إذا كانت كل الأيام الواقعة حصراً بين dateA وdateB (بدون الطرفين)
// جُمَعاً/سبوتاً فقط (الجمعة=5 والسبت=6 في التقويم السعودي). أي وجود يوم عمل
// غائب بينهما يجعلها false. dateA أقدم من dateB.
function onlyWeekendBetween(dateA: string, dateB: string): boolean {
  const a = new Date(dateA + 'T12:00:00');
  const b = new Date(dateB + 'T12:00:00');
  for (let d = new Date(+a + 864e5); +d < +b; d = new Date(+d + 864e5)) {
    const wd = d.getDay();
    if (wd !== 5 && wd !== 6) return false; // يوم عمل غائب → فجوة حقيقية
  }
  return true;
}

// السلسلة الحالية: عدد الأيام المتتالية المنتهية باليوم أو أمس (توقيت الرياض).
// إن كان آخر إنجاز قبل أمس فالسلسلة الحالية = 0.
// ملاحظة: فجوة مكوّنة فقط من أيام العطلة (الجمعة/السبت) لا تكسر التتابع،
// حتى تعمل الحلقات الأحد–الخميس بلا تصفير كل نهاية أسبوع.
export function computeStreak(dates: string[]) {
  const uniq = Array.from(new Set(dates.filter(Boolean))).sort();
  if (!uniq.length) return 0;
  const t = today();
  const last = uniq[uniq.length - 1];
  const gap = Math.round((+new Date(t + 'T12:00:00') - +new Date(last + 'T12:00:00')) / 864e5);
  // آخر إنجاز خلال اليوم/أمس، أو أن كل الأيام الغائبة حتى اليوم عطلة فقط → لا تزال السلسلة حيّة.
  if (gap > 1 && !onlyWeekendBetween(last, t)) return 0;
  let streak = 1;
  for (let i = uniq.length - 1; i > 0; i--) {
    const cur = uniq[i];
    const prev = uniq[i - 1];
    const diff = Math.round((+new Date(cur + 'T12:00:00') - +new Date(prev + 'T12:00:00')) / 864e5);
    // متتاليان فعلاً، أو الفجوة بينهما كلها عطلة (جمعة/سبت) → نعدّهما متتاليين.
    if (diff === 1 || (diff > 1 && onlyWeekendBetween(prev, cur))) streak++;
    else break;
  }
  return streak;
}

// أطول سلسلة تاريخية (المنطق القديم) — تُستخدم لمنح الشارات حتى لا تُفقد عند الانقطاع.
export function computeMaxStreak(dates: string[]) {
  const sorted = Array.from(new Set(dates.filter(Boolean))).sort();
  if (!sorted.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T12:00:00');
    const now = new Date(sorted[i] + 'T12:00:00');
    const diff = Math.round((+now - +prev) / 864e5);
    if (diff === 1) cur++;
    else if (diff > 1) cur = 1;
    if (cur > best) best = cur;
  }
  return best;
}

export async function tryAwardBadges(studentId: string) {
  const student = (await db.select().from(studentsData).where(eq(studentsData.studentId, studentId)))[0];
  if (!student) return;
  const stPlans = await db.select().from(plans).where(eq(plans.studentId, studentId));
  const donePlans = stPlans.filter(p => p.status === 'Done');
  // نستخدم أطول سلسلة تاريخية لفحص شارات السلسلة حتى لا تُفقد عند انقطاع السلسلة الحالية.
  const streak = computeMaxStreak(donePlans.map(p => String(p.date)));
  const existing = await db.select().from(badges).where(eq(badges.studentId, studentId));
  const have = new Set(existing.map(b => b.code));
  const ctx = { donePlans, streak, points: student.totalPoints || 0 };
  for (const def of BADGE_DEFS) {
    if (have.has(def.code)) continue;
    try {
      if (def.check(ctx)) {
        await db.insert(badges).values({
          id: genId('B'), studentId, code: def.code, title: def.title, icon: def.icon, date: today()
        });
      }
    } catch { /* skip */ }
  }
}
