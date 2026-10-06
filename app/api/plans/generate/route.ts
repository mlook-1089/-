import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, planDefinitions } from '@/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { requireRole, AuthError, errorResponse } from '@/lib/auth';
import { genId, buildPlanTarget, ayahOrdinal, fromOrdinal, dowRiyadh, SURAHS, SURAH_AYAH_COUNT, PAGE_FIRST, PAGE_LAST, pageOfOrdinal } from '@/lib/utils';
import { revokeRefs } from '@/lib/triggers';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, message: msg }, { status });
}

interface Range { fromSurah: string; fromAyah: number; toSurah: string; toAyah: number; }

/**
 * خوارزمية "محاسبة الصفحة" للتقدّم بمقدار صفحات (كسر مسموح: 0.25، 0.5، 1، 1.5، 2…).
 * نستهلك ما تبقى من الصفحة الحالية جزئياً، ثم صفحات كاملة، ثم جزءاً من الصفحة الأخيرة.
 * النتيجة: لكل يوم مدى آيات يُطابق الحجم المرئي الفعلي في مصحف المدينة بغضّ النظر
 * عن كثافة آيات ذلك الموضع (الفرق بين البقرة والجزء الثلاثين).
 */
function endAyahForPages(startOrd: number, dailyPages: number, maxOrd: number): number {
  if (!(dailyPages > 0)) return startOrd;
  let ord = startOrd;
  let budget = dailyPages;
  let safety = 0;
  while (budget > 0 && ord <= maxOrd && safety++ < 2000) {
    const page = pageOfOrdinal(ord);
    if (page < 1 || page > 604) break;
    const pageFirst = PAGE_FIRST[page - 1];
    const pageLast = PAGE_LAST[page - 1];
    const pageSize = pageLast - pageFirst + 1;
    const positionInPage = ord - pageFirst;
    const fractionLeftInPage = (pageSize - positionInPage) / pageSize;
    if (budget + 1e-9 >= fractionLeftInPage) {
      // استهلك ما تبقى من هذه الصفحة بالكامل
      ord = pageLast + 1;
      budget -= fractionLeftInPage;
    } else {
      // اقتطع جزءاً داخل الصفحة (آية واحدة على الأقل)
      const ayatToTake = Math.max(1, Math.round(pageSize * budget));
      ord += ayatToTake;
      budget = 0;
    }
  }
  return Math.min(Math.max(startOrd, ord - 1), maxOrd);
}

/** الاتجاه التنازلي: نبدأ من آخر آية ونرجع للخلف بمقدار صفحات. */
function startAyahForPagesDesc(endOrd: number, dailyPages: number, minOrd: number): number {
  if (!(dailyPages > 0)) return endOrd;
  let ord = endOrd;
  let budget = dailyPages;
  let safety = 0;
  while (budget > 0 && ord >= minOrd && safety++ < 2000) {
    const page = pageOfOrdinal(ord);
    if (page < 1 || page > 604) break;
    const pageFirst = PAGE_FIRST[page - 1];
    const pageLast = PAGE_LAST[page - 1];
    const pageSize = pageLast - pageFirst + 1;
    const positionFromEnd = pageLast - ord;
    const fractionLeftInPage = (pageSize - positionFromEnd) / pageSize;
    if (budget + 1e-9 >= fractionLeftInPage) {
      ord = pageFirst - 1;
      budget -= fractionLeftInPage;
    } else {
      const ayatToTake = Math.max(1, Math.round(pageSize * budget));
      ord -= ayatToTake;
      budget = 0;
    }
  }
  return Math.max(Math.min(endOrd, ord + 1), minOrd);
}

