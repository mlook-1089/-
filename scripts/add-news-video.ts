// هجرة قاعدة البيانات: إضافة أعمدة الفيديو لجدول news + جدول التعليقات
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';

async function migrate() {
  const url = (process.env.DATABASE_URL || '').replace(/^﻿/, '').trim();
  if (!url) throw new Error('DATABASE_URL غير محددة');
  const sql = neon(url);

  console.log('إضافة أعمدة type و video_url لجدول news...');
  await sql`ALTER TABLE news ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'post'`;
  await sql`ALTER TABLE news ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT ''`;

  console.log('إنشاء جدول news_comments...');
  await sql`
    CREATE TABLE IF NOT EXISTS news_comments (
      id TEXT PRIMARY KEY,
      news_id TEXT NOT NULL REFERENCES news(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      body TEXT NOT NULL,
      date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS nc_news_idx ON news_comments(news_id)`;
  await sql`CREATE INDEX IF NOT EXISTS nc_user_idx ON news_comments(user_id)`;

  console.log('✅ الهجرة اكتملت بنجاح');
}

migrate().catch(e => { console.error('❌ فشل:', e); process.exit(1); });
