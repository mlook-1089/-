#!/usr/bin/env node
/** عرض إحصائيات التقدم. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDS = path.join(__dirname, 'tweet-ids.json');
const STATE = path.join(__dirname, 'state.json');

if (!fs.existsSync(IDS)) {
  console.log('لم يتم استخراج أي معرفات بعد. شغّل: npm run parse');
  process.exit(0);
}

const tweets = JSON.parse(fs.readFileSync(IDS, 'utf8'));
const state = fs.existsSync(STATE)
  ? JSON.parse(fs.readFileSync(STATE, 'utf8'))
  : { deleted: [], failed: [], notFound: [] };

const total = tweets.length;
const deleted = state.deleted.length;
const notFound = state.notFound.length;
const failed = state.failed.length;
const remaining = total - deleted - notFound;
const pct = total ? ((deleted + notFound) / total * 100).toFixed(1) : 0;

const bar = Math.floor((deleted + notFound) / total * 40);
const barStr = '█'.repeat(bar) + '░'.repeat(40 - bar);

console.log(`\n📊 إحصائيات حذف التغريدات\n`);
console.log(`[${barStr}] ${pct}%\n`);
console.log(`   الإجمالي:        ${total}`);
console.log(`   محذوفة:          ${deleted}`);
console.log(`   غير موجودة:      ${notFound}`);
console.log(`   فشلت:            ${failed}`);
console.log(`   المتبقّية:        ${remaining}\n`);

if (state.startedAt) console.log(`   بدأت في: ${state.startedAt}`);
