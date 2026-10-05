// حذف كل الأوراد التي لم تُسمَّع (status='Pending') لجميع الطلاب.
// يُبقي الأوراد المسمّعة (Done/Partial/Missed) + سجلات النقاط + مجاميع الطلاب والمجموعات.
// التشغيل:  npx tsx scripts/reset-pending-plans.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { db } from '@/lib/db';
import { plans } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const before = await db.select({ id: plans.id, status: plans.status, source: plans.source }).from(plans);
  const pending = before.filter(p => p.status === 'Pending');
  const byStatus = before.reduce<Record<string, number>>((a, p) => { a[p.status || '?'] = (a[p.status || '?'] || 0) + 1; return a; }, {});
  const bySource = pending.reduce<Record<string, number>>((a, p) => { a[p.source || '?'] = (a[p.source || '?'] || 0) + 1; return a; }, {});

  console.log('قبل الحذف:');
  console.log('  مجموع الأوراد:', before.length);
  console.log('  حسب الحالة:   ', byStatus);
  console.log('  Pending حسب المصدر:', bySource);

  const deleted = await db.delete(plans).where(eq(plans.status, 'Pending')).returning({ id: plans.id });
  console.log('\nحُذف:', deleted.length, 'ورد');

  const after = await db.select({ id: plans.id }).from(plans);
  console.log('المتبقي:', after.length, 'ورد');
  console.log('\n✅ تمّ. النقاط وسجلاتها وأوراد التسميع لم تُمَس.');
}

main().catch(e => { console.error(e); process.exit(1); });
