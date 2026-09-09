import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, groups, studentsData, plans, pointItems, news, events, attendance, badges } from '@/db/schema';
import { requireRole } from '@/lib/auth';
import { SURAHS } from '@/lib/utils';

export async function GET() {
  try {
    await requireRole('Teacher');
    const [u, g, sd, pl, it, nw, ev, at, bd] = await Promise.all([
      db.select().from(users),
      db.select().from(groups),
      db.select().from(studentsData),
      db.select().from(plans),
      db.select().from(pointItems),
      db.select().from(news),
      db.select().from(events),
      db.select().from(attendance),
      db.select().from(badges)
    ]);
    const nameMap: Record<string,string> = {}; u.forEach(x => nameMap[x.id] = x.name);
    const studentsEnriched = sd.map(s => ({
      Student_ID: s.studentId, Parent_ID: s.parentId, Group_ID: s.groupId,
      Total_Points: s.totalPoints, Student_Phone: s.studentPhone, Parent_Phone: s.parentPhone,
      Nazem_ID: s.nazemId, _Name: nameMap[s.studentId] || '', _hasUser: !!nameMap[s.studentId]
    }));
    const mapDate = (r: any) => ({ ...r, Date: String(r.date) });
    return NextResponse.json({
      success: true,
      students: studentsEnriched,
      users: u.map(x => ({ ID: x.id, Name: x.name, Role: x.role })),
      groups: g.map(x => ({ Group_ID: x.id, Group_Name: x.name, Group_Total_Points: x.totalPoints })),
      items: it.map(x => ({ Item_ID: x.id, Description: x.description, Point_Value: x.pointValue, Trigger: x.trigger })),
      plans: pl.map(p => ({
        Plan_ID: p.id, Student_ID: p.studentId, Date: String(p.date),
        Daily_Target: p.dailyTarget, From_Surah: p.fromSurah, From_Ayah: p.fromAyah,
        To_Surah: p.toSurah, To_Ayah: p.toAyah, Amount: p.amount, Type: p.type,
        Accomplishment_Status: p.status, Source: p.source, Locked: p.locked ? 'TRUE' : '',
        Nazem_Item_Day_ID: p.nazemItemDayId, Mistakes: p.mistakes, Hearing: p.hearing,
        Repetition: p.repetition, Link: p.link
      })),
      news: nw.map(x => ({ News_ID: x.id, Title: x.title, Body: x.body, Visibility: x.visibility, Date: String(x.date) })),
      events: ev.map(x => ({ Event_ID: x.id, Title: x.title, Description: x.description, Date: String(x.date), Type: x.type })),
      attendance: at.map(x => ({ Att_ID: x.id, Student_ID: x.studentId, Date: String(x.date), Status: x.status, Note: x.note })),
      badges: bd.map(x => ({ Badge_ID: x.id, Student_ID: x.studentId, Code: x.code, Title: x.title, Icon: x.icon, Date: String(x.date) })),
      surahs: SURAHS
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: e.name === 'AuthError' ? 401 : 500 });
  }
}
