import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, plans, studentsData, attendance } from '@/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { requireRole, hashPassword } from '@/lib/auth';
import { nzFollowUp } from '@/lib/nazem';
import { genId, buildPlanTarget, normAr, today } from '@/lib/utils';

function statusFromAtt(a: any): string | null {
  const n = Number(a); if (!isFinite(n)) return null;
  if (n === 2) return 'Present'; if (n === 1) return 'Late'; if (n === 0) return 'Absent'; return null;
}

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

    let synced = 0, locked = 0, created = 0;
    const unmatched: any[] = [];

    for (const st of students) {
      const nsid = st.student_id || st.id;
      let localId = (nsid && nazemToId[String(nsid)]) || nameToId[normAr(st.student_name || '')];
      if (!localId && autoCreate && st.student_name) {
        const nid = genId('U');
        const pw = String(nsid || Math.floor(Math.random() * 9000 + 1000));
        await db.insert(users).values({ id: nid, name: st.student_name, role: 'Student', passwordHash: await hashPassword(pw) });
        await db.insert(studentsData).values({ studentId: nid, nazemId: String(nsid || '') });
        localId = nid;
        created++;
        nazemToId[String(nsid || '')] = nid;
        nameToId[normAr(st.student_name)] = nid;
      }
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
          type: it.type === 'revision' ? 'revision' : 'conserve'
        };
        rec.dailyTarget = buildPlanTarget({ fromSurah: rec.fromSurah, fromAyah: rec.fromAyah, toSurah: rec.toSurah, toAyah: rec.toAyah, amount: rec.amount }) || 'مراجعة وتسميع';
        let status = 'Pending';
        if (td.status === 'completed') status = 'Done';
        else if (td.status === 'partial') status = 'Partial';
        else if (it.is_blocked_by_late) status = 'Missed';

        const existing = (await db.select().from(plans).where(
          or(
            eq(plans.nazemItemDayId, String(td.id || 'x')),
            and(eq(plans.studentId, localId), eq(plans.date, date))
          )
        ))[0];

        if (existing) {
          if (existing.locked) { locked++; continue; }
          await db.update(plans).set({ ...rec, status, source: 'Nazem' }).where(eq(plans.id, existing.id));
        } else {
          await db.insert(plans).values({ id: genId('P'), studentId: localId, date, ...rec, status, source: 'Nazem', locked: false });
        }
        synced++;
      }

      const aSt = statusFromAtt(st.attendance_status);
      if (aSt) {
        const ex = (await db.select().from(attendance).where(and(eq(attendance.studentId, localId), eq(attendance.date, date))))[0];
        if (ex) await db.update(attendance).set({ status: aSt, note: 'ناظم' }).where(eq(attendance.id, ex.id));
        else await db.insert(attendance).values({ id: genId('A'), studentId: localId, date, status: aSt, note: 'ناظم' });
      }
    }

    return NextResponse.json({
      success: true, synced, locked, created, unmatched,
      message: `تمت مزامنة ${synced} خطة${locked?` · ${locked} محمية`:''}${created?` · ${created} طالب جديد`:''}${unmatched.length?` · ${unmatched.length} بدون تطابق`:''}`
    });
  } catch (e: any) { return NextResponse.json({ success: false, message: e?.message }); }
}
