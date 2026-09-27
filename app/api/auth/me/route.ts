import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ success: false });
  const row = (await db.select().from(users).where(eq(users.id, s.id)))[0];
  return NextResponse.json({ success: true, user: { ID: s.id, Name: s.name, Role: s.role, mustChangePw: row?.mustChangePw || false, isAdmin: row?.isAdmin || false } });
}
