import { NextRequest, NextResponse } from 'next/server';
import { requireRole, errorResponse } from '@/lib/auth';
import { createStudents } from '@/lib/accounts';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { students, autoParent, defaultPassword } = await req.json();
    const rows = ((students || []) as any[]).map(r => ({
      name: r?.Name, password: r?.Password, groupId: r?.Group_ID,
      studentPhone: r?.Student_Phone, parentPhone: r?.Parent_Phone, nazemId: r?.Nazem_ID
    }));
    const { created, errors } = await createStudents(rows, { autoParent, defaultPassword });
    return NextResponse.json({ success: true, created: created.length, results: created, errors });
  } catch (e: any) {
    return errorResponse(e);
  }
}
