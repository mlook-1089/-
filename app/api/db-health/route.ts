import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData, groups } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

export async function GET() {
  await requireRole('Teacher');
  const [u, sd, gr] = await Promise.all([
    db.select().from(users), db.select().from(studentsData), db.select().from(groups)
  ]);
  const studentUsers = u.filter(x => x.role === 'Student');
  const sdIds = new Set(sd.map(x => x.studentId));
  const userIds = new Set(u.map(x => x.id));
  const groupIds = new Set(gr.map(x => x.id));

  const usersWithoutSd = studentUsers.filter(x => !sdIds.has(x.id)).map(x => ({ id: x.id, name: x.name }));
  const sdWithoutUser = sd.filter(x => !userIds.has(x.studentId)).map(x => ({ id: x.studentId }));
  const sdInvalidGroup = sd.filter(x => x.groupId && !groupIds.has(x.groupId)).map(x => ({ id: x.studentId, group: x.groupId }));

  return NextResponse.json({
    success: true,
    counts: { users: u.length, studentUsers: studentUsers.length, studentsData: sd.length, groups: gr.length },
    issues: { usersWithoutSd, sdWithoutUser, sdInvalidGroup, duplicates: [] }
  });
}

export async function POST() {
  await requireRole('Teacher');
  const [u, sd, gr] = await Promise.all([db.select().from(users), db.select().from(studentsData), db.select().from(groups)]);
  const sdIds = new Set(sd.map(x => x.studentId));
  const userIds = new Set(u.map(x => x.id));
  const groupIds = new Set(gr.map(x => x.id));
  let created = 0, orphansFixed = 0, groupsFixed = 0;

  for (const usr of u.filter(x => x.role === 'Student')) {
    if (!sdIds.has(usr.id)) { await db.insert(studentsData).values({ studentId: usr.id }); created++; }
  }
  // We can't create Users for orphan studentsData without a name here; delete them safely
  for (const s of sd) {
    if (!userIds.has(s.studentId)) { await db.delete(studentsData).where(eq(studentsData.studentId, s.studentId)); orphansFixed++; }
    else if (s.groupId && !groupIds.has(s.groupId)) {
      await db.update(studentsData).set({ groupId: null }).where(eq(studentsData.studentId, s.studentId));
      groupsFixed++;
    }
  }
  return NextResponse.json({ success: true, created, orphansFixed, groupsFixed, dupRemoved: 0, message: `تم الإصلاح: أضيف ${created} سجل، ${orphansFixed} يتيم مُنظَّف، ${groupsFixed} مجموعة معطوبة` });
}
