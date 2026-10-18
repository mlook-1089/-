// حساب تقدّم خطة فصلية واقتراح ورد اليوم.
// النموذج: موضع التقدّم مُشتقّ (لا مُخزَّن) من آخر صف plans بـ status∈{Done,Partial}
// لهذه الخطة. اقتراح اليوم = من progressOrd+1 (أو -1 للتنازلي) بمقدار dailyPages
// باستخدام "محاسبة الصفحة" (منقولة من app/api/plans/generate/route.ts).
import { db } from './db';
import { plans, planDefinitions } from '@/db/schema';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { SURAHS, ayahOrdinal, fromOrdinal, PAGE_FIRST, PAGE_LAST, pageOfOrdinal } from './utils';

export interface Range {
  fromSurah: string; fromAyah: number | string;
  toSurah: string;   toAyah: number | string;
}

// الحقول التي يحتاجها الحساب — ما يسمح باستدعاء الدوال من استعلامات ناقصة.
export interface PlanDefLike {
  id: string;
  studentId: string;
  type: string;
  ranges: Range[] | unknown;
  dailyPages: string;
  direction: string | null;
}

export interface PlanProgress {
  progressOrd: number | null;   // null = لم يبدأ أي ورد Done/Partial بعد
  currentRangeIndex: number;    // 0-based في ranges[]
  isComplete: boolean;
}

export interface PlanSuggestion {
  fromSurah: string; fromAyah: number;
  toSurah: string;   toAyah: number;
  amount: string; pages: number;
  planDefId: string;
}

// ─── محاسبة الصفحة (نقل حرفي من /api/plans/generate/route.ts) ────────────────

export function endAyahForPages(startOrd: number, dailyPages: number, maxOrd: number): number {
  if (!(dailyPages > 0)) return startOrd;
  let ord = startOrd, budget = dailyPages, safety = 0;
  while (budget > 0 && ord <= maxOrd && safety++ < 2000) {
    const page = pageOfOrdinal(ord);
    if (page < 1 || page > 604) break;
    const pageFirst = PAGE_FIRST[page - 1], pageLast = PAGE_LAST[page - 1];
    const pageSize = pageLast - pageFirst + 1;
    const positionInPage = ord - pageFirst;
    const fractionLeftInPage = (pageSize - positionInPage) / pageSize;
    if (budget + 1e-9 >= fractionLeftInPage) {
      ord = pageLast + 1; budget -= fractionLeftInPage;
    } else {
      const ayatToTake = Math.max(1, Math.round(pageSize * budget));
      ord += ayatToTake; budget = 0;
    }
  }
  return Math.min(Math.max(startOrd, ord - 1), maxOrd);
}

export function startAyahForPagesDesc(endOrd: number, dailyPages: number, minOrd: number): number {
  if (!(dailyPages > 0)) return endOrd;
  let ord = endOrd, budget = dailyPages, safety = 0;
  while (budget > 0 && ord >= minOrd && safety++ < 2000) {
    const page = pageOfOrdinal(ord);
    if (page < 1 || page > 604) break;
    const pageFirst = PAGE_FIRST[page - 1], pageLast = PAGE_LAST[page - 1];
    const pageSize = pageLast - pageFirst + 1;
    const positionFromEnd = pageLast - ord;
    const fractionLeftInPage = (pageSize - positionFromEnd) / pageSize;
    if (budget + 1e-9 >= fractionLeftInPage) {
      ord = pageFirst - 1; budget -= fractionLeftInPage;
    } else {
      const ayatToTake = Math.max(1, Math.round(pageSize * budget));
      ord -= ayatToTake; budget = 0;
    }
  }
  return Math.max(Math.min(endOrd, ord + 1), minOrd);
}

// ─── مساعدات داخلية ─────────────────────────────────────────────────────────

