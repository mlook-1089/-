import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { newsComments, users, pointLogs, pointItems, studentsData } from '@/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { requireSession, requireRole, AuthError, errorResponse } from '@/lib/auth';
import { genId, today } from '@/lib/utils';
import { addToStudent, recomputeGroups } from '@/lib/triggers';
import { tryAwardBadges } from '@/lib/badges';

export async function GET(req: NextRequest) {
  try {
    const s = await requireSession();
    const newsId = req.nextUrl.searchParams.get('id');
    if (!newsId) return NextResponse.json({ success: false, message: 'id مطلوب' }, { status: 400 });
    const all = await db.select().from(newsComments).where(eq(newsComments.newsId, newsId)).orderBy(asc(newsComments.date));
    // المعلم يرى كل التعليقات؛ الطالب/ولي الأمر يرى تعليقاته فقط
    const rows = s.role === 'Teacher' ? all : all.filter(c => c.userId === s.id);
    // نقاط كل تعليق = مجموع قيم سجلات النقاط المرتبطة به (ref = comment:<id>)
    const refs = rows.map(c => 'comment:' + c.id);
    const logs = refs.length ? await db.select().from(pointLogs).where(inArray(pointLogs.ref, refs)) : [];
    const points: Record<string, number> = {};
    for (const l of logs) points[l.ref || ''] = (points[l.ref || ''] || 0) + (Number(l.pointValue) || 0);
    return NextResponse.json({
      success: true,
      comments: rows.map(c => ({
        id: c.id, newsId: c.newsId, userId: c.userId, userName: c.userName, body: c.body, date: c.date,
        points: points['comment:' + c.id] || 0
      }))
    });
  } catch (e: any) { return errorResponse(e); }
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const { newsId, body } = await req.json();
    if (!newsId || !body?.trim()) return NextResponse.json({ success: false, message: 'بيانات ناقصة' }, { status: 400 });
    const userRow = await db.select({ name: users.name }).from(users).where(eq(users.id, s.id));
    const userName = userRow[0]?.name || s.id;
    const id = genId('C');
    await db.insert(newsComments).values({ id, newsId, userId: s.id, userName, body: body.trim() });
    return NextResponse.json({ success: true, comment: { id, newsId, userId: s.id, userName, body: body.trim(), date: new Date() } });
  } catch (e: any) { return errorResponse(e); }
}

/**
 * منح نقاط لمشاركة (تعليق طالب) — للمعلم فقط.
 * المنح يستبدل أي منح سابق لنفس التعليق: نسحب القديم ثم نرصد الجديد.
 * ref = comment:<commentId> يربط المنح بالتعليق (القيد الفريد ref,item_id → نحذف ثم ندرج).
 */
export async function PATCH(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { commentId, points } = await req.json();
    if (!Number.isInteger(points) || points < -100 || points > 100)
      return NextResponse.json({ success: false, message: 'النقاط يجب أن تكون عدداً صحيحاً بين -100 و 100' }, { status: 400 });
    const comment = commentId
      ? (await db.select().from(newsComments).where(eq(newsComments.id, String(commentId))))[0]
      : undefined;
    if (!comment) return NextResponse.json({ success: false, message: 'التعليق غير موجود' }, { status: 404 });

    const studentId = comment.userId;
    const ref = 'comment:' + comment.id;
    // بند النقاط النظامي للمشاركة — يُنشأ مرة واحدة
    await db.insert(pointItems)
      .values({ id: 'ITEM_SHARE', description: 'مشاركة', pointValue: 0, trigger: 'share' })
      .onConflictDoNothing();

    const sd = (await db.select().from(studentsData).where(eq(studentsData.studentId, studentId)))[0];

    // سحب المنح السابق لهذا التعليق (إن وُجد) ثم حذف سجلاته
    const prev = await db.select().from(pointLogs).where(eq(pointLogs.ref, ref));
    const prevSum = prev.reduce((acc, l) => acc + (Number(l.pointValue) || 0), 0);
    if (prev.length) await db.delete(pointLogs).where(eq(pointLogs.ref, ref));

    // رصد المنح الجديد (لا سجل إن كانت القيمة صفراً)
    if (points !== 0) {
      await db.insert(pointLogs).values({
        id: genId('L'), studentId, itemId: 'ITEM_SHARE', teacherId: teacher.id,
        pointValue: points, ref, date: today()
      });
    }

    // تعديل مجموع الطالب بصافي الفرق ثم إعادة حساب المجموعة ومنح الشارات
    const delta = (points !== 0 ? points : 0) - prevSum;
    const after = delta ? await addToStudent(studentId, delta) : null;
    await recomputeGroups([after?.groupId ?? sd?.groupId]);
    await tryAwardBadges(studentId);

    const newTotal = Number(after?.totalPoints ?? sd?.totalPoints ?? 0) || 0;
    return NextResponse.json({ success: true, points, newTotal });
  } catch (e: any) { return errorResponse(e); }
}
