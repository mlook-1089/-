import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';

// Lazy init to avoid build-time crashes when DATABASE_URL isn't injected during page-data collection
let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  if (_db) return _db;
  // Strip BOM / whitespace defensively (PowerShell pipe often adds U+FEFF)
  const url = (process.env.DATABASE_URL || '').replace(/^﻿/, '').trim();
  if (!url) throw new Error('DATABASE_URL is not set');
  _db = drizzle(neon(url), { schema });
  return _db;
}
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) { return (getDb() as any)[prop]; }
});
export { schema };
