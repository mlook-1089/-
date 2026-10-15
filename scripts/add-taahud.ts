// هجرة: إنشاء جداول برنامج «تعاهد» (periods + assignments + records).
// التشغيل:  npx tsx scripts/add-taahud.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

async function migrate() {
  const url = (process.env.DATABASE_URL || '').replace(/^﻿/, '').trim();
  if (!url) throw new Error('DATABASE_URL غير محددة');
  const sql = neon(url);

  console.log('إنشاء جدول taahud_periods...');
  await sql`
    CREATE TABLE IF NOT EXISTS taahud_periods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS tp_status_idx ON taahud_periods (status);`;

  console.log('إنشاء جدول taahud_assignments...');
  await sql`
    CREATE TABLE IF NOT EXISTS taahud_assignments (
      id TEXT PRIMARY KEY,
      period_id TEXT NOT NULL REFERENCES taahud_periods(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hizb_number INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS ta_period_student_hizb_uniq ON taahud_assignments (period_id, student_id, hizb_number);`;
  await sql`CREATE INDEX IF NOT EXISTS ta_period_student_idx ON taahud_assignments (period_id, student_id);`;

  console.log('إنشاء جدول taahud_records...');
  await sql`
    CREATE TABLE IF NOT EXISTS taahud_records (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL REFERENCES taahud_assignments(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL,
      mistakes INTEGER NOT NULL DEFAULT 0,
      warnings INTEGER NOT NULL DEFAULT 0,
      total_points INTEGER NOT NULL,
      deduct_per_mistake INTEGER NOT NULL,
      deduct_per_warning INTEGER NOT NULL,
      score INTEGER NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS tr_assignment_uniq ON taahud_records (assignment_id);`;

  console.log('إعدادات افتراضية (إن لم تكن موجودة)...');
  await sql`INSERT INTO settings (key, value) VALUES ('taahud_total_per_hizb', '100') ON CONFLICT (key) DO NOTHING;`;
  await sql`INSERT INTO settings (key, value) VALUES ('taahud_deduct_per_mistake', '2') ON CONFLICT (key) DO NOTHING;`;
  await sql`INSERT INTO settings (key, value) VALUES ('taahud_deduct_per_warning', '1') ON CONFLICT (key) DO NOTHING;`;

  console.log('✅ الهجرة اكتملت بنجاح');
}

migrate().catch((e) => { console.error(e); process.exit(1); });
