#!/usr/bin/env node
/**
 * يحذف التغريدات من tweet-ids.json واحدة تلو الأخرى عبر X API v2.
 * قابل للاستئناف — يحفظ التقدم في state.json.
 *
 * الاستخدام:
 *   npm run delete
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.mjs';
import { signRequest } from './lib/oauth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv();

const required = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
for (const k of required) {
  if (!env[k]) {
    console.error(`❌ المتغير ${k} غير موجود في .env`);
    console.error('   انسخ .env.example إلى .env واملأ المفاتيح.');
    process.exit(1);
  }
}

const IDS_FILE = path.join(__dirname, 'tweet-ids.json');
const STATE_FILE = path.join(__dirname, 'state.json');
const LOG_FILE = path.join(__dirname, 'delete.log');

if (!fs.existsSync(IDS_FILE)) {
  console.error('❌ tweet-ids.json غير موجود. شغّل أولاً: npm run parse <path-to-tweets.js>');
  process.exit(1);
}

const tweets = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
const state = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : { deleted: [], failed: [], notFound: [], startedAt: new Date().toISOString() };

const deletedSet = new Set(state.deleted.map(String));
const failedSet = new Set(state.failed.map(String));
const notFoundSet = new Set(state.notFound.map(String));

const remaining = tweets.filter(
  (t) => !deletedSet.has(t.id) && !notFoundSet.has(t.id)
);

const maxPerRun = Number(env.MAX_DELETE_PER_RUN || 1000);
const delayMs = Number(env.DELAY_MS || 1200);
const batch = remaining.slice(0, maxPerRun);

console.log(`📊 الحالة:`);
console.log(`   • الإجمالي: ${tweets.length}`);
console.log(`   • محذوفة سابقاً: ${deletedSet.size}`);
console.log(`   • غير موجودة: ${notFoundSet.size}`);
console.log(`   • فشلت سابقاً: ${failedSet.size}`);
console.log(`   • المتبقّية: ${remaining.length}`);
console.log(`   • هذه الجلسة: ${batch.length} (بتأخير ${delayMs}ms)`);
console.log('');

if (batch.length === 0) {
  console.log('✅ لا شيء لحذفه. انتهى.');
  process.exit(0);
}

// تأكيد
if (!process.argv.includes('--yes')) {
  console.log('⚠️  للمتابعة أضف العلم --yes:');
  console.log('   node delete-tweets.mjs --yes');
  process.exit(0);
}

let done = 0;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
log(`\n=== جلسة جديدة ${new Date().toISOString()} — ${batch.length} تغريدة ===`);

process.on('SIGINT', () => {
  console.log('\n⏸️  إيقاف يدوي. حفظ الحالة...');
  saveState();
  logStream.end();
  process.exit(0);
});

for (const t of batch) {
  const result = await deleteTweet(t.id);
  done++;

  if (result.ok) {
    state.deleted.push(t.id);
    log(`✓ ${t.id} — ${t.created_at} — ${t.text.slice(0, 50)}`);
    process.stdout.write(`\r🗑️  [${done}/${batch.length}] ${t.id} حُذف`.padEnd(80));
  } else if (result.notFound) {
    state.notFound.push(t.id);
    log(`∅ ${t.id} — غير موجود (محذوف مسبقاً؟)`);
    process.stdout.write(`\r⏭️  [${done}/${batch.length}] ${t.id} غير موجود`.padEnd(80));
  } else if (result.rateLimit) {
    const resetIn = result.resetIn || 900;
    console.log(`\n⏳ تم بلوغ حد المعدل. العودة بعد ${Math.ceil(resetIn / 60)} دقيقة.`);
    log(`! RATE LIMIT — reset in ${resetIn}s`);
    saveState();
    logStream.end();
    process.exit(2);
  } else {
    if (!failedSet.has(t.id)) state.failed.push(t.id);
    log(`✗ ${t.id} — ${result.error}`);
    process.stdout.write(`\r⚠️  [${done}/${batch.length}] ${t.id} فشل: ${result.error}`.padEnd(80));
  }

  // حفظ دوري كل 10 عمليات
  if (done % 10 === 0) saveState();

  await sleep(delayMs);
}

saveState();
console.log('\n');
console.log(`✅ انتهت الجلسة:`);
console.log(`   • محذوفة في هذه الجلسة: ${state.deleted.length - deletedSet.size}`);
console.log(`   • غير موجودة: ${state.notFound.length - notFoundSet.size}`);
console.log(`   • المتبقّي كلياً: ${tweets.length - state.deleted.length - state.notFound.length}`);
logStream.end();

// ─────────────────────────────────────────────────────────

async function deleteTweet(id) {
  const url = `https://api.x.com/2/tweets/${id}`;
  const auth = signRequest({
    method: 'DELETE',
    url,
    consumerKey: env.X_API_KEY,
    consumerSecret: env.X_API_SECRET,
    token: env.X_ACCESS_TOKEN,
    tokenSecret: env.X_ACCESS_SECRET,
  });

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: auth, Accept: 'application/json' },
    });

    if (res.ok) return { ok: true };

    if (res.status === 404) return { notFound: true };

    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset') || 0);
      const resetIn = reset ? Math.max(0, reset - Math.floor(Date.now() / 1000)) : 900;
      return { rateLimit: true, resetIn };
    }

    const body = await res.text();
    return { error: `HTTP ${res.status}: ${body.slice(0, 150)}` };
  } catch (e) {
    return { error: e.message };
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function log(msg) {
  logStream.write(msg + '\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
