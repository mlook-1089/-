import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { planDefinitions } from '@/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { requireRole, errorResponse } from '@/lib/auth';
import { genId, SURAHS, SURAH_AYAH_COUNT } from '@/lib/utils';

const VALID_PAGES = new Set(['0.25', '0.5', '1', '1.5', '2']);
const VALID_DIR = new Set(['asc', 'desc']);
const VALID_TYPE = new Set(['conserve', 'revision']);

function validateRanges(ranges: any): string | null {
  if (!Array.isArray(ranges) || ranges.length === 0) return 'ranges يجب أن تكون مصفوفة غير فارغة';
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (!r || typeof r !== 'object') return `النطاق ${i + 1}: صيغة غير صالحة`;
    const si = SURAHS.indexOf(String(r.fromSurah || ''));
    const ei = SURAHS.indexOf(String(r.toSurah || ''));
    if (si < 0) return `النطاق ${i + 1}: سورة البداية غير صالحة`;
    if (ei < 0) return `النطاق ${i + 1}: سورة النهاية غير صالحة`;
    const fa = Number(r.fromAyah), ta = Number(r.toAyah);
    if (!isFinite(fa) || fa < 1 || fa > SURAH_AYAH_COUNT[si]) return `النطاق ${i + 1}: آية البداية خارج حدود السورة`;
    if (!isFinite(ta) || ta < 1 || ta > SURAH_AYAH_COUNT[ei]) return `النطاق ${i + 1}: آية النهاية خارج حدود السورة`;
  }
  return null;
}

// GET — آخر تعريف خطة (نشط افتراضياً، أو ?includeArchived=1 للكل).
export async function GET(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || '';
    const type = (searchParams.get('type') || '').toLowerCase();
    const includeArchived = searchParams.get('includeArchived') === '1';

    if (!studentId) return NextResponse.json({ success: false, message: 'studentId مطلوب' }, { status: 400 });
    if (type && !VALID_TYPE.has(type)) return NextResponse.json({ success: false, message: 'نوع الخطة غير صالح' }, { status: 400 });

    const conds = [eq(planDefinitions.studentId, studentId)];
    if (type) conds.push(eq(planDefinitions.type, type));
    if (!includeArchived) conds.push(eq(planDefinitions.active, true));

    const rows = await db.select().from(planDefinitions).where(and(...conds)).orderBy(desc(planDefinitions.createdAt)).limit(1);
    const def = rows[0];
    if (!def) return NextResponse.json({ success: true, definition: null });
    return NextResponse.json({ success: true, definition: toClient(def) });
  } catch (e: any) { return errorResponse(e); }
}

function toClient(def: any) {
  return {
    id: def.id,
    studentId: def.studentId,
    type: def.type,
    ranges: def.ranges,
    dailyPages: def.dailyPages,
    workDays: def.workDays ? def.workDays.split(',').map((n: string) => Number(n)).filter((n: number) => n >= 0 && n <= 6) : [],
    termStart: def.termStart ? String(def.termStart) : null,
    termEnd: def.termEnd ? String(def.termEnd) : null,
    direction: def.direction || 'asc',
    active: def.active !== false,
    completedAt: def.completedAt || null,
    createdAt: def.createdAt
  };
}

// POST — إنشاء تعريف خطة جديد. لا توليد صفوف plans مسبقاً.
// إن وُجد تعريف active=true لنفس (studentId, type) → يُؤرشَف (active=false) قبل الإضافة.
export async function POST(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const body = await req.json().catch(() => ({}));
    const { studentId, type, ranges, dailyPages, workDays, direction } = body || {};

    if (!studentId) return NextResponse.json({ success: false, message: 'studentId مطلوب' }, { status: 400 });
    if (!VALID_TYPE.has(type)) return NextResponse.json({ success: false, message: 'type غير صالح (conserve|revision)' }, { status: 400 });
    const rangesErr = validateRanges(ranges);
    if (rangesErr) return NextResponse.json({ success: false, message: rangesErr }, { status: 400 });
    const dp = String(dailyPages);
    if (!VALID_PAGES.has(dp)) return NextResponse.json({ success: false, message: 'dailyPages يجب أن يكون 0.25|0.5|1|1.5|2' }, { status: 400 });
    const dir = String(direction || 'asc');
    if (!VALID_DIR.has(dir)) return NextResponse.json({ success: false, message: 'direction يجب أن يكون asc|desc' }, { status: 400 });
    const wd = Array.isArray(workDays) ? workDays.filter((n: any) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
    const wdStr = wd.length ? wd.join(',') : '0,1,2,3,4';

    // أرشفة أي خطة نشطة سابقة لنفس (studentId, type)
    await db.execute(sql`
      UPDATE plan_definitions
      SET active = false, completed_at = COALESCE(completed_at, NOW())
      WHERE student_id = ${studentId} AND type = ${type} AND active = true
    `);

    const id = genId('PD');
    await db.insert(planDefinitions).values({
      id,
      studentId,
      type,
      ranges,
      dailyPages: dp,
      workDays: wdStr,
      termStart: null,
      termEnd: null,
      direction: dir,
      active: true
    });

    const [def] = await db.select().from(planDefinitions).where(eq(planDefinitions.id, id));
    return NextResponse.json({ success: true, definition: toClient(def), planDefId: id });
  } catch (e: any) { return errorResponse(e); }
}

// PATCH — تعديل محدود على تعريف قائم:
//  - dailyPages: يُعدَّل بحرية (يسري على اقتراحات الغد؛ لا سحب نقاط ولا إعادة توليد).
//  - active=false: أرشفة يدوية.
// تعديل ranges ممنوع — المعلم يُجبَر على أرشفة الحالية وإنشاء جديدة من POST.
export async function PATCH(req: NextRequest) {
  try {
    await requireRole('Teacher');
    const body = await req.json().catch(() => ({}));
    const { id, upd } = body || {};
    if (!id) return NextResponse.json({ success: false, message: 'id مطلوب' }, { status: 400 });
    const [def] = await db.select().from(planDefinitions).where(eq(planDefinitions.id, id));
    if (!def) return NextResponse.json({ success: false, message: 'الخطة غير موجودة' }, { status: 404 });

    const patch: any = {};
    if (upd?.dailyPages !== undefined) {
      const dp = String(upd.dailyPages);
      if (!VALID_PAGES.has(dp)) return NextResponse.json({ success: false, message: 'dailyPages يجب 0.25|0.5|1|1.5|2' }, { status: 400 });
      patch.dailyPages = dp;
    }
    if (upd?.active === false) {
      patch.active = false;
      patch.completedAt = new Date();
    }
    if (upd?.ranges !== undefined) {
      return NextResponse.json({ success: false, message: 'تعديل ranges ممنوع — أرشِف هذه الخطة وأنشئ جديدة.' }, { status: 400 });
    }
    if (!Object.keys(patch).length) return NextResponse.json({ success: false, message: 'لا تعديلات' }, { status: 400 });

    await db.update(planDefinitions).set(patch).where(eq(planDefinitions.id, id));
    const [updated] = await db.select().from(planDefinitions).where(eq(planDefinitions.id, id));
    return NextResponse.json({ success: true, definition: toClient(updated) });
  } catch (e: any) { return errorResponse(e); }
}
