import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students_data (
  student_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  total_points INTEGER NOT NULL DEFAULT 0,
  student_phone TEXT DEFAULT '',
  parent_phone TEXT DEFAULT '',
  nazem_id TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS students_group_idx ON students_data (group_id);
CREATE INDEX IF NOT EXISTS students_parent_idx ON students_data (parent_id);
CREATE INDEX IF NOT EXISTS students_nazem_idx ON students_data (nazem_id);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  daily_target TEXT DEFAULT '',
  from_surah TEXT DEFAULT '',
  from_ayah TEXT DEFAULT '',
  to_surah TEXT DEFAULT '',
  to_ayah TEXT DEFAULT '',
  amount TEXT DEFAULT '',
  type TEXT DEFAULT 'conserve',
  status TEXT DEFAULT 'Pending',
  source TEXT DEFAULT 'Manual',
  locked BOOLEAN DEFAULT FALSE,
  nazem_item_day_id TEXT DEFAULT '',
  mistakes INTEGER,
  hearing INTEGER,
  repetition INTEGER,
  link_val INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS plans_student_date_idx ON plans (student_id, date);
CREATE INDEX IF NOT EXISTS plans_date_idx ON plans (date);
CREATE INDEX IF NOT EXISTS plans_nazem_item_idx ON plans (nazem_item_day_id);

CREATE TABLE IF NOT EXISTS point_items (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  point_value INTEGER NOT NULL,
  trigger TEXT DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS point_logs (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  teacher_id TEXT DEFAULT '',
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS logs_student_date_idx ON point_logs (student_id, date);

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT DEFAULT 'All',
  date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  date DATE NOT NULL,
  type TEXT DEFAULT 'عام'
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL,
  note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS att_student_date_idx ON attendance (student_id, date);
CREATE INDEX IF NOT EXISTS att_date_idx ON attendance (date);

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  icon TEXT DEFAULT '',
  date DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS badges_student_code_idx ON badges (student_id, code);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS nazem_session (
  id INTEGER PRIMARY KEY DEFAULT 1,
  username TEXT DEFAULT '',
  password_enc TEXT DEFAULT '',
  cookies JSONB DEFAULT '{}'::jsonb,
  xsrf TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function main() {
  console.log('🚀 Running migrations against Neon...');
  for (const stmt of DDL.split(';').map(s=>s.trim()).filter(Boolean)) {
    await sql(stmt);
    console.log('✓', stmt.split('\n')[0].slice(0, 60));
  }
  console.log('✅ All migrations applied.');
}

main().catch(e => { console.error(e); process.exit(1); });
