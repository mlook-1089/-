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

export function computeStreak(dates: string[]) {
  const sorted = dates.filter(Boolean).sort();
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
  const last = sorted[sorted.length - 1];
  const t = today();
  const dl = Math.round((+new Date(t + 'T12:00:00') - +new Date(last + 'T12:00:00')) / 864e5);
  return dl <= 1 ? Math.max(best, cur) : best;
}

export async function tryAwardBadges(studentId: string) {
  const student = (await db.select().from(studentsData).where(eq(studentsData.studentId, studentId)))[0];
  if (!student) return;
  const stPlans = await db.select().from(plans).where(eq(plans.studentId, studentId));
  const donePlans = stPlans.filter(p => p.status === 'Done');
  const streak = computeStreak(donePlans.map(p => String(p.date)));
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
