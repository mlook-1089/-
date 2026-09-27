import { NextResponse } from 'next/server';
import { cleanEnv } from '@/lib/push';

// المفتاح العام غير سرّي — بلا مصادقة
export async function GET() {
  return NextResponse.json({ success: true, key: cleanEnv(process.env.PUSH_VAPID_PUBLIC) });
}
