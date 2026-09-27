import { db } from './db';
import { badges, plans, studentsData, settings } from '@/db/schema';
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

const DEFAULT_WORK_DAYS = [0, 1, 2, 3, 4]; // الأحد–الخميس

/** أيام الحلقة من الإعدادات (plan_work_days) — الافتراضي الأحد–الخميس. */
export async function getWorkDays(): Promise<number[]> {
  try {
    const v = (await db.select().from(settings).where(eq(settings.key, 'plan_work_days')))[0]?.value || '';
    const days = v.split(',').map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
    return days.length ? days : DEFAULT_WORK_DAYS;
  } catch { return DEFAULT_WORK_DAYS; }
}

// تُرجع true إذا كانت كل الأيام الواقعة حصراً بين dateA وdateB (بدون الطرفين)
// أيامَ عطلة (ليست من أيام الحلقة). أي يوم حلقة غائب بينهما يجعلها false. dateA أقدم من dateB.
function onlyOffDaysBetween(dateA: string, dateB: string, work: Set<number>): boolean {
  const a = new Date(dateA + 'T12:00:00');
  const b = new Date(dateB + 'T12:00:00');
  for (let d = new Date(+a + 864e5); +d < +b; d = new Date(+d + 864e5)) {
    if (work.has(d.getDay())) return false; // يوم حلقة غائب → فجوة حقيقية
  }
  return true;
}

function dayDiff(a: string, b: string) {
  return Math.round((+new Date(b + 'T12:00:00') - +new Date(a + 'T12:00:00')) / 864e5);
}

// السلسلة الحالية: عدد أيام الإنجاز المتتالية المنتهية باليوم أو آخر يوم حلقة.
// الفجوات المكوّنة من أيام العطلة فقط لا تكسر التتابع.
export function computeStreak(dates: string[], workDays: number[] = DEFAULT_WORK_DAYS) {
  const work = new Set(workDays);
  const t = today();
  const uniq = Array.from(new Set(dates.filter(d => d && d <= t))).sort(); // تجاهل الأيام المستقبلية
  if (!uniq.length) return 0;
  const last = uniq[uniq.length - 1];
  // اليوم نفسه لم ينتهِ بعد، فغيابه لا يكسر السلسلة؛ نفحص الأيام بين آخر إنجاز واليوم فقط.
  if (dayDiff(last, t) > 1 && !onlyOffDaysBetween(last, t, work)) return 0;
  let streak = 1;
  for (let i = uniq.length - 1; i > 0; i--) {
    const diff = dayDiff(uniq[i - 1], uniq[i]);
    if (diff === 1 || (diff > 1 && onlyOffDaysBetween(uniq[i - 1], uniq[i], work))) streak++;
    else break;
  }
  return streak;
}

// أطول سلسلة تاريخية — تُستخدم لمنح الشارات حتى لا تُفقد عند الانقطاع.
// بنفس قاعدة العطلات، وإلا استحال «أسبوع كامل» على حلقة تعمل ٥ أيام.
export function computeMaxStreak(dates: string[], workDays: number[] = DEFAULT_WORK_DAYS) {
  const work = new Set(workDays);
  const sorted = Array.from(new Set(dates.filter(Boolean))).sort();
  if (!sorted.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = dayDiff(sorted[i - 1], sorted[i]);
    if (diff === 1 || (diff > 1 && onlyOffDaysBetween(sorted[i - 1], sorted[i], work))) cur++;
    else cur = 1;
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
  const streak = computeMaxStreak(donePlans.map(p => String(p.date)), await getWorkDays());
  const existing = await db.select().from(badges).where(eq(badges.studentId, studentId));
  const have = new Set(existing.map(b => b.code));
  const ctx = { donePlans, streak, points: student.totalPoints || 0 };
  for (const def of BADGE_DEFS) {
    if (have.has(def.code)) continue;
    try {
      if (def.check(ctx)) {
        await db.insert(badges).values({
          id: genId('B'), studentId, code: def.code, title: def.title, icon: def.icon, date: today()
        }).onConflictDoNothing();
      }
    } catch { /* skip */ }
  }
}
