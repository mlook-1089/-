import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/auth';

/* يعيد رابطاً لمستند تقرير الطالب (HTML قابل للطباعة/الحفظ كـ PDF) */
export async function GET(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const id = new URL(req.url).searchParams.get('id') || '';
    return NextResponse.json({
      success: true,
      url: `/api/reports/student/download?id=${encodeURIComponent(id)}`,
      message: 'تم إنشاء التقرير'
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, message: e.message }, { status: 401 });
    return NextResponse.json({ success: false, message: e?.message || 'خطأ' }, { status: 500 });
  }
}
