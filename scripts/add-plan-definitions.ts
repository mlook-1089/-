// هجرة: إنشاء جدول plan_definitions + ربطه بـ plans عبر plan_def_id.
// التشغيل:  npx tsx scripts/add-plan-definitions.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

async function migrate() {
  const url = (process.env.DATABASE_URL || '').replace(/^﻿/, '').trim();
  if (!url) throw new Error('DATABASE_URL غير محددة');
  const sql = neon(url);

  console.log('إنشاء جدول plan_definitions...');
  await sql`
    CREATE TABLE IF NOT EXISTS plan_definitions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      ranges JSONB NOT NULL,
      daily_pages TEXT NOT NULL,
      work_days TEXT NOT NULL,
      term_start DATE NOT NULL,
      term_end DATE NOT NULL,
      direction TEXT DEFAULT 'asc',
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS plandef_student_type_idx ON plan_definitions(student_id, type)`;

  console.log('إضافة plan_def_id إلى plans + فهرسه + ربطه بالمفتاح الخارجي...');
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS plan_def_id TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS plans_plan_def_idx ON plans(plan_def_id)`;

  // أضف قيد المفتاح الخارجي فقط إن لم يكن موجوداً
  const existing = await sql`
    SELECT conname FROM pg_constraint
    WHERE conname = 'plans_plan_def_id_fkey'
  ` as any[];
  if (!existing.length) {
    await sql`
      ALTER TABLE plans
      ADD CONSTRAINT plans_plan_def_id_fkey
      FOREIGN KEY (plan_def_id) REFERENCES plan_definitions(id) ON DELETE SET NULL
    `;
  }

  console.log('✅ الهجرة اكتملت بنجاح');
}

migrate().catch(e => { console.error('❌ فشل:', e); process.exit(1); });
