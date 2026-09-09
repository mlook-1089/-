import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireSession();
  const sid = params.id;
  if (s.role === 'Student' && s.id !== sid) return NextResponse.json({ success: false }, { status: 403 });

  const rows = await db.select().from(plans).where(and(eq(plans.studentId, sid), eq(plans.status, 'Done')));
  const byType: Record<string, any> = { conserve: null, revision: null, mastery: null };
  const counts = { conserve: 0, revision: 0, mastery: 0 };
  rows.forEach(p => {
    const t = (p.type || 'conserve') as keyof typeof byType;
    if (counts[t] !== undefined) counts[t]++;
    if (!p.toSurah) return;
    if (!byType[t]) byType[t] = { surah: p.toSurah, ayah: p.toAyah };
  });
  return NextResponse.json({ success: true, ...byType, counts });
}
