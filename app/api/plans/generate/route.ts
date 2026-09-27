import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans } from '@/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';
import { genId, buildPlanTarget, ayahOrdinal, fromOrdinal, SURAHS, SURAH_AYAH_COUNT } from '@/lib/utils';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(msg: string, status = 400) {
  return NextResponse.json({ success: false, message: msg }, { status });
}

interface Range { fromSurah: string; fromAyah: number; toSurah: string; toAyah: number; }

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
      workDays, dailyAmount, replaceExisting,
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
      if (wd.has(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10));
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

    // Delete existing if requested
    let replacedCount = 0;
    if (replaceExisting === true) {
      const del = await db.delete(plans).where(and(
        eq(plans.studentId, studentId),
        eq(plans.type, type),
        eq(plans.source, 'Manual'),
        gte(plans.date, startDate),
        lte(plans.date, endDate)
      )).returning({ id: plans.id });
      replacedCount = del.length;
    }

    // Generate plan entries across ranges
    const daysOut: { date: string; target: string; fromSurah: string; fromAyah: number; toSurah: string; toAyah: number; amount: number }[] = [];
    let dateIdx = 0;

    for (const rng of rangesArr) {
      if (dateIdx >= dates.length) break;
      const startOrd = ayahOrdinal(rng.fromSurah, rng.fromAyah);
      const endOrd = ayahOrdinal(rng.toSurah, rng.toAyah);
      if (!startOrd || !endOrd) continue;
      const isDesc = endOrd < startOrd;
      const lowOrd = isDesc ? endOrd : startOrd;
      const highOrd = isDesc ? startOrd : endOrd;

      for (let i = 0; dateIdx < dates.length; i++, dateIdx++) {
        let dayLow: number, dayHigh: number;
        if (isDesc) {
          dayHigh = highOrd - i * daily;
          if (dayHigh < lowOrd) break;
          dayLow = Math.max(highOrd - (i + 1) * daily + 1, lowOrd);
        } else {
          dayLow = lowOrd + i * daily;
          if (dayLow > highOrd) break;
          dayHigh = Math.min(lowOrd + (i + 1) * daily - 1, highOrd);
        }
        const s = fromOrdinal(dayLow);
        const e = fromOrdinal(dayHigh);
        if (!s || !e) continue;
        const amount = String(dayHigh - dayLow + 1);
        const dailyTarget = buildPlanTarget({ fromSurah: s.surah, fromAyah: String(s.ayah), toSurah: e.surah, toAyah: String(e.ayah), amount });
        await db.insert(plans).values({
          id: genId('P'), studentId, date: dates[dateIdx], dailyTarget,
          fromSurah: s.surah, fromAyah: String(s.ayah), toSurah: e.surah, toAyah: String(e.ayah),
          amount, type, status: 'Pending', source: 'Manual', locked: false
        });
        daysOut.push({ date: dates[dateIdx], target: dailyTarget, fromSurah: s.surah, fromAyah: s.ayah, toSurah: e.surah, toAyah: e.ayah, amount: dayHigh - dayLow + 1 });
      }
    }

    return NextResponse.json({ success: true, created: daysOut.length, replaced: replacedCount, days: daysOut });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    console.error(e);
    return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
  }
}
