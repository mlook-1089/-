import { NextRequest, NextResponse } from 'next/server';
import { requireRole, errorResponse } from '@/lib/auth';
import { createStudents } from '@/lib/accounts';

const MAX = 60; // الواجهة ترسل على دفعات أصغر؛ هذا حد أمان لمهلة الخادم

/**
 * إنشاء حسابات جديدة لطلاب ناظم غير المرتبطين بأي حساب في المنصة، وربطها بمعرّف ناظم مباشرة.
 * body: { students: [{ nazemId, name }], groupId?, autoParent?, password? }
 * password فارغة → كلمة مؤقتة عشوائية (٦ أرقام) لكل حساب؛ تُعاد في الرد ليسلّمها المعلم.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { students, groupId, autoParent, password } = await req.json();
    const list = Array.isArray(students) ? students : [];
    if (!list.length) return NextResponse.json({ success: false, message: 'لا يوجد طلاب' }, { status: 400 });
    if (list.length > MAX) return NextResponse.json({ success: false, message: `الحد الأقصى ${MAX} طالباً في الطلب الواحد` }, { status: 413 });
    const pw = String(password || '').trim();
    if (pw && pw.length < 4) return NextResponse.json({ success: false, message: 'كلمة المرور قصيرة' }, { status: 400 });
    const { created, errors } = await createStudents(
      list.map((s: any) => ({ name: String(s?.name || ''), nazemId: String(s?.nazemId || ''), groupId: groupId || null })),
      { autoParent: autoParent !== false, defaultPassword: pw || undefined }
    );
    return NextResponse.json({ success: true, created: created.length, results: created, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
}
