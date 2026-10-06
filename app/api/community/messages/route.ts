import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { communityMessages, communityReactions, users, studentsData, groups } from '@/db/schema';
import { and, eq, desc, gt, sql, inArray } from 'drizzle-orm';
import { requireSession, requireRole, ForbiddenError, errorResponse } from '@/lib/auth';
import { genId } from '@/lib/utils';
import { notifyUsers } from '@/lib/push';

/**
 * محادثة المجموعة.
 *
 * الصلاحيات:
 *  - طالب: يرى/ينشر في مجموعته فقط
 *  - معلم/مشرف: يرى/ينشر في أي مجموعة (عبر ?groupId=)
 *  - ولي أمر: لا وصول
 *
 * حدود:
 *  - 500 حرف لكل رسالة
 *  - 10 رسائل/ساعة لكل طالب (المعلم بلا حد)
 */

const MAX_BODY = 500;
const RATE_LIMIT_PER_HOUR = 10;

/** يرجع groupId المسموح به للمستخدم الحالي، أو يرمي ForbiddenError. */
async function resolveGroupId(session: { id: string; role: string }, requestedGroupId: string | null | undefined): Promise<string> {
  if (session.role === 'Teacher') {
    if (!requestedGroupId) throw new ForbiddenError('groupId مطلوب للمعلم');
    // تحقّق أن المجموعة موجودة
    const g = (await db.select({ id: groups.id }).from(groups).where(eq(groups.id, requestedGroupId)))[0];
    if (!g) throw new ForbiddenError('المجموعة غير موجودة');
    return requestedGroupId;
  }
  if (session.role === 'Student') {
    const sd = (await db.select({ groupId: studentsData.groupId }).from(studentsData).where(eq(studentsData.studentId, session.id)))[0];
    if (!sd?.groupId) throw new ForbiddenError('لست عضواً في أي مجموعة');
    // منع الطالب من محاولة قراءة مجموعة أخرى بتمرير groupId مختلف
    if (requestedGroupId && String(requestedGroupId) !== String(sd.groupId))
      throw new ForbiddenError('لا تستطيع رؤية مجموعات أخرى');
    return sd.groupId;
  }
  throw new ForbiddenError('مقصور على الطلاب والمعلمين');
}

/** GET /api/community/messages?groupId=X&since=ISO */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const u = new URL(req.url);
    const requestedGroupId = u.searchParams.get('groupId');
    const sinceParam = u.searchParams.get('since') || '';
    const groupId = await resolveGroupId(session, requestedGroupId);

    const conds = [eq(communityMessages.groupId, groupId)];
    if (sinceParam) {
      const d = new Date(sinceParam);
      if (!isNaN(+d)) conds.push(gt(communityMessages.createdAt, d));
    }

    // آخر 200 رسالة (المرحلة ١ بلا pagination كامل)
    const rows = await db.select().from(communityMessages).where(and(...conds)).orderBy(desc(communityMessages.createdAt)).limit(200);
    const authorIds = Array.from(new Set(rows.map(r => r.authorId)));
    const authors = authorIds.length
      ? await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(inArray(users.id, authorIds))
      : [];
    const authorMap: Record<string, { name: string; role: string }> = {};
    authors.forEach(a => { authorMap[a.id] = { name: a.name, role: a.role }; });

    // تفاعلات لكل رسالة
    const msgIds = rows.map(r => r.id);
    const reactions = msgIds.length
      ? await db.select().from(communityReactions).where(inArray(communityReactions.messageId, msgIds))
      : [];
    const reactionMap: Record<string, { count: number; mine: boolean }> = {};
    reactions.forEach(r => {
      const key = r.messageId + ':' + r.emoji;
      if (!reactionMap[key]) reactionMap[key] = { count: 0, mine: false };
      reactionMap[key].count++;
      if (r.userId === session.id) reactionMap[key].mine = true;
    });

    const messages = rows.map(r => ({
      id: r.id,
      groupId: r.groupId,
      authorId: r.authorId,
      authorName: authorMap[r.authorId]?.name || '',
      authorRole: authorMap[r.authorId]?.role || '',
      body: r.deletedAt ? '' : r.body,
      deleted: !!r.deletedAt,
      createdAt: r.createdAt?.toISOString?.() || String(r.createdAt),
      hearts: reactionMap[r.id + ':heart']?.count || 0,
      iHearted: !!reactionMap[r.id + ':heart']?.mine
    })).reverse(); // قديم → جديد (الواجهة تلحق الجديد في الأسفل)

    return NextResponse.json({ success: true, groupId, messages });
  } catch (e: any) { return errorResponse(e); }
}

