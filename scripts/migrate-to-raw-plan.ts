// Dry-run تقرير قراءة محضة قبل الهجرة إلى نموذج "خطة خام + متابعة يومية".
// يفحص: التكرارات في plans و point_logs، أوراد Pending المستقبلية، خطط
// بلغت نهاية نطاقاتها، صفوف plans اليتيمة. لا يكتب شيئاً.
//
// التشغيل:  npx tsx scripts/migrate-to-raw-plan.ts
// (الوضع الوحيد المدعوم حالياً هو --dry-run. سيُضاف --apply بعد إقرار
//  التقرير من المستخدم.)
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { db } from '@/lib/db';
import { plans, planDefinitions, pointLogs } from '@/db/schema';
import { and, eq, gte, inArray, sql, isNull, isNotNull, desc } from 'drizzle-orm';
import { SURAHS, SURAH_AYAH_COUNT, ayahOrdinal } from '@/lib/utils';

function hr() { console.log('─'.repeat(68)); }
function h2(t: string) { console.log('\n' + '━'.repeat(68) + '\n  ' + t + '\n' + '━'.repeat(68)); }
function pad(n: number | string, w = 6) { return String(n).padStart(w, ' '); }

interface Range { fromSurah: string; fromAyah: number | string; toSurah: string; toAyah: number | string; }

/**
 * endOrd لآخر موضع يفترض الخطة الوصول إليه.
 *  asc  → ordinal(toSurah,toAyah) لآخر نطاق.
 *  desc → ordinal(fromSurah,fromAyah) لأول نطاق (آخر مطلوب لأن النزول نحو الأدنى).
 * يُرجع null إن تعذّر الحساب (نطاق فارغ أو أسماء غير صالحة).
 */
