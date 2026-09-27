import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthError, errorResponse } from '@/lib/auth';

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
  } catch (e: any) { return errorResponse(e); }
}
