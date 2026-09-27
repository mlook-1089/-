import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pointLogs, users, pointItems } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';

/* سجل العمليات: آخر ~200 عملية نقاط، الأحدث أولاً، مع ربط الأسماء والبنود */
export async function GET(_req: NextRequest) {
  try {
    await requireRole('Teacher');
    const rows = await db.select().from(pointLogs).orderBy(desc(pointLogs.createdAt)).limit(200);
    const [u, it] = await Promise.all([
      db.select().from(users),
      db.select().from(pointItems)
    ]);
    const nameMap: Record<string, string> = {}; u.forEach(x => nameMap[x.id] = x.name);
    const itemMap: Record<string, any> = {}; it.forEach(x => itemMap[x.id] = x);
    const logs = rows.map(l => {
      const tId = l.teacherId || '';
      const teacherName = (!tId || tId === 'AUTO') ? 'تلقائي/نظام' : (nameMap[tId] || 'تلقائي/نظام');
      const item = itemMap[l.itemId];
      return {
        date: String(l.date),
        studentName: nameMap[l.studentId] || '-',
        teacherName,
        itemDesc: item?.description || '-',
        points: (l.pointValue ?? item?.pointValue ?? 0)
      };
    });
    return NextResponse.json({ success: true, logs });
  } catch (e: any) { return errorResponse(e); }
}
