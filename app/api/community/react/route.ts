import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { communityMessages, communityReactions, studentsData, groups } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireSession, ForbiddenError, errorResponse } from '@/lib/auth';

/** POST /api/community/react { messageId: string, emoji?: 'heart' }
 *  نقرة تضيف، نقرة ثانية تُلغي (toggle).
 *  يجب أن يكون المستخدم عضواً في مجموعة الرسالة.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { messageId, emoji: rawEmoji } = await req.json();
    const emoji = String(rawEmoji || 'heart');
    if (!messageId) return NextResponse.json({ success: false, message: 'messageId مطلوب' }, { status: 400 });

    const msg = (await db.select().from(communityMessages).where(eq(communityMessages.id, messageId)))[0];
    if (!msg) return NextResponse.json({ success: false, message: 'الرسالة غير موجودة' }, { status: 404 });
    if (msg.deletedAt) return NextResponse.json({ success: false, message: 'الرسالة محذوفة' }, { status: 400 });

    // تحقّق أن المستخدم ينتمي لمجموعة الرسالة (المعلم مُستثنى)
    if (session.role === 'Student') {
      const sd = (await db.select({ groupId: studentsData.groupId }).from(studentsData).where(eq(studentsData.studentId, session.id)))[0];
      if (!sd?.groupId || String(sd.groupId) !== String(msg.groupId)) {
        throw new ForbiddenError('لست في مجموعة هذه الرسالة');
      }
    } else if (session.role !== 'Teacher') {
      throw new ForbiddenError('مقصور على الطلاب والمعلمين');
    }

    // Toggle: فحص وجود السجل أولاً
    const existing = await db.select().from(communityReactions).where(and(
      eq(communityReactions.messageId, messageId),
      eq(communityReactions.userId, session.id),
      eq(communityReactions.emoji, emoji)
    ));

    if (existing.length) {
      await db.delete(communityReactions).where(and(
        eq(communityReactions.messageId, messageId),
        eq(communityReactions.userId, session.id),
        eq(communityReactions.emoji, emoji)
      ));
      return NextResponse.json({ success: true, action: 'removed' });
    } else {
      await db.insert(communityReactions).values({ messageId, userId: session.id, emoji });
      return NextResponse.json({ success: true, action: 'added' });
    }
  } catch (e: any) { return errorResponse(e); }
}