/** POST /api/community/messages { body: string, groupId?: string } */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { body: rawBody, groupId: requestedGroupId } = await req.json();
    const text = String(rawBody || '').trim();
    if (!text) return NextResponse.json({ success: false, message: 'الرسالة فارغة' }, { status: 400 });
    if (text.length > MAX_BODY) return NextResponse.json({ success: false, message: `الرسالة أطول من ${MAX_BODY} حرفاً` }, { status: 400 });

    const groupId = await resolveGroupId(session, requestedGroupId);

    // حد المعدل للطلاب فقط
    if (session.role === 'Student') {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await db
        .select({ c: sql<number>`count(*)` })
        .from(communityMessages)
        .where(and(
          eq(communityMessages.authorId, session.id),
          gt(communityMessages.createdAt, oneHourAgo)
        ));
      const count = Number(recent[0]?.c || 0);
      if (count >= RATE_LIMIT_PER_HOUR) {
        return NextResponse.json({ success: false, message: `بلغت الحد المسموح (${RATE_LIMIT_PER_HOUR} رسائل/ساعة). حاول لاحقاً.` }, { status: 429 });
      }
    }

    const id = genId('CM');
    const now = new Date();
    await db.insert(communityMessages).values({ id, groupId, authorId: session.id, body: text, createdAt: now });

    // Push: إذا نشر معلم → أعلم طلاب المجموعة. طالب → لا push (منع إزعاج).
    if (session.role === 'Teacher') {
      try {
        const members = await db
          .select({ id: studentsData.studentId })
          .from(studentsData)
          .where(eq(studentsData.groupId, groupId));
        const memberIds = members.map(m => m.id).filter(x => x !== session.id);
        const preview = text.length > 70 ? text.slice(0, 70) + '…' : text;
        await notifyUsers(memberIds, {
          title: 'رسالة من المعلم',
          body: preview,
          url: '/#community',
          tag: 'community-' + groupId
        }, 'other');
      } catch { /* فشل push لا يعطل النشر */ }
    }

    return NextResponse.json({
      success: true,
      message: { id, groupId, authorId: session.id, body: text, createdAt: now.toISOString(), hearts: 0, iHearted: false }
    });
  } catch (e: any) { return errorResponse(e); }
}

/** DELETE /api/community/messages { id: string }
 *  صاحب الرسالة أو معلم/مشرف يستطيع الحذف (soft).
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: 'id مطلوب' }, { status: 400 });

    const row = (await db.select().from(communityMessages).where(eq(communityMessages.id, id)))[0];
    if (!row) return NextResponse.json({ success: false, message: 'الرسالة غير موجودة' }, { status: 404 });
    if (row.deletedAt) return NextResponse.json({ success: true }); // محذوفة أصلاً

    const isAuthor = String(row.authorId) === String(session.id);
    const isStaff = session.role === 'Teacher';
    if (!isAuthor && !isStaff) throw new ForbiddenError('لا تستطيع حذف رسائل الآخرين');

    await db.update(communityMessages)
      .set({ deletedAt: new Date(), deletedBy: session.id })
      .where(eq(communityMessages.id, id));

    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}
