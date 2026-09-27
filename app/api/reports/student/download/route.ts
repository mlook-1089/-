import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, pointLogs, pointItems, groups, badges, attendance, studentsData, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { today, buildPlanTarget } from '@/lib/utils';
import { computeStreak } from '@/lib/badges';

const HALAQA = 'حلقة ابن كثير – مجمع حلق الراجحي';

/** هروب قيم النص لتفادي كسر صفحة HTML */
function esc(v: unknown): string {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c]);
}

/** حالة الورد بالعربية */
function statusAr(s: string | null | undefined): string {
  switch (s) {
    case 'Done': return 'مكتمل';
    case 'Partial': return 'جزئي';
    case 'Missed': return 'لم يحفظ';
    default: return 'قيد التنفيذ';
  }
}
function statusClass(s: string | null | undefined): string {
  switch (s) {
    case 'Done': return 'st-done';
    case 'Partial': return 'st-partial';
    case 'Missed': return 'st-missed';
    default: return 'st-pending';
  }
}
/** نوع الورد بالعربية */
function typeAr(t: string | null | undefined): string {
  switch (t) {
    case 'revision': return 'مراجعة';
    case 'mastery': return 'إتقان';
    case 'conserve': return 'حفظ';
    default: return t ? String(t) : 'حفظ';
  }
}

/** تاريخ اليوم ميلادياً بصيغة عربية مقروءة */
function todayHuman(): string {
  const t = today(); // yyyy-MM-dd
  try {
    return new Intl.DateTimeFormat('ar-u-ca-gregory', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    }).format(new Date(t + 'T12:00:00'));
  } catch {
    return t;
  }
}