function computeEndOrd(ranges: Range[], direction: string): number | null {
  if (!Array.isArray(ranges) || ranges.length === 0) return null;
  const r = direction === 'desc' ? ranges[0] : ranges[ranges.length - 1];
  if (!r) return null;
  const s = direction === 'desc' ? r.fromSurah : r.toSurah;
  const a = Number(direction === 'desc' ? r.fromAyah : r.toAyah);
  if (!s || !SURAHS.includes(s) || !isFinite(a)) return null;
  return ayahOrdinal(s, a);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--apply')) {
    console.error('⛔ --apply غير مدعوم في هذه النسخة. شغّل الـ dry-run أولاً وأقرّ التقرير مع المستخدم.');
    process.exit(2);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('       Migration DRY-RUN  —  Raw Plan Model (قراءة فقط)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  التاريخ: ${new Date().toISOString()}`);
  console.log('  لا تغييرات على قاعدة البيانات في هذا الوضع.');

  // ─── إحصاءات عامة ────────────────────────────────────────────────────
  h2('إحصاءات عامة');
  const [{ cnt: planDefCount }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(planDefinitions);
  const [{ cnt: plansCount }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(plans);
  const [{ cnt: logsCount }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(pointLogs);
  console.log(`  plan_definitions : ${pad(planDefCount)}`);
  console.log(`  plans            : ${pad(plansCount)}`);
  console.log(`  point_logs       : ${pad(logsCount)}`);

  const statusRows = await db.execute(sql`SELECT status, COUNT(*)::int as c FROM plans GROUP BY status ORDER BY c DESC`);
  console.log('\n  توزّع plans.status:');
  for (const r of statusRows.rows as any[]) console.log(`    ${(r.status || 'NULL').padEnd(10)} : ${pad(r.c)}`);

  const sourceRows = await db.execute(sql`SELECT source, COUNT(*)::int as c FROM plans GROUP BY source ORDER BY c DESC`);
  console.log('\n  توزّع plans.source:');
  for (const r of sourceRows.rows as any[]) console.log(`    ${(r.source || 'NULL').padEnd(10)} : ${pad(r.c)}`);

  // ─── 1) تكرارات point_logs على (ref, item_id) ─────────────────────
  h2('1) تكرارات point_logs على (ref, item_id) حيث ref != \'\'');
  const dupLogs = await db.execute(sql`
    SELECT ref, item_id, COUNT(*)::int as c, SUM(COALESCE(point_value, 0))::int as sum_points
    FROM point_logs
    WHERE ref != ''
    GROUP BY ref, item_id
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 20
  `);
  const [{ cnt: dupLogsGroupsAll }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM (
      SELECT 1 FROM point_logs WHERE ref != '' GROUP BY ref, item_id HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { cnt: number }[];
  const [{ extra: dupLogsExtra }] = (await db.execute(sql`
    SELECT COALESCE(SUM(c - 1), 0)::int as extra FROM (
      SELECT COUNT(*)::int as c FROM point_logs WHERE ref != '' GROUP BY ref, item_id HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { extra: number }[];
  console.log(`  مجموعات مكرّرة : ${pad(dupLogsGroupsAll)}`);
  console.log(`  صفوف "زائدة" ستُحذف عند التنظيف : ${pad(dupLogsExtra)}  (نحتفظ بالأقدم في كل مجموعة)`);
  if ((dupLogs.rows as any[]).length) {
    console.log('\n  أعلى 20 مجموعة تكرار:');
    console.log(`    ${'ref'.padEnd(28)}  ${'item_id'.padEnd(20)}  count  sum_points`);
    hr();
    for (const r of dupLogs.rows as any[]) {
      console.log(`    ${(r.ref || '').padEnd(28)}  ${(r.item_id || '').padEnd(20)}  ${pad(r.c, 5)}  ${pad(r.sum_points, 10)}`);
    }
  } else {
    console.log('  ✅ لا تكرارات.');
  }

  // ─── 2) تكرارات plans على (student_id, date, type) ─────────────────
  h2('2) تكرارات plans على (student_id, date, type)');
  const dupPlans = await db.execute(sql`
    SELECT student_id, date, type, COUNT(*)::int as c
    FROM plans
    GROUP BY student_id, date, type
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 20
  `);
  const [{ cnt: dupPlansGroupsAll }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM (
      SELECT 1 FROM plans GROUP BY student_id, date, type HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { cnt: number }[];
  const [{ extra: dupPlansExtra }] = (await db.execute(sql`
    SELECT COALESCE(SUM(c - 1), 0)::int as extra FROM (
      SELECT COUNT(*)::int as c FROM plans GROUP BY student_id, date, type HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { extra: number }[];
  console.log(`  مجموعات مكرّرة : ${pad(dupPlansGroupsAll)}`);
  console.log(`  صفوف "زائدة" ستُحذف عند التنظيف : ${pad(dupPlansExtra)}`);
  console.log(`  القاعدة: نحتفظ بأحدث صف status != 'Pending'، وإلا الأحدث مطلقاً.`);
  if ((dupPlans.rows as any[]).length) {
    console.log('\n  أعلى 20 مجموعة تكرار:');
    console.log(`    ${'student_id'.padEnd(16)}  ${'date'.padEnd(12)}  ${'type'.padEnd(10)}  count`);
    hr();
    for (const r of dupPlans.rows as any[]) {
      console.log(`    ${String(r.student_id).padEnd(16)}  ${String(r.date).padEnd(12)}  ${String(r.type).padEnd(10)}  ${pad(r.c, 5)}`);
    }
  } else {
    console.log('  ✅ لا تكرارات.');
  }

  // ─── 3) أوراد Pending المستقبلية ───────────────────────────────────
  h2('3) أوراد Pending المستقبلية (status=\'Pending\' AND date >= today AND source=\'Manual\')');
  const [{ cnt: pendingFuture }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM plans
    WHERE status = 'Pending' AND date >= CURRENT_DATE AND source = 'Manual' AND plan_def_id IS NOT NULL
  `)).rows as any[] as { cnt: number }[];
  const [{ cnt: pendingFutureNoDef }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM plans
    WHERE status = 'Pending' AND date >= CURRENT_DATE AND source = 'Manual' AND plan_def_id IS NULL
  `)).rows as any[] as { cnt: number }[];
  const [{ cnt: pendingPast }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM plans
    WHERE status = 'Pending' AND date < CURRENT_DATE AND source = 'Manual'
  `)).rows as any[] as { cnt: number }[];
  console.log(`  Pending مستقبلي مع plan_def_id : ${pad(pendingFuture)}  ← سيُحذف في الهجرة`);
  console.log(`  Pending مستقبلي بدون plan_def_id : ${pad(pendingFutureNoDef)}  ← يتيم (يُدرس أدناه)`);
  console.log(`  Pending ماضي (date<today) : ${pad(pendingPast)}  ← يبقى كما هو (تاريخي)`);

  // ─── 4) صفوف plans اليتيمة (plan_def_id IS NULL) ────────────────────
  h2('4) صفوف plans اليتيمة (plan_def_id IS NULL)');
  const [{ cnt: orphanTotal }] = (await db.execute(sql`SELECT COUNT(*)::int as cnt FROM plans WHERE plan_def_id IS NULL`)).rows as any[] as { cnt: number }[];
  const orphanByStatus = await db.execute(sql`
    SELECT status, COUNT(*)::int as c FROM plans WHERE plan_def_id IS NULL GROUP BY status ORDER BY c DESC
  `);
  const orphanBySource = await db.execute(sql`
    SELECT source, COUNT(*)::int as c FROM plans WHERE plan_def_id IS NULL GROUP BY source ORDER BY c DESC
  `);
  console.log(`  إجمالي اليتامى : ${pad(orphanTotal)}`);
  console.log('\n  حسب status:');
  for (const r of orphanByStatus.rows as any[]) console.log(`    ${(r.status || 'NULL').padEnd(10)} : ${pad(r.c)}`);
  console.log('\n  حسب source:');
  for (const r of orphanBySource.rows as any[]) console.log(`    ${(r.source || 'NULL').padEnd(10)} : ${pad(r.c)}`);
  console.log(`  القاعدة المقترحة في الهجرة:`);
  console.log(`    - يتيم status∈{Done,Partial,Missed}: نحاول ربطه بـ plan_definitions المناسب،`);
  console.log(`      وإن تعذّر نُبقيه (تاريخي، نسمح له بالبقاء بدون plan_def_id).`);
  console.log(`    - يتيم status='Pending': يُحذف (لا قيمة له).`);

  // ─── 5) plan_definitions بلغت نهاية نطاقاتها ────────────────────────
  h2('5) plan_definitions بلغت نهاية نطاقاتها (مرشّحة للأرشفة active=false)');
  const defs = await db.select().from(planDefinitions);
  console.log(`  عدد التعريفات الكلي : ${pad(defs.length)}`);

  let candidatesComplete = 0;
  let candidatesIncomplete = 0;
  let candidatesEmpty = 0;
  let candidatesInvalid = 0;
  const completeList: { id: string; studentId: string; type: string; endOrd: number; progressOrd: number }[] = [];

  for (const def of defs) {
    const ranges = Array.isArray(def.ranges) ? (def.ranges as Range[]) : [];
    const direction = String(def.direction || 'asc');
    const endOrd = computeEndOrd(ranges, direction);
    if (endOrd == null) { candidatesInvalid++; continue; }

    // آخر صف Done/Partial لهذه الخطة
    const [last] = await db.select({
      actualToSurah: plans.actualToSurah, actualToAyah: plans.actualToAyah,
      toSurah: plans.toSurah, toAyah: plans.toAyah
    }).from(plans)
      .where(and(
        eq(plans.planDefId, def.id),
        inArray(plans.status, ['Done', 'Partial'])
      ))
      .orderBy(desc(plans.date))
      .limit(1);

    if (!last) { candidatesEmpty++; continue; }

    const sProg = (last.actualToSurah || last.toSurah || '') as string;
    const aProg = Number(last.actualToAyah ?? last.toAyah ?? 0);
    if (!sProg || !SURAHS.includes(sProg) || !isFinite(aProg) || aProg <= 0) {
      candidatesInvalid++;
      continue;
    }
    const progressOrd = ayahOrdinal(sProg, aProg);
    const reached = direction === 'desc' ? progressOrd <= endOrd : progressOrd >= endOrd;
    if (reached) {
      candidatesComplete++;
      completeList.push({ id: def.id, studentId: def.studentId, type: def.type, endOrd, progressOrd });
    } else {
      candidatesIncomplete++;
    }
  }

  console.log(`  مكتملة (ستُؤرشَف) : ${pad(candidatesComplete)}`);
  console.log(`  لم تكتمل بعد      : ${pad(candidatesIncomplete)}`);
  console.log(`  لا سجلات تسميع    : ${pad(candidatesEmpty)}  (يبقى active=true)`);
  console.log(`  أسماء/أرقام غير صالحة : ${pad(candidatesInvalid)}  (يحتاج مراجعة يدوية)`);
  if (completeList.length) {
    console.log('\n  أمثلة (أول 10):');
    console.log(`    ${'plan_def_id'.padEnd(18)}  ${'student_id'.padEnd(16)}  ${'type'.padEnd(10)}  endOrd  progressOrd`);
    hr();
    for (const r of completeList.slice(0, 10)) {
      console.log(`    ${r.id.padEnd(18)}  ${r.studentId.padEnd(16)}  ${r.type.padEnd(10)}  ${pad(r.endOrd)}  ${pad(r.progressOrd, 11)}`);
    }
  }

  // ─── 6) ملخّص الخطوات التي ستُنفَّذ عند --apply ─────────────────────
  h2('ملخّص الخطوات في --apply (بعد موافقتك)');
  console.log(`  A. تنظيف تكرارات point_logs : حذف ${dupLogsExtra} صف + خصم نقاطها من totalPoints + recomputeGroups`);
  console.log(`  B. تنظيف تكرارات plans : حذف ${dupPlansExtra} صف`);
  console.log(`  C. ALTER plan_definitions : + active, + completed_at ; term_start/end → NULLABLE`);
  console.log(`  D. CREATE UNIQUE INDEX على plans(student_id,date,type) و point_logs(ref,item_id)`);
  console.log(`     CREATE INDEX على plans(plan_def_id, date DESC)`);
  console.log(`  E. حذف أوراد Pending المستقبلية : ${pendingFuture} صف`);
  console.log(`  F. أرشفة ${candidatesComplete} خطة مكتملة : active=false, completed_at=now()`);
  console.log(`  G. ربط/حذف ${orphanTotal} صف يتيم، ثم ALTER plans.plan_def_id → NOT NULL`);

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  ✅ انتهى الـ dry-run. أرِ التقرير للمستخدم وانتظر إقراره.');
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('\n❌ فشل الـ dry-run:', e); process.exit(1); });
