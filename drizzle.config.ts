import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const raw = process.env.DATABASE_URL || '';
// BOM يُضاف أحياناً عند حفظ .env.local من PowerShell → يُزال دفاعياً
const url = raw.replace(/^﻿/, '').trim();

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true
} satisfies Config;
