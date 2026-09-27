import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, plans, studentsData, attendance } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { nzFollowUp } from '@/lib/nazem';
import { genId, buildPlanTarget, normAr } from '@/lib/utils';
import { applyPlanStatus, applyAttendanceStatus } from '@/lib/triggers';
import { createStudents, CreatedStudent } from '@/lib/accounts';

function statusFromAtt(a: any): string | null {
  const n = Number(a); if (!isFinite(n)) return null;
  if (n === 2) return 'Present'; if (n === 1) return 'Late'; if (n === 0) return 'Absent'; return null;
}

// تطبيع نوع مسار البند القادم من ناظم إلى القيمتين المعتمدتين: conserve | revision.
// أُلغي مسار «الإتقان» من الخلفية: أي بند إتقان قادم من ناظم يُحفظ باعتباره حفظاً
// (conserve) حتى لا يضيع، والقيم غير المعروفة تعود بأمان إلى 'conserve' (لا نخترع
// بيانات). ندعم كذلك مسميات عربية محتملة كشبكة أمان.
function mapNazemType(it: any): 'conserve' | 'revision' {
  const raw = String(it?.type ?? '').toLowerCase().trim();
  if (raw === 'revision' || raw === 'conserve') return raw as any;
  if (raw.includes('مراجع')) return 'revision';
  if (raw.includes('حفظ') || raw.includes('تحفيظ')) return 'conserve';
  return 'conserve';
}

// المزامنة الأولى قد تمنح نقاطاً لعشرات الأوراد — نرفع المهلة إلى الحد الأقصى المتاح
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const teacher = await requireRole('Teacher');
    const { planId, date, autoCreate } = await req.json();
    const data = await nzFollowUp(planId, date);
    const students = data.students || [];

    const allUsers = await db.select().from(users);
    const allSd = await db.select().from(studentsData);
    const nameToId: Record<string,string> = {};
    allUsers.forEach(u => { if (u.role === 'Student') nameToId[normAr(u.name)] = u.id; });
    const nazemToId: Record<string,string> = {};
    allSd.forEach(s => { if (s.nazemId) nazemToId[String(s.nazemId)] = s.studentId; });

    let synced = 0, locked = 0;
    const unmatched: any[] = [];
    let newAccounts: CreatedStudent[] = [];

    // إنشاء حسابات الطلاب غير المرتبطين دفعة واحدة (بكلمات مؤقتة عشوائية تُعاد للمعلم)
    if (autoCreate) {
      const missing = students.filter((st: any) => {
        const nsid = st.student_id || st.id;
        return st.student_name && !((nsid && nazemToId[String(nsid)]) || nameToId[normAr(st.student_name)]);
      });
      if (missing.length) {
        const r = await createStudents(missing.map((st: any) => ({ name: st.student_name, nazemId: String(st.student_id || st.id || '') })), { autoParent: true });
        newAccounts = r.created;
        for (const c of r.created) { if (c.nazemId) nazemToId[c.nazemId] = c.id; nameToId[normAr(c.name)] = c.id; }
      }
    }

    for (const st of students) {
      const nsid = st.student_id || st.id;
      const localId = (nsid && nazemToId[String(nsid)]) || nameToId[normAr(st.student_name || '')];
      if (!localId) { unmatched.push({ nazem_id: nsid, name: st.student_name }); continue; }

      for (const it of (st.items || [])) {
        const td = it.today; if (!td) continue;
        const rec: any = {
          fromSurah: it.surah_from_name || '', fromAyah: it.verse_from || '',
          toSurah: it.surah_to_name || '', toAyah: it.verse_to || '',
          amount: (td.amount != null ? String(td.amount) : ''),
          nazemItemDayId: String(td.id || ''),
          mistakes: td.mistake != null ? Number(td.mistake) : null,
          hearing: td.hearing != null ? Number(td.hearing) : null,
          repetition: td.repetition != null ? Number(td.repetition) : null,
          link: td.link != null ? Number(td.link) : null,
          type: mapNazemType(it)
        };
        rec.dailyTarget = buildPlanTarget({ fromSurah: rec.fromSurah, fromAyah: rec.fromAyah, toSurah: rec.toSurah, toAyah: rec.toAyah, amount: rec.amount }) || 'مراجعة وتسميع';
        let status = 'Pending';
        if (td.status === 'completed') status = 'Done';
        else if (td.status === 'partial') status = 'Partial';
        else if (it.is_blocked_by_late) status = 'Missed';

        // مطابقة الخطة القائمة: نعتمد معرّف البند اليومي من ناظم حصراً متى توفّر،
        // لأن المطابقة بالطالب+التاريخ وحدها تدهس بنداً آخر لنفس اليوم
        // (حفظ + مراجعة) فيختفي بند أو أكثر. عند غياب المعرّف (نادر)
        // نعود للمطابقة بالطالب+التاريخ مقيّدة بالنوع حتى لا نمسّ نوعاً مختلفاً.
        const tdId = (td.id != null && String(td.id).trim() !== '') ? String(td.id) : '';
        const existing = (await db.select().from(plans).where(
          tdId
            ? eq(plans.nazemItemDayId, tdId)
            : and(eq(plans.studentId, localId), eq(plans.date, date), eq(plans.type, rec.type))
        ))[0];

        let planId: string;
        if (existing) {
          if (existing.locked) { locked++; continue; }
          planId = existing.id;
          await db.update(plans).set({ ...rec, status, source: 'Nazem' }).where(eq(plans.id, planId));
        } else {
          planId = genId('P');
          await db.insert(plans).values({ id: planId, studentId: localId, date, ...rec, status, source: 'Nazem', locked: false });
        }
        // نفس نقاط الرصد اليدوي عند الإكمال/الإنجاز الجزئي (وتُسحب إن تراجعت الحالة في ناظم)
        await applyPlanStatus({ id: planId, studentId: localId, type: rec.type }, existing?.status, status, teacher.id);
        synced++;
      }

      const aSt = statusFromAtt(st.attendance_status);
      if (aSt) {
        const ex = (await db.select().from(attendance).where(and(eq(attendance.studentId, localId), eq(attendance.date, date))))[0];
        let attId = ex?.id;
        if (ex) await db.update(attendance).set({ status: aSt, note: 'ناظم' }).where(eq(attendance.id, ex.id));
        else {
          const ins = await db.insert(attendance).values({ id: genId('A'), studentId: localId, date, status: aSt, note: 'ناظم' }).onConflictDoNothing().returning({ id: attendance.id });
          attId = ins[0]?.id; // لم يُدرج (سبقه طلب آخر) → لا نمنح نقاطاً لصف غير موجود
        }
        if (attId) await applyAttendanceStatus(attId, localId, ex?.status, aSt, teacher.id);
      }
    }

    return NextResponse.json({
      success: true, synced, locked, created: newAccounts.length, newAccounts, unmatched,
      message: `تمت مزامنة ${synced} خطة${locked?` · ${locked} محمية`:''}${newAccounts.length?` · ${newAccounts.length} طالب جديد`:''}${unmatched.length?` · ${unmatched.length} بدون تطابق`:''}`
    });
  } catch (e: any) { return errorResponse(e); }
}
