// هجرة قاعدة البيانات إلى نموذج "خطة خام + متابعة يومية".
//
// الوضع الافتراضي = DRY-RUN (قراءة فقط، تقرير بدون تغييرات).
// للتنفيذ الحقيقي، شغّل مع --apply وضع متغيّر البيئة MIGRATE_CONFIRM=RAW_PLAN_APPLY.
//
// الأوامر:
//   npx tsx scripts/migrate-to-raw-plan.ts                       # dry-run
//   $env:MIGRATE_CONFIRM="RAW_PLAN_APPLY"
//   npx tsx scripts/migrate-to-raw-plan.ts --apply                # ينفّذ فعلياً
//
// قبل --apply: خذ نسخة احتياطية من Neon
//   أسهل طريقة: console.neon.tech → المشروع → Branches → Create branch
//   سمّها "backup-before-raw-plan-YYYYMMDD". نسخة لحظية بلا تكلفة.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { db } from '@/lib/db';
import { plans, planDefinitions, pointLogs } from '@/db/schema';
import { and, eq, inArray, sql, desc } from 'drizzle-orm';
import { SURAHS, ayahOrdinal } from '@/lib/utils';

function hr() { console.log('─'.repeat(68)); }
function h1(t: string) { console.log('\n' + '═'.repeat(68) + '\n  ' + t + '\n' + '═'.repeat(68)); }
function h2(t: string) { console.log('\n' + '━'.repeat(68) + '\n  ' + t + '\n' + '━'.repeat(68)); }
function pad(n: number | string, w = 6) { return String(n).padStart(w, ' '); }

interface Range { fromSurah: string; fromAyah: number | string; toSurah: string; toAyah: number | string; }

function computeEndOrd(ranges: Range[], direction: string): number | null {
  if (!Array.isArray(ranges) || ranges.length === 0) return null;
  const r = direction === 'desc' ? ranges[0] : ranges[ranges.length - 1];
  if (!r) return null;
  const s = direction === 'desc' ? r.fromSurah : r.toSurah;
  const a = Number(direction === 'desc' ? r.fromAyah : r.toAyah);
  if (!s || !SURAHS.includes(s) || !isFinite(a)) return null;
  return ayahOrdinal(s, a);
}

async function detectCompletedDefs(): Promise<string[]> {
  const defs = await db.select().from(planDefinitions);
  const completed: string[] = [];
  for (const def of defs) {
    const ranges = Array.isArray(def.ranges) ? (def.ranges as Range[]) : [];
    const direction = String(def.direction || 'asc');
    const endOrd = computeEndOrd(ranges, direction);
    if (endOrd == null) continue;
    const [last] = await db.select({
      actualToSurah: plans.actualToSurah, actualToAyah: plans.actualToAyah,
      toSurah: plans.toSurah, toAyah: plans.toAyah
    }).from(plans)
      .where(and(eq(plans.planDefId, def.id), inArray(plans.status, ['Done', 'Partial'])))
      .orderBy(desc(plans.date))
      .limit(1);
    if (!last) continue;
    const sProg = (last.actualToSurah || last.toSurah || '') as string;
    const aProg = Number(last.actualToAyah ?? last.toAyah ?? 0);
    if (!sProg || !SURAHS.includes(sProg) || !isFinite(aProg) || aProg <= 0) continue;
    const progressOrd = ayahOrdinal(sProg, aProg);
    const reached = direction === 'desc' ? progressOrd <= endOrd : progressOrd >= endOrd;
    if (reached) completed.push(def.id);
  }
  return completed;
}

