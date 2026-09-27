import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, pointLogs, pointItems, groups, badges, attendance, studentsData, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireSession, AuthError } from '@/lib/auth';
import { today, buildPlanTarget } from '@/lib/utils';
import { computeStreak } from '@/lib/badges';
import type { SessionUser } from '@/lib/auth';

/** تحقق أن المستخدم مصرّح له بعرض ملف الطالب sid */
async function canViewStudent(s: SessionUser, sid: string): Promise<boolean> {
  if (s.role === 'Teacher') return true;
  if (s.role === 'Student') return s.id === sid;
  if (s.role === 'Parent') {
    const rel = (await db.select().from(studentsData).where(and(eq(studentsData.studentId, sid), eq(studentsData.parentId, s.id))))[0];
    return !!rel;
  }
  return false;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
  const s = await requireSession();
  const sid = params.id;
  if (!(await canViewStudent(s, sid))) return NextResponse.json({ success: false }, { status: 403 });

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
  // نعرض القيمة التاريخية (لحظة المنح) من عمود pointValue بدل القيمة الحالية للبند
  // — حتى لا يتغيّر السجل بأثر رجعي إذا عُدّل البند أو حُذف.
  const logs = (await db.select().from(pointLogs).where(eq(pointLogs.studentId, sid))).map(l => ({
    Date: String(l.date),
    Description: itemMap[l.itemId]?.description || '— (بند محذوف)',
    Point_Value: (l.pointValue ?? itemMap[l.itemId]?.pointValue ?? 0)
  })).reverse();

  const groupsRows = await db.select().from(groups);
  // نمرّر id ليتيح للواجهة تظليل مجموعة الطالب في لوحة الترتيب
  const leaderboard = groupsRows.map(g => ({ id: g.id, name: g.name, points: g.totalPoints || 0 })).sort((a, b) => b.points - a.points);
  const stBadges = (await db.select().from(badges).where(eq(badges.studentId, sid))).map(b => ({ Icon: b.icon, Title: b.title, Date: String(b.date), Code: b.code }));
  const attRows = await db.select().from(attendance).where(eq(attendance.studentId, sid));
  const presentDays = attRows.filter(a => a.status === 'Present').length;
  const lateDays = attRows.filter(a => a.status === 'Late').length;
  const absentDays = attRows.filter(a => a.status === 'Absent').length;
  // آخر ٣٠ يوم غياب/تأخير — يُعرض في بوابتي الطالب وولي الأمر
  const attendanceHistory = attRows
    .map(a => ({ Date: String(a.date), Status: a.status, Note: a.note || '' }))
    .sort((a, b) => b.Date.localeCompare(a.Date))
    .slice(0, 60);

  const doneAll = enriched.filter(p => p.Accomplishment_Status === 'Done');
  const streak = computeStreak(doneAll.map(p => p.Date));

  // progress — مسار «الإتقان» أُلغي من الخلفية؛ نقتصر على حفظ ومراجعة.
  // أي صفوف قديمة type='mastery' في القاعدة تُطوى إلى conserve حتى لا تُهمَل عدّاً.
  const byType: Record<string, any> = { conserve: null, revision: null };
  const counts = { conserve: 0, revision: 0 };
  doneAll.forEach(p => {
    const raw = (p.Type || 'conserve');
    const t = (raw === 'revision' ? 'revision' : 'conserve') as keyof typeof byType;
    counts[t]++;
    if (!p.To_Surah) return;
    if (!byType[t]) byType[t] = { surah: p.To_Surah, ayah: p.To_Ayah };
  });

  const t = today();
  return NextResponse.json({
    success: true,
    totalPoints: me?.totalPoints || 0,
    todayPlan: enriched.find(p => p.Date === t) || null,
    plans: enriched, logs, leaderboard, badges: stBadges,
    myGroupId: me?.groupId || null,
    stats: { donePlans: doneAll.length, totalPlans: enriched.length, donePct: enriched.length ? Math.round(doneAll.length / enriched.length * 100) : 0, streak, presentDays, lateDays, absentDays },
    attendanceHistory,
    progress: { conserve: byType.conserve, revision: byType.revision, counts }
  });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