function rangeStartOrd(r: Range): number | null {
  if (!r || !SURAHS.includes(r.fromSurah)) return null;
  const a = Number(r.fromAyah);
  if (!isFinite(a) || a <= 0) return null;
  return ayahOrdinal(r.fromSurah, a);
}

function rangeEndOrd(r: Range): number | null {
  if (!r || !SURAHS.includes(r.toSurah)) return null;
  const a = Number(r.toAyah);
  if (!isFinite(a) || a <= 0) return null;
  return ayahOrdinal(r.toSurah, a);
}

/** قائمة النطاقات بترتيب التقدّم (تنازلي للـ desc = معكوسة). */
function orderedRanges(ranges: Range[], direction: string): Range[] {
  return direction === 'desc' ? [...ranges].reverse() : ranges;
}

// ─── الدوال العامة ──────────────────────────────────────────────────────────

/**
 * progressOrd المشتقّ من آخر plan status∈{Done,Partial} لهذه الخطة.
 * نستخدم actual_to_* إذا وُجد، وإلا to_*.
 */
export async function getProgress(def: PlanDefLike): Promise<PlanProgress> {
  const direction = def.direction === 'desc' ? 'desc' : 'asc';
  const ranges = Array.isArray(def.ranges) ? (def.ranges as Range[]) : [];

  const [last] = await db.select({
    actualToSurah: plans.actualToSurah, actualToAyah: plans.actualToAyah,
    toSurah: plans.toSurah, toAyah: plans.toAyah
  }).from(plans)
    .where(and(eq(plans.planDefId, def.id), inArray(plans.status, ['Done', 'Partial'])))
    .orderBy(desc(plans.date))
    .limit(1);

  if (!last) return { progressOrd: null, currentRangeIndex: 0, isComplete: false };

  const sProg = (last.actualToSurah || last.toSurah || '') as string;
  const aProg = Number(last.actualToAyah ?? last.toAyah ?? 0);
  if (!sProg || !SURAHS.includes(sProg) || !isFinite(aProg) || aProg <= 0) {
    return { progressOrd: null, currentRangeIndex: 0, isComplete: false };
  }
  const progressOrd = ayahOrdinal(sProg, aProg);

  // currentRangeIndex: النطاق الذي يقع فيه progressOrd (أو التالي إن تجاوزه).
  const ordered = orderedRanges(ranges, direction);
  let currentIdxInOrdered = ordered.length - 1;
  for (let i = 0; i < ordered.length; i++) {
    const s = rangeStartOrd(ordered[i]);
    const e = rangeEndOrd(ordered[i]);
    if (s == null || e == null) continue;
    const [lo, hi] = [Math.min(s, e), Math.max(s, e)];
    if (progressOrd >= lo && progressOrd <= hi) { currentIdxInOrdered = i; break; }
    // لم يصل بعد لهذا النطاق
    const beforeThis = direction === 'desc' ? progressOrd > hi : progressOrd < lo;
    if (beforeThis) { currentIdxInOrdered = Math.max(0, i - 1); break; }
  }
  const currentRangeIndex = direction === 'desc' ? ranges.length - 1 - currentIdxInOrdered : currentIdxInOrdered;

  // isComplete: progressOrd بلغ نهاية آخر نطاق (في اتجاه التقدّم).
  const lastInOrder = ordered[ordered.length - 1];
  const finalOrd = direction === 'desc' ? rangeStartOrd(lastInOrder) : rangeEndOrd(lastInOrder);
  const isComplete = finalOrd != null && (direction === 'desc' ? progressOrd <= finalOrd : progressOrd >= finalOrd);

  return { progressOrd, currentRangeIndex, isComplete };
}

/**
 * اقتراح ورد اليوم: ابدأ من progressOrd+1 (أو -1 للتنازلي)، أو من رأس النطاق الأول
 * إن لم يبدأ أي رصد بعد. انقل للنطاق التالي عند انتهاء الحالي.
 */