async function runDiagnostic() {
  h1('Diagnostic — القراءة فقط');
  console.log(`  التاريخ: ${new Date().toISOString()}`);

  h2('إحصاءات عامة');
  const [{ cnt: planDefCount }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(planDefinitions);
  const [{ cnt: plansCount }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(plans);
  const [{ cnt: logsCount }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(pointLogs);
  console.log(`  plan_definitions : ${pad(planDefCount)}`);
  console.log(`  plans            : ${pad(plansCount)}`);
  console.log(`  point_logs       : ${pad(logsCount)}`);

  // التكرارات
  const [{ cnt: dupLogsGroups }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM (
      SELECT 1 FROM point_logs WHERE ref != '' GROUP BY ref, item_id HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { cnt: number }[];
  const [{ extra: dupLogsExtra }] = (await db.execute(sql`
    SELECT COALESCE(SUM(c - 1), 0)::int as extra FROM (
      SELECT COUNT(*)::int as c FROM point_logs WHERE ref != '' GROUP BY ref, item_id HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { extra: number }[];
  const [{ cnt: dupPlansGroups }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM (
      SELECT 1 FROM plans GROUP BY student_id, date, type HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { cnt: number }[];
  const [{ extra: dupPlansExtra }] = (await db.execute(sql`
    SELECT COALESCE(SUM(c - 1), 0)::int as extra FROM (
      SELECT COUNT(*)::int as c FROM plans GROUP BY student_id, date, type HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { extra: number }[];
  const [{ cnt: pendingFuture }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM plans
    WHERE status = 'Pending' AND date >= CURRENT_DATE AND source = 'Manual' AND plan_def_id IS NOT NULL
  `)).rows as any[] as { cnt: number }[];
  const [{ cnt: orphanTotal }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM plans WHERE plan_def_id IS NULL
  `)).rows as any[] as { cnt: number }[];

  const completedIds = await detectCompletedDefs();

  console.log('\n  تكرارات point_logs : ' + pad(dupLogsExtra) + ' صف زائد (' + dupLogsGroups + ' مجموعة)');
  console.log('  تكرارات plans      : ' + pad(dupPlansExtra) + ' صف زائد (' + dupPlansGroups + ' مجموعة)');
  console.log('  Pending مستقبلي     : ' + pad(pendingFuture) + ' صف (للحذف)');
  console.log('  أوراد يتيمة         : ' + pad(orphanTotal) + ' صف (ربط best-effort)');
  console.log('  خطط مكتملة          : ' + pad(completedIds.length) + ' خطة (للأرشفة)');

  return { dupLogsExtra, dupPlansExtra, pendingFuture, orphanTotal, completedIds };
}

async function stepA_cleanDuplicateLogs() {
  h2('A) تنظيف تكرارات point_logs');
  const [{ cnt }] = (await db.execute(sql`
    SELECT COALESCE(SUM(c - 1), 0)::int as cnt FROM (
      SELECT COUNT(*)::int as c FROM point_logs WHERE ref != '' GROUP BY ref, item_id HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { cnt: number }[];
  if (!cnt) { console.log('  ✅ لا تكرارات — تخطي.'); return; }

  // اجمع النقاط الزائدة لكل طالب قبل الحذف (للسحب من totalPoints)
  const extras = await db.execute(sql`
    WITH ranked AS (
      SELECT id, student_id, point_value,
        ROW_NUMBER() OVER (PARTITION BY ref, item_id ORDER BY created_at ASC) as rn
      FROM point_logs WHERE ref != ''
    )
    SELECT id, student_id, COALESCE(point_value, 0) as pv FROM ranked WHERE rn > 1
  `);
  const deltas = new Map<string, number>();
  for (const r of extras.rows as any[]) {
    deltas.set(r.student_id, (deltas.get(r.student_id) || 0) + Number(r.pv || 0));
  }
  // احذف الصفوف الزائدة
  const ids = (extras.rows as any[]).map(r => r.id);
  if (ids.length) {
    await db.execute(sql`DELETE FROM point_logs WHERE id = ANY(${sql.raw(`ARRAY[${ids.map(i => `'${i}'`).join(',')}]`)})`);
  }
  // اخصم من totalPoints
  for (const [sid, delta] of deltas) {
    await db.execute(sql`UPDATE students_data SET total_points = GREATEST(0, total_points - ${delta}) WHERE student_id = ${sid}`);
  }
  // أعد حساب نقاط المجموعات
  await db.execute(sql`
    UPDATE groups g
    SET total_points = g.bonus_points + COALESCE((
      SELECT SUM(sd.total_points) FROM students_data sd WHERE sd.group_id = g.id
    ), 0)
  `);
  console.log(`  حُذف ${ids.length} صف زائد، خُصمت نقاطها، وأُعيد حساب المجموعات.`);
}

async function stepB_cleanDuplicatePlans() {
  h2('B) تنظيف تكرارات plans');
  const [{ cnt: before }] = (await db.execute(sql`
    SELECT COALESCE(SUM(c - 1), 0)::int as cnt FROM (
      SELECT COUNT(*)::int as c FROM plans GROUP BY student_id, date, type HAVING COUNT(*) > 1
    ) t
  `)).rows as any[] as { cnt: number }[];
  if (!before) { console.log('  ✅ لا تكرارات — تخطي.'); return; }
  const r = await db.execute(sql`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY student_id, date, type
          ORDER BY
            CASE WHEN status != 'Pending' THEN 0 ELSE 1 END ASC,
            created_at DESC
        ) as rn
      FROM plans
    )
    DELETE FROM plans WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `);
  console.log(`  حُذف ${before} صف. القاعدة: الاحتفاظ بأحدث صف غير Pending أو الأحدث مطلقاً.`);
}

async function stepC_alterPlanDefinitions() {
  h2('C) ALTER plan_definitions');
  await db.execute(sql`ALTER TABLE plan_definitions ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`);
  await db.execute(sql`ALTER TABLE plan_definitions ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL`);
  await db.execute(sql`ALTER TABLE plan_definitions ALTER COLUMN term_start DROP NOT NULL`);
  await db.execute(sql`ALTER TABLE plan_definitions ALTER COLUMN term_end DROP NOT NULL`);
  console.log('  ✅ أُضيفت active + completed_at، وأصبحت term_start/term_end اختيارية.');
}

async function stepD_createIndexes() {
  h2('D) إنشاء الفهارس');
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS plans_student_date_type_uniq ON plans(student_id, date, type)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS point_logs_ref_item_uniq ON point_logs(ref, item_id) WHERE ref != ''`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS plans_def_date_desc ON plans(plan_def_id, date DESC)`);
  console.log('  ✅ UNIQUE على plans(student_id,date,type) و point_logs(ref,item_id)، وفهرس على plans(plan_def_id, date DESC).');
}

async function stepE_deletePendingFuture() {
  h2('E) حذف أوراد Pending المستقبلية');
  const r = await db.execute(sql`
    DELETE FROM plans
    WHERE status = 'Pending'
      AND date >= CURRENT_DATE
      AND source = 'Manual'
      AND plan_def_id IS NOT NULL
    RETURNING id
  `);
  console.log(`  حُذف ${(r.rows as any[]).length} صف. (status=Pending, date≥today, source=Manual, plan_def_id موجود)`);
}

async function stepF_archiveCompleted(ids: string[]) {
  h2('F) أرشفة الخطط المكتملة');
  if (!ids.length) { console.log('  ✅ لا خطط مكتملة — تخطي.'); return; }
  await db.execute(sql`
    UPDATE plan_definitions
    SET active = false, completed_at = NOW()
    WHERE id = ANY(${sql.raw(`ARRAY[${ids.map(i => `'${i}'`).join(',')}]`)})
  `);
  console.log(`  أُرشِفت ${ids.length} خطة: ${ids.join(', ')}`);
}

async function stepG_linkOrphans() {
  h2('G) ربط الأوراد اليتيمة (best-effort، بدون حذف)');
  const [{ cnt: before }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM plans WHERE plan_def_id IS NULL
  `)).rows as any[] as { cnt: number }[];
  if (!before) { console.log('  ✅ لا يتامى — تخطي.'); return; }

  const r = await db.execute(sql`
    WITH candidates AS (
      SELECT p.id as plan_id, pd.id as def_id
      FROM plans p
      JOIN plan_definitions pd
        ON pd.student_id = p.student_id
        AND pd.type = p.type
        AND p.date BETWEEN pd.term_start AND pd.term_end
      WHERE p.plan_def_id IS NULL
    ),
    singles AS (
      SELECT plan_id, MIN(def_id) as def_id
      FROM candidates
      GROUP BY plan_id
      HAVING COUNT(*) = 1
    )
    UPDATE plans p
    SET plan_def_id = s.def_id
    FROM singles s
    WHERE p.id = s.plan_id
    RETURNING p.id
  `);
  const linked = (r.rows as any[]).length;
  const [{ cnt: after }] = (await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM plans WHERE plan_def_id IS NULL
  `)).rows as any[] as { cnt: number }[];
  console.log(`  رُبط ${linked} يتيم. متبقّي بدون ربط: ${after} (نُبقيها بـ plan_def_id = NULL للتاريخ).`);
  console.log(`  ملاحظة: لم نُضف NOT NULL على plan_def_id — نحتفظ بالأوراد التاريخية سليمة.`);
}

async function runVerification() {
  h1('التحقّق النهائي');
  const checks = [
    { name: 'تكرارات plans', q: sql`SELECT COUNT(*)::int as c FROM (SELECT 1 FROM plans GROUP BY student_id, date, type HAVING COUNT(*) > 1) t`, expect: 0 },
    { name: 'تكرارات point_logs', q: sql`SELECT COUNT(*)::int as c FROM (SELECT 1 FROM point_logs WHERE ref != '' GROUP BY ref, item_id HAVING COUNT(*) > 1) t`, expect: 0 },
    { name: 'Pending مستقبلي متبقّي', q: sql`SELECT COUNT(*)::int as c FROM plans WHERE status = 'Pending' AND date >= CURRENT_DATE AND plan_def_id IS NOT NULL`, expect: 0 },
    { name: 'خطط active=true', q: sql`SELECT COUNT(*)::int as c FROM plan_definitions WHERE active = true` },
    { name: 'خطط active=false (مؤرشفة)', q: sql`SELECT COUNT(*)::int as c FROM plan_definitions WHERE active = false` },
    { name: 'أوراد يتيمة متبقّية', q: sql`SELECT COUNT(*)::int as c FROM plans WHERE plan_def_id IS NULL` }
  ];
  for (const chk of checks) {
    const [{ c }] = (await db.execute(chk.q)).rows as any[] as { c: number }[];
    const mark = chk.expect !== undefined ? (c === chk.expect ? '✅' : '⚠️ ') : '  ';
    console.log(`  ${mark} ${chk.name.padEnd(30)} : ${pad(c)}${chk.expect !== undefined ? ` (متوقع ${chk.expect})` : ''}`);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isApply = args.has('--apply');

  if (isApply && process.env.MIGRATE_CONFIRM !== 'RAW_PLAN_APPLY') {
    console.error('⛔ تأكيد مطلوب قبل --apply:');
    console.error('   PowerShell: $env:MIGRATE_CONFIRM="RAW_PLAN_APPLY"; npx tsx scripts/migrate-to-raw-plan.ts --apply');
    console.error('   bash     : MIGRATE_CONFIRM=RAW_PLAN_APPLY npx tsx scripts/migrate-to-raw-plan.ts --apply');
    process.exit(2);
  }

  const diag = await runDiagnostic();

  if (!isApply) {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  ✅ DRY-RUN انتهى. لا تغييرات على قاعدة البيانات.');
    console.log('  للتنفيذ: $env:MIGRATE_CONFIRM="RAW_PLAN_APPLY"; npx tsx ... --apply');
    console.log('  ⚠️  خذ نسخة احتياطية من Neon أولاً (branch من console.neon.tech).');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    return;
  }

  h1('APPLY — تنفيذ الهجرة');
  console.log('  ⚠️  يُفترض أنك أخذت نسخة Neon branch قبل هذا.');
  console.log('  التنفيذ بترتيب حتمي: A → B → D → C → F → E → G → verify');
  console.log('  (D قبل E لتفعيل UNIQUE قبل أي INSERTs قد تحدث لاحقاً)');

  // الترتيب المحكم:
  //  A: تنظيف تكرارات logs (قبل UNIQUE على point_logs)
  //  B: تنظيف تكرارات plans (قبل UNIQUE على plans)
  //  C: ALTER plan_definitions (قبل F التي تحتاج active/completed_at)
  //  D: فهارس (بعد تنظيف التكرارات)
  //  E: حذف Pending المستقبلي (آمن مع UNIQUE)
  //  F: أرشفة المكتملة
  //  G: ربط اليتامى
  await stepA_cleanDuplicateLogs();
  await stepB_cleanDuplicatePlans();
  await stepC_alterPlanDefinitions();
  await stepD_createIndexes();
  await stepE_deletePendingFuture();
  await stepF_archiveCompleted(diag.completedIds);
  await stepG_linkOrphans();

  await runVerification();
  console.log('\n✅ انتهت الهجرة.\n');
}

main().catch(e => { console.error('\n❌ فشل:', e); process.exit(1); });
