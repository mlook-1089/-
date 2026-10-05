// هجرة: إضافة عمودي "ما تم تسميعه فعلاً" إلى جدول plans.
// toSurah/toAyah = النطاق المطلوب (ثابت). actualToSurah/actualToAyah = ما بلغه الطالب في حال "جزئي".
// التشغيل:  npx tsx scripts/add-actual-reach-columns.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

async function migrate() {
  const url = (process.env.DATABASE_URL || '').replace(/^﻿/, '').trim();
  if (!url) throw new Error('DATABASE_URL غير محددة');
  const sql = neon(url);

  console.log('إضافة actual_to_surah / actual_to_ayah إلى plans...');
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS actual_to_surah TEXT`;
  await sql`ALTER TABLE plans ADD COLUMN IF NOT EXISTS actual_to_ayah TEXT`;

  console.log('✅ الهجرة اكتملت بنجاح');
}

migrate().catch(e => { console.error('❌ فشل:', e); process.exit(1); });