export async function suggestNext(def: PlanDefLike): Promise<PlanSuggestion | null> {
  const direction = def.direction === 'desc' ? 'desc' : 'asc';
  const ranges = Array.isArray(def.ranges) ? (def.ranges as Range[]) : [];
  if (!ranges.length) return null;
  const dailyPages = Number(def.dailyPages) || 0;
  if (dailyPages <= 0) return null;

  const progress = await getProgress(def);
  if (progress.isComplete) return null;

  const ordered = orderedRanges(ranges, direction);
  // ابحث عن أول موضع لم يُغطَّ بعد.
  let startOrd: number | null = null;
  let activeRange: Range | null = null;

  if (progress.progressOrd == null) {
    // لم يبدأ بعد — ابدأ من رأس أول نطاق في ترتيب التقدّم.
    for (const r of ordered) {
      const o = direction === 'desc' ? rangeEndOrd(r) : rangeStartOrd(r);
      if (o != null) { startOrd = o; activeRange = r; break; }
    }
  } else {
    const next = direction === 'desc' ? progress.progressOrd - 1 : progress.progressOrd + 1;
    // ابحث في النطاقات (بترتيب التقدّم) عن أول واحد يحوي next أو ما بعده.
    for (const r of ordered) {
      const s = rangeStartOrd(r), e = rangeEndOrd(r);
      if (s == null || e == null) continue;
      const [lo, hi] = [Math.min(s, e), Math.max(s, e)];
      if (next >= lo && next <= hi) { startOrd = next; activeRange = r; break; }
      // next قد تخطّى هذا النطاق — تابع للتالي.
      // إن كان next قبل هذا النطاق بالكلّية في اتجاه التقدّم، ابدأ من رأس هذا النطاق.
      const beforeThis = direction === 'desc' ? next > hi : next < lo;
      if (beforeThis) {
        const o = direction === 'desc' ? e : s;
        startOrd = o; activeRange = r; break;
      }
    }
  }

  if (startOrd == null || !activeRange) return null;

  const s = rangeStartOrd(activeRange)!, e = rangeEndOrd(activeRange)!;
  const [lo, hi] = [Math.min(s, e), Math.max(s, e)];

  let endOrd: number;
  if (direction === 'desc') {
    endOrd = startAyahForPagesDesc(startOrd, dailyPages, lo);
  } else {
    endOrd = endAyahForPages(startOrd, dailyPages, hi);
  }

  // تحوّل الـ ordinals إلى (surah, ayah). للتصاعدي: from=startOrd, to=endOrd. للتنازلي: from=endOrd (الأعلى) ← to=startOrd (الأدنى) — نحن نسرد نحو الخلف فالـ "from" في العرض يكون المضيف الأقدم.
  // اصطلاح العرض: fromSurah/fromAyah = بداية الورد في المصحف (الأدنى ordinal)، to* = النهاية (الأعلى).
  const fromOrd = Math.min(startOrd, endOrd);
  const toOrd = Math.max(startOrd, endOrd);
  const from = fromOrdinal(fromOrd);
  const to = fromOrdinal(toOrd);
  if (!from || !to) return null;

  return {
    fromSurah: from.surah, fromAyah: from.ayah,
    toSurah: to.surah, toAyah: to.ayah,
    amount: String(dailyPages),
    pages: dailyPages,
    planDefId: def.id
  };
}

/** إذا بلغ progressOrd نهاية النطاقات، أُرشِف الخطة (active=false, completed_at=now). */
export async function markCompleteIfReached(defId: string): Promise<boolean> {
  const [def] = await db.select().from(planDefinitions).where(eq(planDefinitions.id, defId));
  if (!def) return false;
  if ((def as any).active === false) return false;
  const progress = await getProgress(def as any as PlanDefLike);
  if (!progress.isComplete) return false;
  await db.execute(sql`UPDATE plan_definitions SET active = false, completed_at = NOW() WHERE id = ${defId}`);
  return true;
}
