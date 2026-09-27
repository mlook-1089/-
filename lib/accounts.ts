import crypto from 'node:crypto';
import { db } from './db';
import { users, studentsData, groups } from '@/db/schema';
import { hashTempPassword } from './auth';
import { genId, normAr } from './utils';
import { recomputeGroups } from './triggers';

export type NewStudentRow = {
  name: string; password?: string; groupId?: string | null;
  studentPhone?: string; parentPhone?: string; nazemId?: string;
};
export type CreatedStudent = {
  name: string; id: string; password: string; nazemId?: string;
  parentId?: string; parentName?: string; parentPassword?: string;
};

/** كلمة مرور مؤقتة من ٦ أرقام (بدل 1234 الثابتة التي يسهل تخمينها). */
export function randomPin() { return String(crypto.randomInt(100000, 1000000)); }

/**
 * إنشاء حسابات طلاب (ومعهم أولياء أمور اختيارياً) دفعة واحدة:
 * - يتخطّى الأسماء المكررة (مع الموجودين وداخل الدفعة) ومعرّفات ناظم المرتبطة مسبقاً.
 * - كل الحسابات بكلمة مؤقتة ويُجبر أصحابها على تغييرها.
 * - الإدخال في معاملة واحدة، والتجزئة مرة لكل كلمة مرور مميّزة.
 */
export async function createStudents(rows: NewStudentRow[], opts: { autoParent?: boolean; defaultPassword?: string } = {}) {
  const [allUsers, allSd, allGroups] = await Promise.all([
    db.select({ id: users.id, name: users.name, role: users.role }).from(users),
    db.select({ nazemId: studentsData.nazemId }).from(studentsData),
    db.select({ id: groups.id }).from(groups)
  ]);
  const groupIds = new Set(allGroups.map(g => g.id));
  const names = new Set(allUsers.filter(u => u.role === 'Student').map(u => normAr(u.name || '')));
  const linkedNazem = new Set(allSd.map(s => String(s.nazemId || '').trim()).filter(Boolean));
  const hashCache = new Map<string, string>();
  const hash = async (pw: string) => {
    if (!hashCache.has(pw)) hashCache.set(pw, await hashTempPassword(pw));
    return hashCache.get(pw)!;
  };

  const created: CreatedStudent[] = [];
  const errors: { name: string; message: string; nazemId?: string }[] = [];
  const userRows: any[] = [];
  const sdRows: any[] = [];
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    const nz = String(r.nazemId || '').trim();
    if (nz && linkedNazem.has(nz)) { errors.push({ name, nazemId: nz, message: 'مرتبط بحساب مسبقاً' }); continue; }
    const key = normAr(name);
    if (names.has(key)) { errors.push({ name, nazemId: nz, message: 'يوجد طالب بنفس الاسم — استخدم «ربط» بدلاً من الإنشاء' }); continue; }
    names.add(key);
    if (nz) linkedNazem.add(nz);

    const id = genId('U');
    const password = String(r.password || opts.defaultPassword || randomPin());
    userRows.push({ id, name, role: 'Student', passwordHash: await hash(password), mustChangePw: true });
    const rec: CreatedStudent = { name, id, password, nazemId: nz || undefined };
    let parentId: string | null = null;
    if (opts.autoParent !== false) {
      parentId = genId('P');
      const parentPassword = String(opts.defaultPassword || randomPin());
      const parentName = 'ولي أمر ' + name;
      userRows.push({ id: parentId, name: parentName, role: 'Parent', passwordHash: await hash(parentPassword), mustChangePw: true });
      Object.assign(rec, { parentId, parentName, parentPassword });
    }
    sdRows.push({
      studentId: id, parentId, groupId: (r.groupId && groupIds.has(r.groupId)) ? r.groupId : null,
      studentPhone: r.studentPhone || '', parentPhone: r.parentPhone || '', nazemId: nz
    });
    created.push(rec);
  }

  // على دفعات حتى لا يكبر الطلب الواحد؛ كل دفعة معاملة مستقلة (المستخدمون ثم بياناتهم).
  // دفعة فاشلة لا تُسقط الطلب: نعيد ما أُنشئ فعلاً (بكلماته المؤقتة) ونُبلغ عن الباقي.
  const CHUNK = 100;
  const saved: CreatedStudent[] = [];
  for (let i = 0; i < sdRows.length; i += CHUNK) {
    const sdPart = sdRows.slice(i, i + CHUNK);
    const ids = new Set(sdPart.flatMap(s => [s.studentId, s.parentId].filter(Boolean)));
    const part = created.slice(i, i + CHUNK);
    try {
      await db.batch([
        db.insert(users).values(userRows.filter(u => ids.has(u.id))),
        db.insert(studentsData).values(sdPart)
      ] as any);
      saved.push(...part);
    } catch (e: any) {
      for (const c of part) errors.push({ name: c.name, nazemId: c.nazemId, message: 'تعذّر الحفظ: ' + (e?.message || 'خطأ') });
    }
  }
  await recomputeGroups(sdRows.filter(s => saved.some(c => c.id === s.studentId)).map(s => s.groupId));
  return { created: saved, errors };
}
