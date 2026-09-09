import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const keys = new URL(req.url).searchParams.get('keys')?.split(',') || [];
  const rows = keys.length ? await db.select().from(settings).where(inArray(settings.key, keys)) : await db.select().from(settings);
  const values: Record<string,string> = {};
  keys.forEach(k => { values[k] = ''; });
  rows.forEach(r => { values[r.key] = r.value || ''; });
  return NextResponse.json({ success: true, values });
}
export async function POST(req: NextRequest) {
  await requireRole('Teacher');
  const { key, value } = await req.json();
  const existing = (await db.select().from(settings).where(eq(settings.key, key)))[0];
  if (existing) await db.update(settings).set({ value }).where(eq(settings.key, key));
  else await db.insert(settings).values({ key, value });
  return NextResponse.json({ success: true });
}
