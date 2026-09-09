import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

/* بديل بسيط: تصدير تقرير كـ CSV بدل Google Sheets — يمكن ترقيته لاحقاً لـ PDF */
export async function GET(req: NextRequest) {
  await requireRole('Teacher');
  const id = new URL(req.url).searchParams.get('id') || '';
  // Placeholder — يعيد رابطاً لتنزيل CSV مستقبلاً. مؤقتاً يعيد قيمة تنبيهية.
  return NextResponse.json({
    success: true,
    url: `/api/reports/student/download?id=${encodeURIComponent(id)}`,
    message: 'تصدير التقارير قيد التطوير — سيعمل قريباً'
  });
}
