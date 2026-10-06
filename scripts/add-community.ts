// هجرة: إنشاء جدولَي محادثة المجموعة (community_messages + community_reactions).
// التشغيل:  npx tsx scripts/add-community.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

async function migrate() {
  const url = (process.env.DATABASE_URL || '').replace(/^﻿/, '').trim();
  if (!url) throw new Error('DATABASE_URL غير محددة');
  const sql = neon(url);

  console.log('إنشاء جدول community_messages...');
  await sql`
    CREATE TABLE IF NOT EXISTS community_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS cm_group_created_idx ON community_messages (group_id, created_at);`;
  await sql`CREATE INDEX IF NOT EXISTS cm_author_idx ON community_messages (author_id);`;

  console.log('إنشاء جدول community_reactions...');
  await sql`
    CREATE TABLE IF NOT EXISTS community_reactions (
      message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL DEFAULT 'heart',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id, emoji)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS cr_msg_idx ON community_reactions (message_id);`;

  console.log('✅ الهجرة اكتملت بنجاح');
}

migrate().catch((e) => { console.error(e); process.exit(1); });
