import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, planDefinitions } from '@/db/schema';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId, buildPlanTarget, ayahOrdinal, SURAHS, SURAH_AYAH_COUNT } from '@/lib/utils';
import { applyPlanStatus } from '@/lib/triggers';
import { markCompleteIfReached } from '@/lib/plan-progress';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS = new Set(['Done', 'Partial', 'Missed']);

// POST /api/plans/record
// يُنشئ أو يُحدِّث صفّ plans لورد يوم محدّد (UPSERT على UNIQUE(student_id, date, type)).
// يستدعي applyPlanStatus لمنح/سحب النقاط، ثم markCompleteIfReached لأرشفة الخطة إن اكتملت.
export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const body = await req.json().catch(() => ({}));
    const {
      planDefId, date, status,
      toSurah, toAyah,
      actualToSurah, actualToAyah,
      mistakes, hearing, repetition
    } = body || {};

    if (!planDefId) return NextResponse.json({ success: false, message: 'planDefId مطلوب' }, { status: 400 });
    if (!date || !DATE_RE.test(date)) return NextResponse.json({ success: false, message: 'date غير صالح (YYYY-MM-DD)' }, { status: 400 });
    if (!VALID_STATUS.has(status)) return NextResponse.json({ success: false, message: 'status يجب أن يكون Done أو Partial أو Missed' }, { status: 400 });

    const [def] = await db.select().from(planDefinitions).where(eq(planDefinitions.id, planDefId));
    if (!def) return NextResponse.json({ success: false, message: 'الخطة غير موجودة' }, { status: 404 });
    if (def.active === false) return NextResponse.json({ success: false, message: 'الخطة مؤرشفة — لا يمكن الرصد عليها' }, { status: 400 });

    // التحقّق من حدود السور/الآيات
    const checkAyah = (s: string | null | undefined, a: any, label: string): string | null => {
      if (s == null || s === '') return null;
      const si = SURAHS.indexOf(String(s));
      if (si < 0) return `${label}: اسم سورة غير صالح`;
      const an = Number(a);
      if (!isFinite(an) || an < 1 || an > SURAH_AYAH_COUNT[si]) return `${label}: آية خارج حدود ${s} (${SURAH_AYAH_COUNT[si]})`;
      return null;
    };
    const errs = [
      checkAyah(toSurah, toAyah, 'to'),
      checkAyah(actualToSurah, actualToAyah, 'actualTo')
    ].filter(Boolean);
    if (errs.length) return NextResponse.json({ success: false, message: errs[0] }, { status: 400 });

    if ((status === 'Done' || status === 'Partial')) {
      const sForOrd = actualToSurah || toSurah;
      const aForOrd = actualToAyah ?? toAyah;
      if (!sForOrd || aForOrd == null) {
        return NextResponse.json({ success: false, message: 'actualTo أو to مطلوب عند Done/Partial' }, { status: 400 });
      }
      // منع التراجع: الموضع الجديد يجب ألّا يكون أدنى من آخر موضع مرصود لأيام لاحقة.
      const newOrd = ayahOrdinal(String(sForOrd), Number(aForOrd));
      const later = await db.select({
        actualToSurah: plans.actualToSurah, actualToAyah: plans.actualToAyah,
        toSurah: plans.toSurah, toAyah: plans.toAyah, date: plans.date
      }).from(plans)
        .where(and(
          eq(plans.planDefId, planDefId),
          sql`${plans.date} > ${date}::date`,
          ne(plans.status, 'Pending')
        ))
        .orderBy(desc(plans.date))
        .limit(1);
      if (later.length) {
        const l = later[0];
        const lS = (l.actualToSurah || l.toSurah || '') as string;
        const lA = Number(l.actualToAyah ?? l.toAyah ?? 0);
        if (lS && SURAHS.includes(lS) && lA > 0) {
          const laterOrd = ayahOrdinal(lS, lA);
          const direction = def.direction === 'desc' ? 'desc' : 'asc';
          const regress = direction === 'desc' ? newOrd > laterOrd : newOrd < laterOrd;
          if (regress) {
            return NextResponse.json({
              success: false,
              message: `التصحيح يُنقص الموضع عن اليوم اللاحق (${l.date}: ${lS} ${lA})`
            }, { status: 400 });
          }
        }
      }
    }

    const dailyTarget = buildPlanTarget({
      fromSurah: '', fromAyah: '', // توليد target من to_* فقط إن أردنا — نكتفي بالقالب الحالي
      toSurah: toSurah || '', toAyah: String(toAyah ?? ''),
      amount: def.dailyPages
    }) || 'ورد';

    // UPSERT عبر onConflictDoUpdate على UNIQUE(student_id, date, type).
    const nowId = genId('P');
    const inserted = await db.insert(plans).values({
      id: nowId,
      studentId: def.studentId,
      date,
      dailyTarget,
      fromSurah: '', fromAyah: '',
      toSurah: toSurah || '',
      toAyah: toAyah != null ? String(toAyah) : '',
      actualToSurah: actualToSurah || null,
      actualToAyah: actualToAyah != null ? String(actualToAyah) : null,
      amount: def.dailyPages,
      type: def.type,
      status,
      source: 'Manual',
      planDefId,
      mistakes: mistakes != null ? Number(mistakes) : null,
      hearing: hearing != null ? Number(hearing) : null,
      repetition: repetition != null ? Number(repetition) : null
    }).onConflictDoUpdate({
      target: [plans.studentId, plans.date, plans.type],
      set: {
        status,
        toSurah: toSurah || '',
        toAyah: toAyah != null ? String(toAyah) : '',
        actualToSurah: actualToSurah || null,
        actualToAyah: actualToAyah != null ? String(actualToAyah) : null,
        amount: def.dailyPages,
        dailyTarget,
        planDefId,
        mistakes: mistakes != null ? Number(mistakes) : null,
        hearing: hearing != null ? Number(hearing) : null,
        repetition: repetition != null ? Number(repetition) : null
      }
    }).returning({ id: plans.id, status: plans.status });

    const row = inserted[0];
    if (!row) return NextResponse.json({ success: false, message: 'فشل الحفظ' }, { status: 500 });

    // جلب الحالة السابقة لتطبيق تغيير النقاط. onConflictDoUpdate لا يُرجع العمود السابق،
    // لذا نقرأ الصفّ قبل الاستدعاء إن كان موجوداً — لكن النهج الأبسط هنا: نسلّم oldStatus=null
    // لـ applyPlanStatus. سيؤدي ذلك إلى سحب نقاط ref سابقة ثم منح جديدة = صافي صحيح.
    // (revokeRef يفحص (ref,item_id) UNIQUE قبل الإضافة لتفادي الازدواج)
    const awarded = await applyPlanStatus({ id: row.id, studentId: def.studentId, type: def.type }, null, status, teacher.id);

    const completed = (status === 'Done' || status === 'Partial') ? await markCompleteIfReached(planDefId) : false;

    return NextResponse.json({ success: true, planId: row.id, awarded, completed });
  } catch (e: any) { return errorResponse(e); }
}
