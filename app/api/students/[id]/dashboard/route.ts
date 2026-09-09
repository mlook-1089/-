import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, pointLogs, pointItems, groups, badges, attendance, studentsData, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { today, buildPlanTarget } from '@/lib/utils';
import { computeStreak } from '@/lib/badges';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireSession();
  const sid = params.id;
  if (s.role === 'Student' && s.id !== sid) return NextResponse.json({ success: false }, { status: 403 });

  const me = (await db.select().from(studentsData).where(eq(studentsData.studentId, sid)))[0] || null;
  const stPlans = await db.select().from(plans).where(eq(plans.studentId, sid));
  const enriched = stPlans.map(p => ({
    Plan_ID: p.id, Date: String(p.date),
    Daily_Target: p.dailyTarget || buildPlanTarget({ fromSurah: p.fromSurah, fromAyah: p.fromAyah, toSurah: p.toSurah, toAyah: p.toAyah, amount: p.amount }),
    Accomplishment_Status: p.status, Source: p.source, Type: p.type,
    From_Surah: p.fromSurah, From_Ayah: p.fromAyah, To_Surah: p.toSurah, To_Ayah: p.toAyah
  })).sort((a, b) => b.Date.localeCompare(a.Date));

  const items = await db.select().from(pointItems);
  const itemMap: Record<string, any> = {}; items.forEach(x => itemMap[x.id] = x);
  const logs = (await db.select().from(pointLogs).where(eq(pointLogs.studentId, sid))).map(l => ({
    Date: String(l.date), Description: itemMap[l.itemId]?.description || '-', Point_Value: itemMap[l.itemId]?.pointValue || 0
  })).reverse();

  const groupsRows = await db.select().from(groups);
  const leaderboard = groupsRows.map(g => ({ name: g.name, points: g.totalPoints || 0 })).sort((a, b) => b.points - a.points);
  const stBadges = (await db.select().from(badges).where(eq(badges.studentId, sid))).map(b => ({ Icon: b.icon, Title: b.title, Date: String(b.date), Code: b.code }));
  const attRows = await db.select().from(attendance).where(eq(attendance.studentId, sid));
  const presentDays = attRows.filter(a => a.status === 'Present' || a.status === 'Late').length;

  const doneAll = enriched.filter(p => p.Accomplishment_Status === 'Done');
  const streak = computeStreak(doneAll.map(p => p.Date));

  // progress
  const byType: Record<string, any> = { conserve: null, revision: null, mastery: null };
  const counts = { conserve: 0, revision: 0, mastery: 0 };
  doneAll.forEach(p => {
    const t = (p.Type || 'conserve') as keyof typeof byType;
    if (counts[t] !== undefined) counts[t]++;
    if (!p.To_Surah) return;
    if (!byType[t]) byType[t] = { surah: p.To_Surah, ayah: p.To_Ayah };
  });

  const t = today();
  return NextResponse.json({
    success: true,
    totalPoints: me?.totalPoints || 0,
    todayPlan: enriched.find(p => p.Date === t) || null,
    plans: enriched, logs, leaderboard, badges: stBadges,
    stats: { donePlans: doneAll.length, totalPlans: enriched.length, donePct: enriched.length ? Math.round(doneAll.length / enriched.length * 100) : 0, streak, presentDays },
    progress: { conserve: byType.conserve, revision: byType.revision, mastery: byType.mastery, counts }
  });
}
