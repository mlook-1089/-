import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taahudPeriods, taahudAssignments, taahudRecords, settings, studentsData, users } from '@/db/schema';
import { eq, inArray, desc, and } from 'drizzle-orm';
import { requireSession, errorResponse } from '@/lib/auth';

/**
 * جلب كامل لبيانات تعاهد. يختلف المحتوى حسب الدور:
 *  - Teacher: جميع الفترات + إسنادات وسجلات لكل الطلاب في الفترة المطلوبة (أو النشطة).
 *  - Student: فقط إسناداته وسجلاته.
 *  - Parent: إسنادات وسجلات أبنائه.
 * query: ?periodId=... (اختياري؛ الافتراضي: النشطة)
 */
export async function GET(req: NextRequest) {
  try {
    const s = await requireSession();
    const periodId = new URL(req.url).searchParams.get('periodId') || '';

    // الفترات + الإعدادات (مشترك للجميع)
    const [periods, cfgRows] = await Promise.all([
      db.select().from(taahudPeriods).orderBy(desc(taahudPeriods.createdAt)),
      db.select().from(settings).where(inArray(settings.key, ['taahud_total_per_hizb', 'taahud_deduct_per_mistake', 'taahud_deduct_per_warning']))
    ]);
    const cfg: Record<string, string> = {};
    cfgRows.forEach(r => { cfg[r.key] = r.value || ''; });
    const config = {
      totalPerHizb: Number(cfg.taahud_total_per_hizb || 100),
      deductPerMistake: Number(cfg.taahud_deduct_per_mistake || 2),
      deductPerWarning: Number(cfg.taahud_deduct_per_warning || 1)
    };

    const active = periods.find(p => p.status === 'active');
    const targetPeriodId = periodId || (active ? active.id : '');

    // أي طلاب تخص هذا المستخدم؟
    let allowedStudentIds: string[] = [];
    const isTeacher = s.role === 'Teacher';
    if (isTeacher) {
      // جميع الطلاب
      const rows = await db.select({ id: studentsData.studentId }).from(studentsData);
      allowedStudentIds = rows.map(r => r.id);
    } else if (s.role === 'Student') {
      allowedStudentIds = [s.id];
    } else if (s.role === 'Parent') {
      const rows = await db.select({ id: studentsData.studentId }).from(studentsData).where(eq(studentsData.parentId, s.id));
      allowedStudentIds = rows.map(r => r.id);
    }

    // جلب أسماء الطلاب
    const nameMap: Record<string, string> = {};
    if (allowedStudentIds.length) {
      const urows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, allowedStudentIds));
      urows.forEach(u => { nameMap[u.id] = u.name; });
    }

    // الإسنادات والسجلات للفترة المطلوبة ولطلاب مسموحين
    let assignments: any[] = [];
    let records: any[] = [];
    if (targetPeriodId && allowedStudentIds.length) {
      assignments = await db.select().from(taahudAssignments).where(and(
        eq(taahudAssignments.periodId, targetPeriodId),
        inArray(taahudAssignments.studentId, allowedStudentIds)
      ));
      if (assignments.length) {
        const assignIds = assignments.map(a => a.id);
        records = await db.select().from(taahudRecords).where(inArray(taahudRecords.assignmentId, assignIds));
      }
    }

    return NextResponse.json({
      success: true,
      role: s.role,
      config,
      periods: periods.map(p => ({
        id: p.id, name: p.name, startDate: p.startDate ? String(p.startDate) : '',
        endDate: p.endDate ? String(p.endDate) : '', status: p.status,
        createdAt: p.createdAt
      })),
      activePeriodId: active ? active.id : '',
      currentPeriodId: targetPeriodId,
      students: allowedStudentIds.map(id => ({ id, name: nameMap[id] || id })),
      assignments: assignments.map(a => ({
        id: a.id, periodId: a.periodId, studentId: a.studentId, hizbNumber: a.hizbNumber
      })),
      records: records.map(r => ({
        id: r.id, assignmentId: r.assignmentId, teacherId: r.teacherId,
        mistakes: r.mistakes, warnings: r.warnings,
        totalPoints: r.totalPoints, deductPerMistake: r.deductPerMistake,
        deductPerWarning: r.deductPerWarning, score: r.score,
        recordedAt: r.recordedAt
      }))
    });
  } catch (e: any) { return errorResponse(e); }
}
