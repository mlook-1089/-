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
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_pw boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
-- إن لم يوجد أي مشرف (قاعدة قديمة) نرقّي أقدم معلم فقط — لا كل المعلمين في كل تشغيل.
UPDATE users SET is_admin = true WHERE id = (SELECT id FROM users WHERE role = 'Teacher' ORDER BY created_at LIMIT 1) AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'Teacher' AND is_admin = true);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

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
ALTER TABLE point_logs ADD COLUMN IF NOT EXISTS point_value INTEGER;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_user_idx ON push_subscriptions (user_id);

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
CREATE INDEX IF NOT EXISTS att_date_idx ON attendance (date);

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  icon TEXT DEFAULT '',
  date DATE NOT NULL
);

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

ALTER TABLE news ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'post';
ALTER TABLE news ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT '';
CREATE TABLE IF NOT EXISTS news_comments (
  id TEXT PRIMARY KEY,
  news_id TEXT NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  body TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nc_news_idx ON news_comments (news_id);
CREATE INDEX IF NOT EXISTS nc_user_idx ON news_comments (user_id);

-- مصدر النقاط التلقائية (plan:<id> / att:<id>) لسحبها عند التراجع عن الحالة
ALTER TABLE point_logs ADD COLUMN IF NOT EXISTS ref TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS logs_ref_idx ON point_logs (ref);
CREATE UNIQUE INDEX IF NOT EXISTS logs_ref_item_uniq ON point_logs (ref, item_id) WHERE ref <> '';

-- محاولات الدخول الفاشلة (حدّ التخمين)
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ
);

-- نقاط المجموعة = نقاط مباشرة (bonus) + مجموع نقاط الأعضاء
ALTER TABLE groups ADD COLUMN IF NOT EXISTS bonus_points INTEGER NOT NULL DEFAULT 0;
UPDATE groups g SET bonus_points = GREATEST(g.total_points - COALESCE((SELECT SUM(s.total_points) FROM students_data s WHERE s.group_id = g.id), 0), 0) WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'mig_group_bonus_v1');
INSERT INTO settings (key, value) VALUES ('mig_group_bonus_v1', 'done') ON CONFLICT (key) DO NOTHING;
UPDATE groups g SET total_points = g.bonus_points + COALESCE((SELECT SUM(s.total_points) FROM students_data s WHERE s.group_id = g.id), 0);

-- منع التكرار: حضور واحد لكل طالب في اليوم، وشارة واحدة من كل رمز (نحذف المكرر أولاً ونُبقي الأحدث)
DELETE FROM attendance a USING attendance b WHERE a.student_id = b.student_id AND a.date = b.date AND a.id < b.id;
CREATE UNIQUE INDEX IF NOT EXISTS att_student_date_uniq ON attendance (student_id, date);
DROP INDEX IF EXISTS att_student_date_idx;
DELETE FROM badges a USING badges b WHERE a.student_id = b.student_id AND a.code = b.code AND a.id < b.id;
CREATE UNIQUE INDEX IF NOT EXISTS badges_student_code_uniq ON badges (student_id, code);
DROP INDEX IF EXISTS badges_student_code_idx;
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
