#!/usr/bin/env node
/**
 * يستخرج معرفات التغريدات من أرشيف X الرسمي.
 *
 * الاستخدام:
 *   node parse-archive.mjs ./archive/data/tweets.js
 *
 * المدخل: ملف tweets.js من أرشيفك (الذي حمّلته من X Settings → Download archive)
 * المخرج: tweet-ids.json فيه كل المعرفات مع الفلترة حسب .env
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const input = process.argv[2];

if (!input) {
  console.error('❌ الاستخدام: node parse-archive.mjs <path-to-tweets.js>');
  console.error('   مثال: node parse-archive.mjs ./archive/data/tweets.js');
  process.exit(1);
}

if (!fs.existsSync(input)) {
  console.error(`❌ الملف غير موجود: ${input}`);
  process.exit(1);
}

console.log(`📂 جاري قراءة: ${input}`);
let raw = fs.readFileSync(input, 'utf8');

// الأرشيف يبدأ بـ: window.YTD.tweets.part0 = [...]
raw = raw.replace(/^window\.YTD\.tweets\.part\d+\s*=\s*/, '');

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('❌ فشل تحليل JSON. تأكد أنك تمرّر ملف tweets.js من الأرشيف.');
  console.error(e.message);
  process.exit(1);
}

console.log(`📊 إجمالي التغريدات في الأرشيف: ${data.length}`);

const olderThan = env.OLDER_THAN ? new Date(env.OLDER_THAN).getTime() : null;
const newerThan = env.NEWER_THAN ? new Date(env.NEWER_THAN).getTime() : null;
const keepIfLikes = Number(env.KEEP_IF_LIKES_ABOVE || 0);

const filtered = [];
const skipped = { date: 0, likes: 0 };

for (const entry of data) {
  const t = entry.tweet || entry;
  const id = t.id_str || t.id;
  if (!id) continue;

  const created = new Date(t.created_at).getTime();
  if (olderThan && created >= olderThan) { skipped.date++; continue; }
  if (newerThan && created <= newerThan) { skipped.date++; continue; }

  const likes = Number(t.favorite_count || 0);
  if (keepIfLikes > 0 && likes > keepIfLikes) { skipped.likes++; continue; }

  filtered.push({
    id: String(id),
    created_at: t.created_at,
    text: (t.full_text || t.text || '').slice(0, 100),
    likes,
    retweets: Number(t.retweet_count || 0),
  });
}

// الأقدم أولاً (آمن أكثر — تبدأ بالتغريدات القديمة)
filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

const outPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'tweet-ids.json');
fs.writeFileSync(outPath, JSON.stringify(filtered, null, 2));

console.log(`\n✅ تم الاستخراج:`);
console.log(`   • للحذف: ${filtered.length}`);
console.log(`   • مُستثناة بسبب التاريخ: ${skipped.date}`);
console.log(`   • مُستثناة بسبب الإعجابات: ${skipped.likes}`);
console.log(`\n💾 حُفظت في: ${outPath}`);
console.log(`\n▶️ الخطوة التالية: npm run delete`);
