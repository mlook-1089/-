import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireRole, errorResponse, hashPassword, ForbiddenError, createSession } from '@/lib/auth';
import { genId } from '@/lib/utils';

/**
 * إدارة حسابات المستخدمين (معلمين وأولياء أمور فقط).
 * الطلاب لهم مسار منفصل /api/students لأنهم مرتبطون بـ students_data.
 * أي عملية على حساب معلم (إنشاء/تعديل/حذف) مقصورة على المشرف (isAdmin)،
 * وإلا استطاع معلم عادي تغيير كلمة مرور المشرف والدخول بحسابه.
 */

const ID_RE = /^[\w\-.]+$/;

export async function GET() {
  try {
    await requireRole('Teacher');
    const all = await db.select().from(users);
    const sd = await db.select().from(studentsData);
    const parentChildCount: Record<string, number> = {};
    sd.forEach(s => { if (s.parentId) parentChildCount[s.parentId] = (parentChildCount[s.parentId] || 0) + 1; });
    const list = all
      .filter(u => u.role === 'Teacher' || u.role === 'Parent')
      .map(u => ({ ID: u.id, Name: u.name, Role: u.role, IsAdmin: u.isAdmin || false, ChildrenCount: parentChildCount[u.id] || 0 }));
    return NextResponse.json({ success: true, users: list });
  } catch (e: any) { return errorResponse(e); }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireRole('Teacher');
    const { name, role, password, id, isAdmin } = await req.json();
    if (!name || !password || !role) return NextResponse.json({ success: false, message: 'الاسم/الدور/كلمة المرور مطلوبة' });
    if (role !== 'Teacher' && role !== 'Parent') return NextResponse.json({ success: false, message: 'دور غير مسموح' });
    if (role === 'Teacher' && !me.isAdmin) throw new ForbiddenError('إنشاء حسابات المعلمين مقصور على المشرف');
    if (id && !ID_RE.test(String(id))) return NextResponse.json({ success: false, message: 'المعرّف يحتوي على أحرف غير مسموح بها' });
    const uid = id || genId(role === 'Teacher' ? 'T' : 'P');
    const existing = await db.select().from(users).where(eq(users.id, uid));
    if (existing.length) return NextResponse.json({ success: false, message: 'المعرّف موجود مسبقاً' });
    await db.insert(users).values({ id: uid, name, role, passwordHash: await hashPassword(String(password)), mustChangePw: true, isAdmin: role === 'Teacher' ? !!isAdmin : false });
    return NextResponse.json({ success: true, id: uid });
  } catch (e: any) { return errorResponse(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireRole('Teacher');
    const { id, upd } = await req.json();
    const u = (await db.select().from(users).where(eq(users.id, id)))[0];
    if (!u) return NextResponse.json({ success: false, message: 'المستخدم غير موجود' });
    if (u.role === 'Student') return NextResponse.json({ success: false, message: 'استخدم مسار الطلاب' });
    if (u.role === 'Teacher' && !me.isAdmin && u.id !== me.id) throw new ForbiddenError('تعديل حسابات المعلمين مقصور على المشرف');
    const patch: any = {};
    if (upd?.Name && String(upd.Name).trim()) patch.name = String(upd.Name).trim();
    if (upd?.Password && String(upd.Password).trim()) {
      patch.passwordHash = await hashPassword(String(upd.Password).trim());
      // كلمة عيّنها شخص آخر → يُطلب تغييرها عند الدخول، وتُبطَل الجلسات المفتوحة بالكلمة القديمة.
      patch.mustChangePw = u.id !== me.id;
      patch.sessionVersion = sql`${users.sessionVersion} + 1`;
    }
    if (Object.keys(patch).length) {
      const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
      // غيّر كلمته بنفسه → نصدر جلسة جديدة لهذا الجهاز حتى لا يُطرد (الأجهزة الأخرى تُبطَل)
      if (u.id === me.id && patch.passwordHash && row) await createSession(row);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireRole('Teacher');
    const { id } = await req.json();
    const u = (await db.select().from(users).where(eq(users.id, id)))[0];
    if (!u) return NextResponse.json({ success: false, message: 'غير موجود' });
    if (u.role === 'Student') return NextResponse.json({ success: false, message: 'استخدم مسار الطلاب لحذف الطلاب' });
    // حُرّاس أمان حرجة لمنع القفل الدائم:
    if (String(id) === String(me.id)) return NextResponse.json({ success: false, message: 'لا يمكنك حذف حسابك الخاص' }, { status: 400 });
    if (u.role === 'Teacher') {
      if (!me.isAdmin) throw new ForbiddenError('حذف حسابات المعلمين مقصور على المشرف');
      const teachers = (await db.select().from(users)).filter(x => x.role === 'Teacher');
      if (teachers.length <= 1) return NextResponse.json({ success: false, message: 'لا يمكن حذف آخر معلم في المنصة' }, { status: 400 });
      const admins = teachers.filter(x => x.isAdmin);
      if (u.isAdmin && admins.length <= 1) return NextResponse.json({ success: false, message: 'لا يمكن حذف آخر مشرف — عيّن مشرفاً آخر أولاً' }, { status: 400 });
    }
    // فك ارتباط الأبناء إن كان ولي أمر
    if (u.role === 'Parent') {
      await db.update(studentsData).set({ parentId: null }).where(eq(studentsData.parentId, id));
    }
    await db.delete(users).where(eq(users.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}
