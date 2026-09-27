import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans } from '@/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';
import { genId, buildPlanTarget, ayahOrdinal, fromOrdinal, SURAHS } from '@/lib/utils';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const body = await req.json();
    const {
      studentId,
      type,
      startDate,
      endDate,
      fromSurah,
      fromAyah,
      toSurah,
      toAyah,
      workDays,
      dailyAmount,
      replaceExisting
    } = body || {};

    // تحقّق أساسي
    if (!studentId || typeof studentId !== 'string') {
      return NextResponse.json({ success: false, message: 'حقل studentId مفقود' }, { status: 400 });
    }
    if (type !== 'conserve' && type !== 'revision') {
      return NextResponse.json({ success: false, message: 'نوع الخطة يجب أن يكون conserve أو revision' }, { status: 400 });
    }
    if (typeof startDate !== 'string' || !DATE_RE.test(startDate) ||
        typeof endDate !== 'string' || !DATE_RE.test(endDate)) {
      return NextResponse.json({ success: false, message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ success: false, message: 'تاريخ البداية يجب أن يسبق أو يساوي تاريخ النهاية' }, { status: 400 });
    }
    if (!fromSurah || !toSurah || !SURAHS.includes(String(fromSurah)) || !SURAHS.includes(String(toSurah))) {
      return NextResponse.json({ success: false, message: 'اسم السورة غير صالح' }, { status: 400 });
    }
    const fromA = Number(fromAyah);
    const toA = Number(toAyah);
    if (!Number.isFinite(fromA) || !Number.isFinite(toA) || fromA < 1 || toA < 1) {
      return NextResponse.json({ success: false, message: 'أرقام الآيات غير صالحة' }, { status: 400 });
    }
    if (!Array.isArray(workDays) || workDays.length === 0 ||
        !workDays.every((n: any) => Number.isInteger(n) && n >= 0 && n <= 6)) {
      return NextResponse.json({ success: false, message: 'أيام الحلقة (workDays) يجب أن تكون مصفوفة أرقام بين 0 و 6' }, { status: 400 });
    }
    if (dailyAmount !== undefined && dailyAmount !== null) {
      const da = Number(dailyAmount);
      if (!Number.isFinite(da) || da < 1) {
        return NextResponse.json({ success: false, message: 'قيمة dailyAmount غير صالحة' }, { status: 400 });
      }
    }

    // حساب التسلسل
    const startOrd = ayahOrdinal(String(fromSurah), fromA);
    const endOrd = ayahOrdinal(String(toSurah), toA);
    if (!startOrd || !endOrd || startOrd === endOrd) {
      return NextResponse.json({ success: false, message: 'المدى القرآني غير صالح (تحقّق من السورة والآية)' }, { status: 400 });
    }
    const isDesc = endOrd < startOrd; // تصاعدي: من الناس إلى الفاتحة
    const lowOrd = isDesc ? endOrd : startOrd;
    const highOrd = isDesc ? startOrd : endOrd;
    const totalAyat = highOrd - lowOrd + 1;

    // بناء قائمة أيام الحلقة
    const wd = new Set<number>(workDays.map((n: any) => Number(n)));
    const dates: string[] = [];
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      if (wd.has(d.getUTCDay())) {
        dates.push(d.toISOString().slice(0, 10));
      }
    }
    if (dates.length === 0) {
      return NextResponse.json({ success: false, message: 'لا توجد أيام حلقة ضمن المدى' }, { status: 400 });
    }

    // مقدار اليوم
    const daily = (dailyAmount !== undefined && dailyAmount !== null)
      ? Math.max(1, Math.floor(Number(dailyAmount)))
      : Math.ceil(totalAyat / dates.length);

    // حذف السابق إن طُلب
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

    // التقسيم والإدراج
    const daysOut: { date: string; target: string; fromSurah: string; fromAyah: number; toSurah: string; toAyah: number; amount: number }[] = [];
    for (let i = 0; i < dates.length; i++) {
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
      const dayDate = dates[i];
      const amount = String(dayHigh - dayLow + 1);
      const dailyTarget = buildPlanTarget({
        fromSurah: s.surah,
        fromAyah: String(s.ayah),
        toSurah: e.surah,
        toAyah: String(e.ayah),
        amount
      });
      await db.insert(plans).values({
        id: genId('P'),
        studentId,
        date: dayDate,
        dailyTarget,
        fromSurah: s.surah,
        fromAyah: String(s.ayah),
        toSurah: e.surah,
        toAyah: String(e.ayah),
        amount,
        type,
        status: 'Pending',
        source: 'Manual',
        locked: false
      });
      daysOut.push({
        date: dayDate,
        target: dailyTarget,
        fromSurah: s.surah,
        fromAyah: s.ayah,
        toSurah: e.surah,
        toAyah: e.ayah,
        amount: dayHigh - dayLow + 1
      });
    }

    return NextResponse.json({
      success: true,
      created: daysOut.length,
      replaced: replacedCount,
      days: daysOut
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ success: false, message: e?.message || 'خطأ داخلي' }, { status: 500 });
  }
}
