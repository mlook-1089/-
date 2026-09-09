import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { groups, studentsData, pointItems, pointLogs } from '@/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { genId, today } from '@/lib/utils';
import { tryAwardBadges } from '@/lib/badges';

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { name, action, groupId, ids, points, itemId } = await req.json();
    // Compound: multiple ops share this route
    if (action === 'members-set') {
      const inGroup = await db.select().from(studentsData).where(eq(studentsData.groupId, groupId));
      const setNew = new Set((ids || []).map(String));
      let added = 0, removed = 0;
      for (const s of inGroup) {
        if (!setNew.has(String(s.studentId))) {
          const pts = Number(s.totalPoints) || 0;
          await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} - ${pts}` }).where(eq(groups.id, groupId));
          await db.update(studentsData).set({ groupId: null }).where(eq(studentsData.studentId, s.studentId));
          removed++;
        }
      }
      for (const sid of (ids || [])) {
        const s = (await db.select().from(studentsData).where(eq(studentsData.studentId, sid)))[0];
        if (!s || String(s.groupId) === String(groupId)) continue;
        const pts = Number(s.totalPoints) || 0;
        if (s.groupId) await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} - ${pts}` }).where(eq(groups.id, s.groupId));
        await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} + ${pts}` }).where(eq(groups.id, groupId));
        await db.update(studentsData).set({ groupId }).where(eq(studentsData.studentId, sid));
        added++;
      }
      return NextResponse.json({ success: true, added, removed });
    }
    if (action === 'add-points') {
      const p = Number(points) || 0;
      if (!p) return NextResponse.json({ success: false, message: 'أدخل قيمة صحيحة' });
      await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} + ${p}` }).where(eq(groups.id, groupId));
      return NextResponse.json({ success: true, points: p });
    }
    if (action === 'distribute-points') {
      const it = (await db.select().from(pointItems).where(eq(pointItems.id, itemId)))[0];
      if (!it) return NextResponse.json({ success: false, message: 'البند غير موجود' });
      const val = Number(it.pointValue) || 0;
      const members = await db.select().from(studentsData).where(eq(studentsData.groupId, groupId));
      if (!members.length) return NextResponse.json({ success: false, message: 'لا يوجد طلاب في المجموعة' });
      const t = today();
      for (const m of members) {
        await db.insert(pointLogs).values({ id: genId('L'), studentId: m.studentId, itemId, teacherId: '', date: t });
        await db.update(studentsData).set({ totalPoints: (Number(m.totalPoints)||0) + val }).where(eq(studentsData.studentId, m.studentId));
        await tryAwardBadges(m.studentId);
      }
      await db.update(groups).set({ totalPoints: sql`${groups.totalPoints} + ${val * members.length}` }).where(eq(groups.id, groupId));
      return NextResponse.json({ success: true, count: members.length, pointsEach: val, totalAdded: val * members.length });
    }
    // Create group
    if (!name) return NextResponse.json({ success: false, message: 'أدخل الاسم' });
    const id = genId('G');
    await db.insert(groups).values({ id, name });
    return NextResponse.json({ success: true, id, group: { Group_ID: id, Group_Name: name, Group_Total_Points: 0 } });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id } = await req.json();
    const inGrp = await db.select().from(studentsData).where(eq(studentsData.groupId, id));
    if (inGrp.length) return NextResponse.json({ success: false, message: 'لا يمكن حذف مجموعة تحتوي طلاباً.' });
    await db.delete(groups).where(eq(groups.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
