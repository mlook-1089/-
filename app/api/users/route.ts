import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, studentsData } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole, AuthError, hashPassword } from '@/lib/auth';
import { genId } from '@/lib/utils';

/**
 * إدارة حسابات المستخدمين (معلمين وأولياء أمور فقط).
 * الطلاب لهم مسار منفصل /api/students لأنهم مرتبطون بـ students_data.
 * إدارة حسابات المعلمين (إنشاء/حذف/رفع صلاحية) مقصورة على المشرف (isAdmin).
 */

function fail(e: any) {
  if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
  return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
}

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
  } catch (e: any) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireRole('Teacher');
    const { name, role, password, id, isAdmin } = await req.json();
    if (!name || !password || !role) return NextResponse.json({ success: false, message: 'الاسم/الدور/كلمة المرور مطلوبة' });
    if (role !== 'Teacher' && role !== 'Parent') return NextResponse.json({ success: false, message: 'دور غير مسموح' });
    // إنشاء حساب معلم يتطلب صلاحية مشرف
    if (role === 'Teacher') {
      const meRow = (await db.select().from(users).where(eq(users.id, me.id)))[0];
      if (!meRow?.isAdmin) return NextResponse.json({ success: false, message: 'إنشاء حسابات المعلمين مقصور على المشرف' }, { status: 403 });
    }
    const uid = id || genId(role === 'Teacher' ? 'T' : 'P');
    const existing = await db.select().from(users).where(eq(users.id, uid));
    if (existing.length) return NextResponse.json({ success: false, message: 'المعرّف موجود مسبقاً' });
    await db.insert(users).values({ id: uid, name, role, passwordHash: await hashPassword(String(password)), mustChangePw: true, isAdmin: role === 'Teacher' ? !!isAdmin : false });
    return NextResponse.json({ success: true, id: uid });
  } catch (e: any) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { id, upd } = await req.json();
    const u = (await db.select().from(users).where(eq(users.id, id)))[0];
    if (!u) return NextResponse.json({ success: false, message: 'المستخدم غير موجود' });
    if (u.role === 'Student') return NextResponse.json({ success: false, message: 'استخدم مسار الطلاب' });
    const patch: any = {};
    if (upd.Name && upd.Name.trim()) patch.name = upd.Name.trim();
    if (upd.Password && upd.Password.trim()) { patch.passwordHash = await hashPassword(upd.Password.trim()); patch.mustChangePw = false; }
    if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
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
      const meRow = (await db.select().from(users).where(eq(users.id, me.id)))[0];
      if (!meRow?.isAdmin) return NextResponse.json({ success: false, message: 'حذف حسابات المعلمين مقصور على المشرف' }, { status: 403 });
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
  } catch (e: any) { return fail(e); }
}
