// استبدال كامل لجدول الأحداث (events): حذف كل الصفوف ثم إدراج جدول الطلعات والبكور والسرد.
// التواريخ ميلادية (YYYY-MM-DD) محوّلة مسبقاً من تقويم أم القرى الهجري 1448.
// التشغيل:  npx tsx scripts/replace_events.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { db } from '@/lib/db';
import { events } from '@/db/schema';
import { genId } from '@/lib/utils';

type EventRow = { type: string; title: string; date: string; description: string };

// 16 حدثاً بالترتيب المطلوب
const DATA: EventRow[] = [
  // ─── الطلعات (type: طلعة) ───
  { type: 'طلعة', title: 'الطلعة الأولى',   date: '2026-10-08', description: 'الضيافة: معارج · الثقافة: رواد · الطبخ: شموخ' },
  { type: 'طلعة', title: 'الطلعة الثانية', date: '2026-10-22', description: 'الضيافة: شموخ · الثقافة: معارج · الطبخ: رواد' },
  { type: 'طلعة', title: 'الطلعة الثالثة', date: '2026-11-05', description: 'الضيافة: رواد · الثقافة: شموخ · الطبخ: معارج' },
  { type: 'طلعة', title: 'الطلعة الرابعة', date: '2026-11-19', description: 'الضيافة: معارج · الثقافة: رواد · الطبخ: شموخ' },
  { type: 'طلعة', title: 'الطلعة الخامسة', date: '2026-12-10', description: 'الضيافة: شموخ · الثقافة: معارج · الطبخ: رواد' },
  { type: 'طلعة', title: 'الطلعة السادسة', date: '2026-12-24', description: 'الضيافة: رواد · الثقافة: شموخ · الطبخ: معارج' },

  // ─── البكور (type: بكور) — بلا وصف ───
  { type: 'بكور', title: 'البكور الأول',  date: '2026-10-02', description: '' },
  { type: 'بكور', title: 'البكور الثاني', date: '2026-10-16', description: '' },
  { type: 'بكور', title: 'البكور الثالث', date: '2026-10-30', description: '' },
  { type: 'بكور', title: 'البكور الرابع', date: '2026-11-13', description: '' },
  { type: 'بكور', title: 'البكور الخامس', date: '2026-11-27', description: '' },
  { type: 'بكور', title: 'البكور السادس', date: '2026-12-18', description: '' },

  // ─── أيام السرد (type: سرد) — بلا وصف ───
  { type: 'سرد', title: 'يوم السرد الأول',  date: '2026-10-17', description: '' },
  { type: 'سرد', title: 'يوم السرد الثاني', date: '2026-11-14', description: '' },
  { type: 'سرد', title: 'يوم السرد الثالث', date: '2026-12-12', description: '' },
  { type: 'سرد', title: 'يوم السرد الرابع', date: '2027-01-30', description: '' }
];

async function main() {
  // (1) حذف كل الأحداث الحالية
  const deleted = await db.delete(events).returning({ id: events.id });
  console.log(`🗑️  حُذف ${deleted.length} حدثاً`);

  // (2) إدراج الأحداث الـ16 دفعة واحدة
  const rows = DATA.map((r) => ({
    id: genId('E'),
    title: r.title,
    description: r.description,
    date: r.date,
    type: r.type
  }));
  const inserted = await db.insert(events).values(rows).returning({ id: events.id });
  console.log(`✅ أُدرج ${inserted.length} حدثاً`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('❌ فشل:', e); process.exit(1); });
