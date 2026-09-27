import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireSession, AuthError, errorResponse } from '@/lib/auth';
import { genId } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const sub = await req.json();
    const endpoint: string = sub?.endpoint;
    const p256dh: string = sub?.keys?.p256dh;
    const auth: string = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ success: false, message: 'اشتراك غير صالح' }, { status: 400 });
    }

    // احذف أي اشتراك سابق بنفس endpoint لهذا المستخدم لتفادي التكرار
    await db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, s.id), eq(pushSubscriptions.endpoint, endpoint)));

    await db.insert(pushSubscriptions).values({
      id: genId('PS'),
      userId: s.id,
      endpoint,
      p256dh,
      auth
    });

    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const s = await requireSession();
    const { endpoint } = await req.json();
    if (endpoint) {
      await db.delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, s.id), eq(pushSubscriptions.endpoint, endpoint)));
    }
    return NextResponse.json({ success: true });
  } catch (e: any) { return errorResponse(e); }
}
