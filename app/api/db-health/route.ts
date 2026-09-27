import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData, groups } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole, AuthError } from '@/lib/auth';
import { normAr } from '@/lib/utils';

export async function GET() {
  try {
  await requireRole('Teacher');
  const [u, sd, gr] = await Promise.all([
    db.select().from(users), db.select().from(studentsData), db.select().from(groups)
  ]);
  const studentUsers = u.filter(x => x.role === 'Student');
  const sdIds = new Set(sd.map(x => x.studentId));
  const userIds = new Set(u.map(x => x.id));
  const groupIds = new Set(gr.map(x => x.id));
  const referencedParents = new Set(sd.map(x => x.parentId).filter(Boolean) as string[]);

  const usersWithoutSd = studentUsers.filter(x => !sdIds.has(x.id)).map(x => ({ id: x.id, name: x.name }));
  const sdWithoutUser = sd.filter(x => !userIds.has(x.studentId)).map(x => ({ id: x.studentId }));
  const sdInvalidGroup = sd.filter(x => x.groupId && !groupIds.has(x.groupId)).map(x => ({ id: x.studentId, group: x.groupId }));
  // أولياء أمور لا يشير إليهم أي صف في students_data (بلا أبناء).
  const parentsWithoutChildren = u.filter(x => x.role === 'Parent' && !referencedParents.has(x.id)).map(x => ({ id: x.id, name: x.name }));

  // كشف التكرارات الحقيقي: طلاب يتشاركون نفس الاسم المُطبّع (normAr)، أو نفس nazemId غير الفارغ.
  const byName: Record<string, { name: string; ids: string[] }> = {};
  for (const su of studentUsers) {
    const key = normAr(su.name || '');
    if (!key) continue;
    (byName[key] ||= { name: su.name || '—', ids: [] }).ids.push(su.id);
  }
  const byNazem: Record<string, string[]> = {};
  for (const s of sd) {
    const nz = String(s.nazemId || '').trim();
    if (!nz) continue;
    (byNazem[nz] ||= []).push(s.studentId);
  }
  // نُضيف حقل id كملخّص نصّي مقروء ليعرضه سطر الواجهة الحالي، مع الحفاظ على الشكل المطلوب {name, ids, count}.
  const duplicates = [
    ...Object.values(byName)
      .filter(g => g.ids.length > 1)
      .map(g => ({ kind: 'name', id: `اسم مكرر: ${g.name}`, name: g.name, ids: g.ids, count: g.ids.length })),
    ...Object.entries(byNazem)
      .filter(([, ids]) => ids.length > 1)
      .map(([nz, ids]) => ({ kind: 'nazem', id: `ناظم: ${nz}`, name: `ناظم: ${nz}`, ids, count: ids.length }))
  ];

  return NextResponse.json({
    success: true,
    counts: { users: u.length, studentUsers: studentUsers.length, studentsData: sd.length, groups: gr.length },
    issues: { usersWithoutSd, sdWithoutUser, sdInvalidGroup, duplicates, parentsWithoutChildren }
  });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}

export async function POST() {
  try {
  const me = await requireRole('Teacher');
  // عملية إصلاح مدمّرة (حذف سجلات يتيمة وحسابات أولياء أمور) — مقصورة على المشرف كباقي العمليات الإدارية.
  const meRow = (await db.select().from(users).where(eq(users.id, me.id)))[0];
  if (!meRow?.isAdmin) return NextResponse.json({ success: false, message: 'هذه العملية مقصورة على المشرف' }, { status: 403 });
  const [u, sd, gr] = await Promise.all([db.select().from(users), db.select().from(studentsData), db.select().from(groups)]);
  const sdIds = new Set(sd.map(x => x.studentId));
  const userIds = new Set(u.map(x => x.id));
  const groupIds = new Set(gr.map(x => x.id));
  const referencedParents = new Set(sd.map(x => x.parentId).filter(Boolean) as string[]);
  let created = 0, groupsFixed = 0;
  const deleted: string[] = [];

  for (const usr of u.filter(x => x.role === 'Student')) {
    if (!sdIds.has(usr.id)) { await db.insert(studentsData).values({ studentId: usr.id }); created++; }
  }
  // لا يمكن إنشاء مستخدم لسجل students_data يتيم (بلا اسم) هنا، فنحذفه بأمان.
  // ملاحظة: لا نحذف التكرارات تلقائياً — تُعرض فقط في الفحص (GET).
  for (const s of sd) {
    if (!userIds.has(s.studentId)) {
      await db.delete(studentsData).where(eq(studentsData.studentId, s.studentId));
      deleted.push(s.studentId);
    } else if (s.groupId && !groupIds.has(s.groupId)) {
      await db.update(studentsData).set({ groupId: null }).where(eq(studentsData.studentId, s.studentId));
      groupsFixed++;
    }
  }
  // حذف أولياء الأمور بلا أبناء المُنشأين تلقائياً فقط (اسمهم يبدأ بـ 'ولي أمر '). لا نلمس اليدويين.
  let orphanParentsRemoved = 0;
  for (const p of u.filter(x => x.role === 'Parent' && !referencedParents.has(x.id))) {
    if ((p.name || '').startsWith('ولي أمر ')) {
      await db.delete(users).where(eq(users.id, p.id));
      orphanParentsRemoved++;
    }
  }
  return NextResponse.json({
    success: true,
    created, groupsFixed, deleted,
    orphansFixed: deleted.length, dupRemoved: 0, orphanParentsRemoved,
    message: `تم الإصلاح: أضيف ${created} سجل، حُذف ${deleted.length} سجل يتيم لا يملك حساب مستخدم، نُظّفت ${groupsFixed} مجموعة معطوبة، حُذف ${orphanParentsRemoved} ولي أمر تلقائي بلا أبناء (لم تُحذف أي تكرارات تلقائياً)`
  });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