function validateRange(rng: Range): string | null {
  const si = SURAHS.indexOf(String(rng.fromSurah));
  const ei = SURAHS.indexOf(String(rng.toSurah));
  if (si < 0 || ei < 0) return 'اسم السورة غير صالح';
  const fa = Number(rng.fromAyah), ta = Number(rng.toAyah);
  if (!Number.isFinite(fa) || !Number.isFinite(ta) || fa < 1 || ta < 1) return 'أرقام الآيات غير صالحة';
  if (fa > SURAH_AYAH_COUNT[si]) return `آية البداية تتجاوز آيات سورة ${rng.fromSurah} (${SURAH_AYAH_COUNT[si]})`;
  if (ta > SURAH_AYAH_COUNT[ei]) return `آية النهاية تتجاوز آيات سورة ${rng.toSurah} (${SURAH_AYAH_COUNT[ei]})`;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const body = await req.json();
    const {
      studentId, type, startDate, endDate,
      fromSurah, fromAyah, toSurah, toAyah,
      workDays, dailyAmount, dailyPages: dailyPagesInput, replaceExisting,
      ranges: rawRanges
    } = body || {};

    if (!studentId || typeof studentId !== 'string') return err('حقل studentId مفقود');
    if (type !== 'conserve' && type !== 'revision') return err('نوع الخطة يجب أن يكون conserve أو revision');
    if (typeof startDate !== 'string' || !DATE_RE.test(startDate) ||
        typeof endDate !== 'string' || !DATE_RE.test(endDate)) return err('صيغة التاريخ يجب أن تكون YYYY-MM-DD');
    if (startDate > endDate) return err('تاريخ البداية يجب أن يسبق أو يساوي تاريخ النهاية');
    if (!Array.isArray(workDays) || workDays.length === 0 ||
        !workDays.every((n: any) => Number.isInteger(n) && n >= 0 && n <= 6))
      return err('أيام الحلقة (workDays) يجب أن تكون مصفوفة أرقام بين 0 و 6');
    if (dailyAmount !== undefined && dailyAmount !== null) {
      const da = Number(dailyAmount);
      if (!Number.isFinite(da) || da < 1) return err('قيمة dailyAmount غير صالحة');
    }
    // dailyPages: كسر صفحة الوجه (0.25 ربع، 0.5 نصف، 1 وجه، 1.5 وجه ونصف، 2 وجهان، 3…)
    const dailyPagesRaw = (body && (body.dailyPages ?? body.daily_pages));
    const dailyPages: number | null =
      (dailyPagesRaw !== undefined && dailyPagesRaw !== null && Number.isFinite(Number(dailyPagesRaw)) && Number(dailyPagesRaw) > 0)
        ? Number(dailyPagesRaw) : null;
    if (dailyPages != null && dailyPages > 5) return err('مقدار الصفحات اليومي كبير جداً');

    // Normalize ranges
    let rangesArr: Range[];
    if (Array.isArray(rawRanges) && rawRanges.length > 0) {
      rangesArr = rawRanges.map((r: any) => ({ fromSurah: String(r.fromSurah || ''), fromAyah: Number(r.fromAyah || 1), toSurah: String(r.toSurah || ''), toAyah: Number(r.toAyah || 1) }));
    } else {
      rangesArr = [{ fromSurah: String(fromSurah || ''), fromAyah: Number(fromAyah || 1), toSurah: String(toSurah || ''), toAyah: Number(toAyah || 1) }];
    }
    for (const rng of rangesArr) {
      const rErr = validateRange(rng);
      if (rErr) return err(rErr);
    }

    // Build work-day dates
    const wd = new Set<number>(workDays.map((n: any) => Number(n)));
    const dates: string[] = [];
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      // تاريخ YYYY-MM-DD نقتصّه من UTC (آمن)، لكن يوم الأسبوع يُحسب بتوقيت الرياض
      // لتفادي الانزياح قرب منتصف الليل في منطقة TZ=+03:00.
      const ymd = d.toISOString().slice(0, 10);
      if (wd.has(dowRiyadh(ymd))) dates.push(ymd);
    }
    if (dates.length === 0) return err('لا توجد أيام حلقة ضمن المدى');

    // Total ayat across all ranges
    let totalAyat = 0;
    for (const rng of rangesArr) {
      const s = ayahOrdinal(rng.fromSurah, rng.fromAyah);
      const e = ayahOrdinal(rng.toSurah, rng.toAyah);
      if (!s || !e) return err('المدى القرآني غير صالح');
      totalAyat += Math.abs(e - s) + 1;
    }

    const daily = (dailyAmount !== undefined && dailyAmount !== null)
      ? Math.max(1, Math.floor(Number(dailyAmount)))
      : Math.ceil(totalAyat / dates.length);

    // Determine global direction (first range decides it; useful for storing on the definition)
    let planDirection: 'asc' | 'desc' = 'asc';
    {
      const first = rangesArr[0];
      const s0 = ayahOrdinal(first.fromSurah, first.fromAyah);
      const e0 = ayahOrdinal(first.toSurah, first.toAyah);
      if (s0 && e0 && e0 < s0) planDirection = 'desc';
    }

    const planDefId = genId('PD');

    // Generate plan entries across ranges (حساب نقي قبل أي عملية قاعدة بيانات)
    const daysOut: { date: string; target: string; fromSurah: string; fromAyah: number; toSurah: string; toAyah: number; amount: number }[] = [];
    let dateIdx = 0;
    const rows: any[] = []; // إدخال جماعي في النهاية بدل استعلام لكل يوم
    let processedRanges = 0; // لرصد نطاقات نفدت قبل أن تُستهلك

    for (const rng of rangesArr) {
      if (dateIdx >= dates.length) break;
      processedRanges++;
      const startOrd = ayahOrdinal(rng.fromSurah, rng.fromAyah);
      const endOrd = ayahOrdinal(rng.toSurah, rng.toAyah);
      if (!startOrd || !endOrd) continue;
      const isDesc = endOrd < startOrd;
      const lowOrd = isDesc ? endOrd : startOrd;
      const highOrd = isDesc ? startOrd : endOrd;

      // المؤشّر يتقدّم يوماً بيوم. في الوضع التصاعدي يبدأ من lowOrd، وفي التنازلي من highOrd.
      // استخدام مؤشّر بدلاً من ضرب i*daily ضروري لحالة dailyPages لأن حجم كل يوم بالآيات يختلف.
      let cursor = isDesc ? highOrd : lowOrd;

      while (dateIdx < dates.length) {
        let dayLow: number, dayHigh: number;
        if (isDesc) {
          if (cursor < lowOrd) break;
          dayHigh = cursor;
          if (dailyPages != null) {
            dayLow = startAyahForPagesDesc(cursor, dailyPages, lowOrd);
          } else {
            dayLow = Math.max(cursor - daily + 1, lowOrd);
          }
          // ضمان تقدّم فعلي كيلا ندخل حلقة لا نهائية
          if (dayLow > dayHigh) dayLow = dayHigh;
          cursor = dayLow - 1;
        } else {
          if (cursor > highOrd) break;
          dayLow = cursor;
          if (dailyPages != null) {
            dayHigh = endAyahForPages(cursor, dailyPages, highOrd);
          } else {
            dayHigh = Math.min(cursor + daily - 1, highOrd);
          }
          if (dayHigh < dayLow) dayHigh = dayLow;
          cursor = dayHigh + 1;
        }
        const s = fromOrdinal(dayLow);
        const e = fromOrdinal(dayHigh);
        if (!s || !e) { dateIdx++; continue; }
        const amount = String(dayHigh - dayLow + 1);
        const dailyTarget = buildPlanTarget({ fromSurah: s.surah, fromAyah: String(s.ayah), toSurah: e.surah, toAyah: String(e.ayah), amount });
        rows.push({
          id: genId('P'), studentId, date: dates[dateIdx], dailyTarget,
          fromSurah: s.surah, fromAyah: String(s.ayah), toSurah: e.surah, toAyah: String(e.ayah),
          amount, type, status: 'Pending', source: 'Manual', locked: false,
          planDefId
        });
        daysOut.push({ date: dates[dateIdx], target: dailyTarget, fromSurah: s.surah, fromAyah: s.ayah, toSurah: e.surah, toAyah: e.ayah, amount: dayHigh - dayLow + 1 });
        dateIdx++;
      }
    }

    // neon-http لا يدعم transactions. ننفّذ تتابعياً مع تحقّق ذاتي بين الخطوات.
    // المخاطرة: إن فشل INSERT بعد DELETE فإن الأوراد المحذوفة لا تعود — نقبل ذلك لأن
    // التبديل في batch-style وبيانات الواجهة تعيد الحالة من الخادم بعد التوليد.
    let replacedCount = 0;
    if (replaceExisting === true) {
      // قبل الحذف: اسحب نقاط الأيام المُنجزة سابقاً — لولا هذا لبقيت سجلات نقاط يتيمة
      // لا يمكن مطابقتها مع معرّفات الخطة الجديدة بعد إعادة التوليد.
      const existing = await db.select({ id: plans.id, status: plans.status }).from(plans).where(and(
        eq(plans.studentId, studentId),
        eq(plans.type, type),
        eq(plans.source, 'Manual'),
        gte(plans.date, startDate),
        lte(plans.date, endDate)
      ));
      const doneIds = existing.filter(r => r.status !== 'Pending').map(r => r.id);
      if (doneIds.length) await revokeRefs(doneIds.map(id => 'plan:' + id));
      const del = await db.delete(plans).where(and(
        eq(plans.studentId, studentId),
        eq(plans.type, type),
        eq(plans.source, 'Manual'),
        gte(plans.date, startDate),
        lte(plans.date, endDate)
      )).returning({ id: plans.id });
      replacedCount = del.length;
    }
    try {
      // أنشئ تعريف الخطة أولاً ثم أدرج الأوراد. فشل الأوراد يترك التعريف يتيماً (سيُحذَف لاحقاً بالـ FK).
      await db.insert(planDefinitions).values({
        id: planDefId,
        studentId,
        type,
        ranges: rangesArr as any,
        // dailyPages المصدر الرسمي للمقدار (0.25، 0.5، 1، 1.5، 2). يُحفَظ dailyAmount في Amount لكل يوم.
        dailyPages: String(dailyPages ?? (dailyAmount ?? daily)),
        workDays: Array.isArray(workDays) ? workDays.map((n: any) => Number(n)).join(',') : '',
        termStart: startDate,
        termEnd: endDate,
        direction: planDirection
      });
      for (let i = 0; i < rows.length; i += 200) await db.insert(plans).values(rows.slice(i, i + 200));
    } catch (insertErr: any) {
      // أدرج ما استطعنا؛ بعض الأوراد قد تكون أُدخلت والتعريف موجود. حاول حذف التعريف اليتيم.
      try { await db.delete(planDefinitions).where(eq(planDefinitions.id, planDefId)); } catch {}
      throw insertErr;
    }

    // تحذيرات معلوماتية (لا تمنع النجاح): خطة أقصر من المطلوب، أو نطاقات نفدت الأيام قبل معالجتها
    const expectedDays = dates.length;
    const droppedRanges = rangesArr.length - processedRanges;
    const warnings: string[] = [];
    if (daysOut.length < expectedDays) {
      warnings.push(`تم إنشاء ${daysOut.length} يوم من أصل ${expectedDays} يوم مطلوب — المدى القرآني لا يكفي لتغطية جميع الأيام`);
    }
    if (droppedRanges > 0) {
      warnings.push(`${droppedRanges} نطاق(ات) لم تُعالَج — نفدت الأيام قبل استهلاكها`);
    }
    const warning = warnings.length ? warnings.join('؛ ') : undefined;

    return NextResponse.json({ success: true, created: daysOut.length, replaced: replacedCount, planDefId, days: daysOut, ...(warning ? { warning } : {}) });
  } catch (e: any) { return errorResponse(e); }
}
