(() => {
  const today = ymd(new Date());
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return ymd(x); };
  const names = ['عبدالله محمد العتيبي', 'فيصل سعد القحطاني', 'يوسف خالد الدوسري', 'عمر ناصر الشهري', 'سلمان فهد الحربي', 'إبراهيم علي الزهراني', 'حمد عبدالرحمن المطيري', 'تركي سعود الغامدي'];
  const students = names.map((n, i) => ({ Student_ID: 'U_' + (100 + i), Parent_ID: 'P_' + (100 + i), Group_ID: i % 2 ? 'G1' : 'G2', Total_Points: [120, 85, 64, 150, 40, 98, 77, 23][i], Student_Phone: '0500000000', Parent_Phone: '0550000000', Nazem_ID: '', _Name: n, _hasUser: true }));
  const users = [{ ID: 'U_001', Name: 'الأستاذ أحمد', Role: 'Teacher' }, ...names.map((n, i) => ({ ID: 'U_' + (100 + i), Name: n, Role: 'Student' })), ...names.map((n, i) => ({ ID: 'P_' + (100 + i), Name: 'ولي أمر ' + n, Role: 'Parent' }))];
  const plans = [];
  names.forEach((n, i) => { for (let k = 0; k < 10; k++) plans.push({ Plan_ID: 'PL' + i + '_' + k, Student_ID: 'U_' + (100 + i), Date: d(k), Daily_Target: 'من سورة البقرة آية ' + (k * 5 + 1) + ' إلى سورة البقرة آية ' + (k * 5 + 5) + ' (5)', From_Surah: 'البقرة', From_Ayah: String(k * 5 + 1), To_Surah: 'البقرة', To_Ayah: String(k * 5 + 5), Amount: '5', Type: k % 3 ? 'conserve' : 'revision', Accomplishment_Status: k === 0 ? (i % 3 ? 'Pending' : 'Done') : ['Done', 'Done', 'Partial', 'Missed'][(i + k) % 4], Source: 'Manual', Locked: '' }); });
  const attendance = [];
  names.forEach((n, i) => { for (let k = 1; k < 10; k++) attendance.push({ Att_ID: 'A' + i + k, Student_ID: 'U_' + (100 + i), Date: d(k), Status: ['Present', 'Present', 'Late', 'Absent'][(i + k) % 4], Note: '' }); });
  const teacherData = {
    success: true, windowStart: d(45), students, users,
    groups: [{ Group_ID: 'G1', Group_Name: 'مجموعة الفاروق', Group_Total_Points: 330 }, { Group_ID: 'G2', Group_Name: 'مجموعة الصديق', Group_Total_Points: 327 }],
    items: [{ Item_ID: 'I1', Description: 'إتمام الحفظ اليومي', Point_Value: 10, Trigger: 'on_done' }, { Item_ID: 'I2', Description: 'المراجعة', Point_Value: 5, Trigger: 'on_review_done' }, { Item_ID: 'I3', Description: 'الحضور', Point_Value: 2, Trigger: 'on_attend_present' }],
    plans, news: [{ News_ID: 'N1', Title: 'مسابقة الحفظ الشهرية', Body: 'تقام المسابقة يوم الخميس القادم بعد صلاة العصر، نرجو من الجميع الاستعداد.', Visibility: 'All', Type: 'post', Video_URL: '', Date: d(2) }],
    events: [{ Event_ID: 'E1', Title: 'اختبار الجزء', Description: '', Date: d(-3), Type: 'اختبار' }],
    attendance, badges: [], surahs: ['الفاتحة', 'البقرة', 'آل عمران'], surahCounts: [7, 286, 200],
    planConfig: { workDays: [0, 1, 2, 3, 4], termStart: '', termEnd: '' }
  };
  const tp = plans.filter(p => p.Student_ID === 'U_100');
  const dash = { success: true, totalPoints: 120, todayPlan: tp[0], todayPlans: [tp[0], { ...tp[0], Plan_ID: 'x', Type: 'revision', Daily_Target: 'مراجعة جزء عم', Accomplishment_Status: 'Pending' }], plans: tp, logs: [{ Date: d(1), Description: 'إتمام الحفظ اليومي', Point_Value: 10 }, { Date: d(1), Description: 'الحضور', Point_Value: 2 }], leaderboard: [{ id: 'G1', name: 'مجموعة الفاروق', points: 330 }, { id: 'G2', name: 'مجموعة الصديق', points: 327 }], badges: [{ Icon: '🌱', Title: 'أول حفظ', Date: d(5), Code: 'FIRST_DONE' }], myGroupId: 'G2', stats: { donePlans: 6, totalPlans: 10, donePct: 60, streak: 3, presentDays: 7, lateDays: 1, absentDays: 1 }, attendanceHistory: attendance.filter(a => a.Student_ID === 'U_100'), progress: { conserve: { surah: 'البقرة', ayah: '45' }, revision: { surah: 'الناس', ayah: '6' }, counts: { conserve: 4, revision: 2 } } };
  const routes = [
    [/\/api\/teacher-data/, teacherData],
    [/\/api\/students\/[^/]+\/dashboard/, dash],
    [/\/api\/feed/, { news: teacherData.news, events: teacherData.events }],
    [/\/api\/children/, [{ id: 'U_100', name: names[0] }]],
    [/\/api\/users$/, { success: true, users: users.filter(u => u.Role !== 'Student').map(u => ({ ...u, IsAdmin: u.Role === 'Teacher', ChildrenCount: 1 })) }],
    [/\/api\/settings/, { success: true, values: { halaqa_name: 'حلقة ابن كثير', halaqa_tagline: 'مجمع حلق الراجحي' } }],
    [/\/api\/nazem\/status/, { success: true, linked: false }],
    [/\/api\/audit/, { success: true, logs: [] }],
    [/\/api\/push\/policy/, { success: true, policy: { enabled: true, audience: 'all', news: true, absence: true } }],
    [/\/api\/push\/vapid/, { success: true, key: '' }],
  ];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url);
    for (const [re, body] of routes) if (re.test(u)) return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.startsWith('/api/')) return new Response(JSON.stringify({ success: true }), { status: 200 });
    return realFetch(url, opts);
  };
  window.__mockLogin = (role) => {
    const u = role === 'Teacher' ? { ID: 'U_001', Name: 'الأستاذ أحمد', Role: 'Teacher', isAdmin: true } : role === 'Student' ? { ID: 'U_100', Name: names[0], Role: 'Student' } : { ID: 'P_100', Name: 'ولي أمر ' + names[0], Role: 'Parent' };
    enterApp(u);
  };
})();

/* تشغيل تلقائي من معاملات الرابط: ?role=Teacher&tab=attend&dark=1&run=<js> */
window.__autoMock = async function(){
  const q = new URLSearchParams(location.search);
  try{ localStorage.setItem('ibk_dark', q.get('dark')==='1' ? '1' : '0'); }catch(e){}
  applyDark(q.get('dark')==='1');
  __mockLogin(q.get('role') || 'Teacher');
  await new Promise(r=>setTimeout(r,600));
  const tab = q.get('tab');
  if(tab && typeof switchTeacherTab==='function' && (q.get('role')||'Teacher')==='Teacher') await switchTeacherTab(tab);
  const run = q.get('run');
  if(run) { try{ await (0,eval)('(async()=>{'+run+'})()'); }catch(e){ console.error(e); } }
};
