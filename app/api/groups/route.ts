import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { groups, studentsData, pointItems, pointLogs } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId, today } from '@/lib/utils';
import { tryAwardBadges } from '@/lib/badges';
import { recomputeGroups } from '@/lib/triggers';

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { name, action, groupId, ids, points, itemId } = await req.json();
    // Compound: multiple ops share this route
    if (action === 'members-set') {
      const wanted = (ids || []).map(String) as string[];
      const inGroup = await db.select().from(studentsData).where(eq(studentsData.groupId, groupId));
      const toRemove = inGroup.map(s => s.studentId).filter(sid => !wanted.includes(String(sid)));
      const incoming = wanted.length ? await db.select().from(studentsData).where(inArray(studentsData.studentId, wanted)) : [];
      const toAdd = incoming.filter(s => String(s.groupId) !== String(groupId));
      if (toRemove.length) await db.update(studentsData).set({ groupId: null }).where(inArray(studentsData.studentId, toRemove));
      if (toAdd.length) await db.update(studentsData).set({ groupId }).where(inArray(studentsData.studentId, toAdd.map(s => s.studentId)));
      await recomputeGroups([groupId, ...toAdd.map(s => s.groupId)]);
      return NextResponse.json({ success: true, added: toAdd.length, removed: toRemove.length });
    }
    if (action === 'add-points') {
      // نقاط مباشرة للمجموعة (لا تتبع طالباً) — تُحفظ في bonus حتى لا تضيع عند إعادة الحساب.
      const p = Number(points) || 0;
      if (!p) return NextResponse.json({ success: false, message: 'أدخل قيمة صحيحة' });
      await db.update(groups).set({ bonusPoints: sql`${groups.bonusPoints} + ${p}` }).where(eq(groups.id, groupId));
      await recomputeGroups([groupId]);
      return NextResponse.json({ success: true, points: p });
    }
    if (action === 'distribute-points') {
      const it = (await db.select().from(pointItems).where(eq(pointItems.id, itemId)))[0];
      if (!it) return NextResponse.json({ success: false, message: 'البند غير موجود' });
      const val = Number(it.pointValue) || 0;
      const members = await db.select().from(studentsData).where(eq(studentsData.groupId, groupId));
      if (!members.length) return NextResponse.json({ success: false, message: 'لا يوجد طلاب في المجموعة' });
      const t = today();
      await db.batch([
        db.insert(pointLogs).values(members.map(m => ({ id: genId('L'), studentId: m.studentId, itemId, teacherId: teacher.id, date: t, pointValue: val }))),
        db.update(studentsData).set({ totalPoints: sql`${studentsData.totalPoints} + ${val}` }).where(inArray(studentsData.studentId, members.map(m => m.studentId)))
      ] as any);
      await recomputeGroups([groupId]);
      for (const m of members) await tryAwardBadges(m.studentId);
      return NextResponse.json({ success: true, count: members.length, pointsEach: val, totalAdded: val * members.length });
    }
    // Create group
    if (!name) return NextResponse.json({ success: false, message: 'أدخل الاسم' });
    const id = genId('G');
    await db.insert(groups).values({ id, name });
    return NextResponse.json({ success: true, id, group: { Group_ID: id, Group_Name: name, Group_Total_Points: 0 } });
  } catch (e: any) {
    return errorResponse(e);
  }
}

/** إعادة تسمية مجموعة */
export async function PATCH(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id, upd } = await req.json();
    const name = String(upd?.Group_Name || '').trim();
    if (!id || !name) return NextResponse.json({ success: false, message: 'أدخل الاسم' }, { status: 400 });
    await db.update(groups).set({ name }).where(eq(groups.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return errorResponse(e);
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
    return errorResponse(e);
  }
}