function notFoundPage(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>لم يتم العثور على الطالب</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:'Tajawal','Segoe UI',system-ui,-apple-system,sans-serif;
    background:linear-gradient(135deg,#f0fdf4,#ecfeff);color:#0f172a;padding:24px}
  .box{background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:48px 40px;text-align:center;
    box-shadow:0 12px 40px rgba(15,23,42,.08);max-width:440px}
  .ic{font-size:56px;margin-bottom:12px}
  h1{margin:0 0 8px;font-size:22px;color:#047857}
  p{margin:0;color:#64748b;font-size:15px;line-height:1.7}
</style>
</head>
<body>
  <div class="box">
    <div class="ic">🔍</div>
    <h1>لم يتم العثور على الطالب</h1>
    <p>تعذّر إيجاد بيانات هذا الطالب. تأكد من الرابط أو أعد المحاولة من لوحة المعلم.</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  await requireRole('Teacher');
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return notFoundPage();

  // بيانات الطالب الأساسية
  const user = (await db.select().from(users).where(eq(users.id, id)))[0] || null;
  const sd = (await db.select().from(studentsData).where(eq(studentsData.studentId, id)))[0] || null;
  if (!user && !sd) return notFoundPage();

  const studentName = user?.name || 'طالب';

  // اسم المجموعة
  let groupName = 'بدون مجموعة';
  if (sd?.groupId) {
    const g = (await db.select().from(groups).where(eq(groups.id, sd.groupId)))[0] || null;
    if (g?.name) groupName = g.name;
  }

  // الخطط (الأوراد)
  const stPlans = await db.select().from(plans).where(eq(plans.studentId, id));
  const enriched = stPlans.map((p) => ({
    Date: String(p.date),
    Target: p.dailyTarget || buildPlanTarget({
      fromSurah: p.fromSurah, fromAyah: p.fromAyah, toSurah: p.toSurah, toAyah: p.toAyah, amount: p.amount
    }),
    Type: p.type,
    Status: p.status
  })).sort((a, b) => b.Date.localeCompare(a.Date));

  // سجل النقاط
  const items = await db.select().from(pointItems);
  const itemMap: Record<string, { description: string; pointValue: number }> = {};
  items.forEach((x) => { itemMap[x.id] = { description: x.description, pointValue: x.pointValue }; });
  const logs = (await db.select().from(pointLogs).where(eq(pointLogs.studentId, id))).map((l) => ({
    Date: String(l.date),
    Description: itemMap[l.itemId]?.description || '-',
    Value: itemMap[l.itemId]?.pointValue ?? 0
  })).sort((a, b) => b.Date.localeCompare(a.Date));

  // الشارات
  const stBadges = (await db.select().from(badges).where(eq(badges.studentId, id)))
    .map((b) => ({ Icon: b.icon || '🏅', Title: b.title, Date: String(b.date) }));

  // الحضور
  const attRows = await db.select().from(attendance).where(eq(attendance.studentId, id));
  const presentDays = attRows.filter((a) => a.status === 'Present' || a.status === 'Late').length;

  // الحسابات
  const doneAll = enriched.filter((p) => p.Status === 'Done');
  const totalPoints = sd?.totalPoints || 0;
  const donePct = enriched.length ? Math.round((doneAll.length / enriched.length) * 100) : 0;
  const streak = computeStreak(doneAll.map((p) => p.Date));

  // آخر السجلات
  const lastPlans = enriched.slice(0, 15);
  const lastLogs = logs.slice(0, 20);

  const badgesHtml = stBadges.length
    ? `<div class="badges">${stBadges.map((b) => `
        <div class="badge">
          <span class="badge-ic">${esc(b.Icon)}</span>
          <span class="badge-title">${esc(b.Title)}</span>
        </div>`).join('')}</div>`
    : `<p class="empty">لا توجد شارات بعد.</p>`;

  const plansRows = lastPlans.length
    ? lastPlans.map((p) => `
        <tr>
          <td class="nowrap">${esc(p.Date)}</td>
          <td>${esc(p.Target) || '—'}</td>
          <td class="nowrap">${esc(typeAr(p.Type))}</td>
          <td class="nowrap"><span class="pill ${statusClass(p.Status)}">${esc(statusAr(p.Status))}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty">لا توجد أوراد مسجّلة.</td></tr>`;

  const logsRows = lastLogs.length
    ? lastLogs.map((l) => `
        <tr>
          <td class="nowrap">${esc(l.Date)}</td>
          <td>${esc(l.Description)}</td>
          <td class="nowrap num ${l.Value >= 0 ? 'pos' : 'neg'}">${l.Value >= 0 ? '+' : ''}${esc(l.Value)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="empty">لا توجد سجلات نقاط.</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تقرير الطالب — ${esc(studentName)}</title>
<style>
  *{box-sizing:border-box}
  :root{
    --green:#047857; --green-d:#065f46; --accent:#0d9488;
    --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --bg:#f8fafc; --card:#ffffff;
  }
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:'Tajawal','Segoe UI',system-ui,-apple-system,'Helvetica Neue',sans-serif;
    line-height:1.6;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .wrap{max-width:900px;margin:0 auto}
  .sheet{background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;
    box-shadow:0 12px 40px rgba(15,23,42,.06)}
  header{background:linear-gradient(135deg,var(--green),var(--accent));color:#fff;padding:28px 32px}
  .halaqa{font-size:14px;opacity:.9;letter-spacing:.3px}
  header h1{margin:6px 0 14px;font-size:26px;font-weight:800}
  .meta{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:14px}
  .meta b{font-weight:700}
  .meta .chip{background:rgba(255,255,255,.16);padding:5px 12px;border-radius:999px}
  .body{padding:28px 32px}
  h2{font-size:17px;color:var(--green-d);margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid var(--line);
    display:flex;align-items:center;gap:8px}
  section{margin-bottom:30px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px}
  .card{background:linear-gradient(160deg,#f0fdf4,#ffffff);border:1px solid #d1fae5;border-radius:16px;
    padding:18px 16px;text-align:center}
  .card .v{font-size:28px;font-weight:800;color:var(--green)}
  .card .l{font-size:13px;color:var(--muted);margin-top:4px}
  .badges{display:flex;flex-wrap:wrap;gap:12px}
  .badge{display:flex;align-items:center;gap:8px;background:#fffbeb;border:1px solid #fde68a;
    border-radius:12px;padding:10px 14px}
  .badge-ic{font-size:22px;line-height:1}
  .badge-title{font-size:14px;font-weight:600;color:#92400e}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--line);vertical-align:middle}
  th{background:#f1f5f9;color:var(--green-d);font-weight:700;font-size:13px}
  tbody tr:nth-child(even){background:#fafafa}
  .nowrap{white-space:nowrap}
  .num{font-variant-numeric:tabular-nums;font-weight:700}
  .num.pos{color:var(--green)} .num.neg{color:#dc2626}
  .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700}
  .st-done{background:#dcfce7;color:#166534}
  .st-partial{background:#fef9c3;color:#854d0e}
  .st-missed{background:#fee2e2;color:#991b1b}
  .st-pending{background:#e2e8f0;color:#475569}
  .empty{color:var(--muted);text-align:center;padding:14px;font-size:14px}
  .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px}
  .toolbar{max-width:900px;margin:0 auto 16px;text-align:left}
  button.print{background:var(--green);color:#fff;border:0;border-radius:12px;padding:11px 22px;
    font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 14px rgba(4,120,87,.3)}
  button.print:hover{background:var(--green-d)}
  footer{text-align:center;color:var(--muted);font-size:12px;padding:18px}
  @media print{
    body{background:#fff;padding:0}
    .toolbar,button{display:none}
    .sheet{box-shadow:none;border:0;border-radius:0}
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="print" onclick="window.print()">طباعة / حفظ PDF</button>
  </div>
  <div class="wrap">
    <div class="sheet">
      <header>
        <div class="halaqa">${esc(HALAQA)}</div>
        <h1>تقرير الطالب</h1>
        <div class="meta">
          <span class="chip">الطالب: <b>${esc(studentName)}</b></span>
          <span class="chip">المجموعة: <b>${esc(groupName)}</b></span>
          <span class="chip">التاريخ: <b>${esc(todayHuman())}</b></span>
        </div>
      </header>
      <div class="body">
        <section>
          <h2>📊 الملخص</h2>
          <div class="cards">
            <div class="card"><div class="v">${esc(totalPoints)}</div><div class="l">النقاط الكلية</div></div>
            <div class="card"><div class="v">${esc(donePct)}%</div><div class="l">نسبة الإنجاز</div></div>
            <div class="card"><div class="v">${esc(streak)}</div><div class="l">أطول سلسلة (أيام)</div></div>
            <div class="card"><div class="v">${esc(presentDays)}</div><div class="l">أيام الحضور</div></div>
            <div class="card"><div class="v">${esc(stBadges.length)}</div><div class="l">عدد الشارات</div></div>
          </div>
        </section>

        <section>
          <h2>🏅 الشارات</h2>
          ${badgesHtml}
        </section>

        <section>
          <h2>📖 آخر الأوراد</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>التاريخ</th><th>الورد / الهدف</th><th>النوع</th><th>الحالة</th></tr>
              </thead>
              <tbody>${plansRows}</tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>⭐ آخر سجلات النقاط</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>التاريخ</th><th>البند</th><th>القيمة</th></tr>
              </thead>
              <tbody>${logsRows}</tbody>
            </table>
          </div>
        </section>
      </div>
      <footer>${esc(HALAQA)} — تم إنشاء هذا التقرير في ${esc(todayHuman())}</footer>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
