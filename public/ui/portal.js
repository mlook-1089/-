/* =====================================================================
   بوابتا الطالب وولي الأمر — تصميم v6
   تستبدل الدوال القديمة: renderStudent / renderParent / loadChild
   الأقسام (شريط التنقل السفلي): اليوم · تقدّمي · الأخبار
   البيانات تُجلب مرة واحدة لكل تحميل وتُخزَّن في _pt؛ التنقل بين الأقسام
   يعيد الرسم من الذاكرة دون طلبات جديدة.
   ===================================================================== */
let _pt = { role: '', sec: 'today', dash: null, feed: { news: [], events: [] }, children: [], childId: '', allLog: false, allAtt: false, seq: 0 };

/* ---------- أدوات صغيرة ---------- */
function _ptTodayPlans(d){ return (d && d.todayPlans && d.todayPlans.length) ? d.todayPlans : (d && d.todayPlan ? [d.todayPlan] : []); }
const _PT_ST = { Done: ['ok', 'مكتمل'], Partial: ['warn', 'جزئي'], Missed: ['bad', 'لم يحفظ'] };
function _ptStPill(s){ const x = _PT_ST[s] || ['mute', 'لم يُسمَّع']; return `<span class="u-pill ${x[0]}">${x[1]}</span>`; }
function _ptAtt(s){ return s === 'Present' ? ['ok', 'حاضر'] : s === 'Late' ? ['warn', 'متأخر'] : ['bad', 'غائب']; }
function _ptFmt(ds, opts){
  try{ const d = new Date(String(ds) + 'T12:00:00'); if(isNaN(d)) return String(ds || ''); return new Intl.DateTimeFormat('ar-u-nu-latn', opts).format(d); }catch(e){ return String(ds || ''); }
}
function _ptDay(ds){
  if(!ds) return '';
  const t = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
  if(ds === ymd(t)) return 'اليوم';
  if(ds === ymd(y)) return 'أمس';
  return _ptFmt(ds, { weekday: 'long', day: 'numeric', month: 'long' });
}
function _ptHijri(ds, opts){ try{ const d = ds instanceof Date ? ds : new Date(String(ds) + 'T12:00:00'); if(isNaN(d)) return ''; return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', opts || { day: 'numeric', month: 'long', year: 'numeric' }).format(d).replace(/\s*هـ$/, '') + (opts ? '' : ' هـ'); }catch(e){ return ''; } }
function _ptEmpty(icon, text){ return `<div class="u-empty">${svg(icon, 'w-9 h-9')}${esc(text)}</div>`; }
function _ptCardH(title, linkText, linkJs){ return `<div class="u-card-h"><h2>${esc(title)}</h2>${linkText ? `<button type="button" class="u-link" onclick="${linkJs}">${esc(linkText)}</button>` : ''}</div>`; }
function _ptFirstLast(n){ const p = String(n || '').trim().split(/\s+/); return p.length > 2 ? p[0] + ' ' + p[p.length - 1] : String(n || ''); }
function _ptGroupName(d){ const g = (d && d.leaderboard || []).find(x => d.myGroupId && String(x.id) === String(d.myGroupId)); return g ? g.name : ''; }
function _ptAttPct(s){ const p = (s.presentDays || 0) + (s.lateDays || 0), t = p + (s.absentDays || 0); return t ? Math.round(p / t * 100) : null; }

/* نص الورد: المقطع مختصراً (البقرة 1 — 5) + نص المعلم إن كان مخصّصاً */
function _ptPlanText(p){
  const tgt = String(p.Daily_Target || '').trim();
  let range = '';
  if(p.From_Surah){
    const a = p.From_Surah + (p.From_Ayah ? ' ' + p.From_Ayah : '');
    if(!p.To_Surah || (p.To_Surah === p.From_Surah && p.To_Ayah === p.From_Ayah)) range = a;
    else if(p.To_Surah === p.From_Surah) range = a + ' — ' + (p.To_Ayah || '');
    else range = a + ' — ' + p.To_Surah + (p.To_Ayah ? ' ' + p.To_Ayah : '');
  }
  const auto = /^من سورة /.test(tgt);
  if(range && (auto || !tgt)){ const m = tgt.match(/\(([^)]+)\)\s*$/); return { main: range, sub: m ? 'المقدار: ' + m[1] : '' }; }
  return { main: tgt || range || '—', sub: (range && tgt && tgt !== range) ? range : '' };
}

function _ptRing(pct, color){
  const r = 30, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<div class="u-ring"><svg width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--muted-bg)" stroke-width="8"/>${pct > 0 ? `<circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>` : ''}</svg><b class="u-num">${pct}%</b></div>`;
}

/* ---------- الدخول: الطالب ---------- */
async function renderStudent(){
  const seq = ++_pt.seq;
  _pt = Object.assign(_pt, { role: 'Student', sec: 'today', dash: null, children: [], childId: currentUser.ID, allLog: false, allAtt: false });
  _ptNav();
  loader(true, 'تحميل…');
  let d, feed;
  try{ [d, feed] = await Promise.all([DS.getStudentDashboard(currentUser.ID), DS.getFeed('Student')]); }
  catch(e){ toast('خطأ: ' + (e && e.message || e), 'error'); return; }
  finally{ loader(false); }
  if(seq !== _pt.seq) return;
  if(!d || d.success === false){ if(!(d && d._auth)) toast((d && d.message) || 'تعذّر التحميل', 'error'); return; }
  _pt.dash = d;
  _pt.feed = (feed && feed.news) ? feed : { news: [], events: [] };
  _ptRender();
}

/* ---------- الدخول: ولي الأمر ---------- */
async function renderParent(){
  const seq = ++_pt.seq;
  _pt = Object.assign(_pt, { role: 'Parent', sec: 'today', dash: null, children: [], childId: '', allLog: false, allAtt: false });
  _ptNav();
  loader(true, 'تحميل…');
  let children, feed;
  try{ [children, feed] = await Promise.all([DS.getChildren(currentUser.ID), DS.getFeed('Parent')]); }
  catch(e){ toast('خطأ: ' + (e && e.message || e), 'error'); return; }
  finally{ loader(false); }
  if(seq !== _pt.seq) return;
  if(!Array.isArray(children)){ if(!(children && children._auth)) toast((children && children.message) || 'تعذّر التحميل', 'error'); return; }
  _pt.children = children;
  _pt.feed = (feed && feed.news) ? feed : { news: [], events: [] };
  if(children.length) await loadChild(children[0].id);
  else _ptRender();
}

/* تحميل لوحة ابن محدّد (يُستدعى من شرائح الأبناء) */
async function loadChild(id){
  if(id == null) id = _pt.childId || (_pt.children[0] && _pt.children[0].id);
  if(!id) return;
  const seq = ++_pt.seq;
  _pt.childId = String(id); _pt.allLog = false; _pt.allAtt = false;
  if(_pt.dash) _ptRender(); // تحديث الشرائح فوراً
  const d = await guard(DS.getStudentDashboard(id), 'تحميل بيانات الابن…');
  if(seq !== _pt.seq) return;
  if(!d || d.success === false){ if(d && !d._auth) toast(d.message || 'تعذّر التحميل', 'error'); return; }
  _pt.dash = d;
  _ptRender();
}

/* ---------- التنقل ---------- */
function _ptNav(){
  const par = _pt.role === 'Parent';
  const go = k => { _pt.sec = k; _ptRender(); };
  uiNav([
    { k: 'today', t: 'اليوم', i: 'home', onSelect: go },
    { k: 'progress', t: par ? 'التقدّم' : 'تقدّمي', i: 'chart', onSelect: go },
    { k: 'news', t: 'الأخبار', i: 'news', onSelect: go }
  ], _pt.sec, { moreLabel: 'حسابي', moreIcon: 'lock' });
}
function _ptGo(k){ if(typeof uiNavSelect === 'function') uiNavSelect(k); else { _pt.sec = k; _ptRender(); } }

function _ptChildName(){ const c = _pt.children.find(x => String(x.id) === String(_pt.childId)); return c ? c.name : ''; }

function _ptRender(){
  const P = $('portal'); if(!P) return;
  const d = _pt.dash, par = _pt.role === 'Parent';
  const name = par ? _ptChildName() : (currentUser && currentUser.Name) || '';
  const grp = _ptGroupName(d);
  if(typeof uiHeader === 'function') uiHeader(par ? (name || (currentUser && currentUser.Name) || '') : name, par ? (name ? ['متابعة الابن', grp].filter(Boolean).join(' · ') : 'ولي أمر') : grp);
  // عنوان الصفحة: يُخفى على الجوال حين يتوفّر رأس الهيكل الجديد (uHeadName) لتفادي التكرار
  const hasShellHead = !!document.getElementById('uHeadName');
  const secT = { today: par ? 'اليوم' : 'ورد اليوم', progress: par ? 'تقدّم الابن' : 'تقدّمي', news: 'الأخبار والفعاليات' }[_pt.sec];
  const topSub = _pt.sec === 'news' ? _ptHijri(new Date()) : [grp, _pt.sec === 'today' ? _ptHijri(new Date()) : ''].filter(Boolean).join(' · ');
  const topTitle = _pt.sec === 'news' ? secT : (name ? _ptFirstLast(name) : secT);
  const top = `<div class="${hasShellHead ? 'hidden md:block' : ''}"><div class="u-top"><div class="u-grow">${topSub ? `<div class="u-sub">${esc(topSub)}</div>` : ''}<h1>${esc(topTitle)}</h1></div></div></div>`;
  const chips = (par && _pt.children.length > 1 && _pt.sec !== 'news')
    ? `<div class="u-chips">${_pt.children.map(c => `<button type="button" class="u-chip ${String(c.id) === String(_pt.childId) ? 'on' : ''}" onclick="loadChild(${jsArg(c.id)})">${esc(_ptFirstLast(c.name))}</button>`).join('')}</div>` : '';
  let body;
  if(_pt.sec === 'news') body = _ptNews();
  else if(par && !_pt.children.length) body = `<div class="u-card">${_ptEmpty('users', 'لا يوجد أبناء مرتبطون بحسابك حالياً')}<p class="u-muted text-center" style="margin-top:-14px;padding-bottom:10px">تواصل مع المعلم لربط حساب ابنك</p></div>`;
  else if(!d) body = `<div class="u-card">${_ptEmpty('history', 'جارٍ التحميل…')}</div>`;
  else body = _pt.sec === 'progress' ? _ptProgress(d) : _ptToday(d);
  P.innerHTML = `<div class="u-page fade-in max-w-5xl mx-auto">${top}${chips}${body}</div>`;
  if(_pt.sec === 'news'){ _calEvents = (_pt.feed.events || []).slice(); if(!(_calDate instanceof Date)) _calDate = new Date(); _ptCal(); }
}

/* ---------- قسم: اليوم ---------- */
function _ptToday(d){
  const par = _pt.role === 'Parent';
  const tps = _ptTodayPlans(d);
  const w = s => s === 'Done' ? 100 : s === 'Partial' ? 50 : 0;
  const pct = tps.length ? Math.round(tps.reduce((a, p) => a + w(p.Accomplishment_Status), 0) / tps.length) : 0;
  const done = tps.filter(p => p.Accomplishment_Status === 'Done').length;
  const color = pct >= 100 ? 'var(--ok)' : pct > 0 ? 'var(--gold)' : 'var(--ink3)';
  const planCard = tps.length ? `<div class="u-card">
      <div class="u-row" style="gap:14px">${_ptRing(pct, color)}
        <div class="u-grow"><div class="u-name" style="font-size:16px">ورد اليوم</div><div class="u-muted" style="margin-top:2px">${par ? 'أنجز' : 'أنجزت'} ${done} من ${tps.length}${tps.some(p => p.Accomplishment_Status === 'Missed') ? ' · يوجد ورد لم يُحفظ' : ''}</div></div>
      </div>
      <div style="margin-top:12px">${tps.map(p => { const t = _ptPlanText(p); return `<div class="u-plan"><div class="u-between" style="margin-bottom:6px"><span class="u-tag ${p.Type === 'revision' ? 'rev' : ''}">${p.Type === 'revision' ? 'مراجعة' : 'حفظ'}</span>${_ptStPill(p.Accomplishment_Status)}</div><div class="u-name">${esc(t.main)}</div>${t.sub ? `<div class="u-muted" style="margin-top:2px">${esc(t.sub)}</div>` : ''}</div>`; }).join('')}</div>
    </div>`
    : `<div class="u-card"><div class="u-row" style="gap:14px">${_ptRing(0, 'var(--ink3)')}<div class="u-grow"><div class="u-name" style="font-size:16px">لا ورد مقرّر اليوم</div><div class="u-muted" style="margin-top:2px">${par ? 'لم يُسجَّل ورد للابن هذا اليوم' : 'خذ قسطاً من الراحة وراجع محفوظك'}</div></div></div></div>`;

  const s = d.stats || {}, ap = _ptAttPct(s), cons = (d.progress || {}).conserve;
  const stats = `<div class="u-grid2 md4">
    <div class="u-stat"><div class="l">${par ? 'النقاط' : 'نقاطي'}</div><div class="v" style="color:var(--gold)">${esc(d.totalPoints || 0)}</div></div>
    <div class="u-stat"><div class="l">أيام متتالية</div><div class="v">${esc(s.streak || 0)}</div></div>
    <div class="u-stat"><div class="l">الحضور</div><div class="v">${ap == null ? '—' : ap + '%'}</div></div>
    <div class="u-stat"><div class="l">${par ? 'وصل في الحفظ' : 'وصلت في الحفظ'}</div><div class="v sm">${cons && cons.surah ? esc(cons.surah) + (cons.ayah ? ' ' + esc(cons.ayah) : '') : '<span class="u-muted" style="font-size:14px">لم يبدأ</span>'}</div></div>
  </div>`;

  const logs = (d.logs || []).slice(0, 4);
  const logCard = `<div class="u-card">${_ptCardH('آخر النقاط', (d.logs || []).length ? 'السجل' : '', "_ptGo('progress')")}
    ${logs.length ? `<div class="u-list">${logs.map(_ptLogItem).join('')}</div>` : _ptEmpty('points', 'لا نقاط مسجّلة بعد')}</div>`;

  return `<div class="md:grid md:grid-cols-2 md:gap-3 md:items-start"><div>${planCard}</div><div>${stats}${logCard}</div></div>`;
}
function _ptLogItem(l){
  const v = Number(l.Point_Value) || 0;
  return `<div class="u-item"><div class="u-grow"><div class="u-name" style="font-size:14px">${esc(l.Description)}</div><div class="u-muted">${esc(_ptDay(l.Date))}</div></div><span class="u-num" style="color:var(${v >= 0 ? '--ok' : '--bad'})" dir="ltr">${v >= 0 ? '+' : ''}${esc(v)}</span></div>`;
}

/* ---------- قسم: التقدّم ---------- */
function _ptProgress(d){
  const par = _pt.role === 'Parent';
  const s = d.stats || {}, prog = d.progress || {}, cnt = prog.counts || {};
  const hero = `<div class="u-hero">
    <div class="l">نسبة إنجاز الأوراد</div>
    <div class="big u-num">${esc(s.donePct || 0)}%</div>
    <div class="u-bar"><i style="width:${Math.max(0, Math.min(100, Number(s.donePct) || 0))}%"></i></div>
    <div class="meta"><span>${esc(s.donePlans || 0)} مكتمل من ${esc(s.totalPlans || 0)} ورد</span><span>السلسلة ${esc(s.streak || 0)} يوم</span></div>
  </div>`;

  const track = (p, label, rev, n) => `<div class="u-stat">
    <div class="u-between"><span class="u-tag ${rev ? 'rev' : ''}">${label}</span><span class="u-muted">${esc(n || 0)} ورد</span></div>
    ${p && p.surah ? `<div class="v sm" style="margin-top:10px">${esc(p.surah)}</div><div class="u-muted">${p.ayah ? 'آية ' + esc(p.ayah) : '&nbsp;'}</div>` : `<div class="v sm" style="margin-top:10px;color:var(--ink3)">لم يبدأ</div><div class="u-muted">&nbsp;</div>`}
  </div>`;
  const pos = `<div class="u-section">${par ? 'أين وصل؟' : 'أين وصلت؟'}</div><div class="u-grid2">${track(prog.conserve, 'حفظ', false, cnt.conserve)}${track(prog.revision, 'مراجعة', true, cnt.revision)}</div>`;

  const bs = d.badges || [];
  const badges = `<div class="u-card">${_ptCardH('الشارات' + (bs.length ? ' · ' + bs.length : ''))}
    ${bs.length ? `<div class="u-grid3" style="margin-bottom:0">${bs.map(b => `<div style="background:var(--gold-soft);border-radius:14px;padding:10px 6px;text-align:center"><div style="font-size:26px;line-height:1.2">${esc(b.Icon || '')}</div><div style="font-size:12px;font-weight:700;color:var(--gold);margin-top:4px;overflow-wrap:anywhere">${esc(b.Title)}</div>${b.Date ? `<div class="u-muted" style="font-size:10.5px">${esc(_ptFmt(b.Date, { day: 'numeric', month: 'short' }))}</div>` : ''}</div>`).join('')}</div>`
      : _ptEmpty('trophy', par ? 'لا شارات بعد' : 'شارتك الأولى تنتظرك')}</div>`;

  const myG = d.myGroupId ? String(d.myGroupId) : '';
  const lb = d.leaderboard || [];
  const board = `<div class="u-card">${_ptCardH('منافسة المجموعات')}
    ${lb.length ? `<div class="u-list">${lb.map((g, i) => { const mine = myG && String(g.id) === myG; return `<div class="u-item" ${mine ? 'style="background:var(--brand-soft);border-radius:12px;padding-inline:8px;margin:2px -8px;border-bottom-color:transparent"' : ''}><div class="u-rank ${i === 0 ? 'r1' : ''}">${i + 1}</div><div class="u-grow"><div class="u-name">${esc(g.name)}</div>${mine ? `<div class="u-muted" style="color:var(--brand-ink)">${par ? 'مجموعة الابن' : 'مجموعتي'}</div>` : ''}</div><span class="u-num">${esc(g.points)}</span></div>`; }).join('')}</div>` : _ptEmpty('users', 'لا توجد مجموعات')}</div>`;

  const hist = d.attendanceHistory || [];
  const ap = _ptAttPct(s);
  const shownAtt = _pt.allAtt ? hist : hist.slice(0, 7);
  const att = `<div class="u-card">${_ptCardH('الحضور' + (ap == null ? '' : ' · ' + ap + '%'))}
    <div class="u-grid3">
      <div style="background:var(--ok-soft);border-radius:12px;padding:8px;text-align:center"><div class="u-num" style="font-size:18px;color:var(--ok)">${esc(s.presentDays || 0)}</div><div class="u-muted">حاضر</div></div>
      <div style="background:var(--warn-soft);border-radius:12px;padding:8px;text-align:center"><div class="u-num" style="font-size:18px;color:var(--warn)">${esc(s.lateDays || 0)}</div><div class="u-muted">متأخر</div></div>
      <div style="background:var(--bad-soft);border-radius:12px;padding:8px;text-align:center"><div class="u-num" style="font-size:18px;color:var(--bad)">${esc(s.absentDays || 0)}</div><div class="u-muted">غائب</div></div>
    </div>
    ${hist.length ? `<div class="u-list">${shownAtt.map(a => { const x = _ptAtt(a.Status); return `<div class="u-item"><div class="u-grow"><div class="u-name" style="font-size:14px">${esc(_ptDay(a.Date))}</div>${a.Note ? `<div class="u-muted">${esc(a.Note)}</div>` : ''}</div><span class="u-pill ${x[0]}">${x[1]}</span></div>`; }).join('')}</div>
      ${hist.length > 7 ? `<button type="button" class="u-btn u-btn-g sm w" style="margin-top:8px" onclick="_pt.allAtt=!_pt.allAtt;_ptRender()">${_pt.allAtt ? 'عرض أقل' : 'عرض السجل كاملاً (' + hist.length + ')'}</button>` : ''}`
      : _ptEmpty('calendar', 'لا سجل حضور بعد')}</div>`;

  const logsAll = d.logs || [];
  const shownLog = _pt.allLog ? logsAll : logsAll.slice(0, 8);
  const logs = `<div class="u-card">${_ptCardH('سجل النقاط' + (logsAll.length ? ' · ' + (d.totalPoints || 0) : ''))}
    ${logsAll.length ? `<div class="u-list">${shownLog.map(_ptLogItem).join('')}</div>${logsAll.length > 8 ? `<button type="button" class="u-btn u-btn-g sm w" style="margin-top:8px" onclick="_pt.allLog=!_pt.allLog;_ptRender()">${_pt.allLog ? 'عرض أقل' : 'عرض الكل (' + logsAll.length + ')'}</button>` : ''}` : _ptEmpty('points', 'لا يوجد سجل نقاط')}</div>`;

  return `${hero}${pos}<div class="md:grid md:grid-cols-2 md:gap-3 md:items-start" style="margin-top:12px"><div>${badges}${board}</div><div>${att}${logs}</div></div>`;
}

/* ---------- قسم: الأخبار والفعاليات ---------- */
function _ptNews(){
  const news = _pt.feed.news || [], events = _pt.feed.events || [];
  const t = ymd(new Date());
  const up = events.filter(e => String(e.Date) >= t).slice(0, 4);
  const newsHtml = news.length ? news.map(n => {
    const vid = n.Type === 'video', id = String(n.News_ID);
    return `<div class="u-card">
      <div class="u-row" style="align-items:flex-start">
        ${vid ? `<span class="u-avatar" style="width:32px;height:32px;border-radius:10px;background:var(--info-soft);color:var(--info)">${svg('video', 'w-4 h-4')}</span>` : ''}
        <div class="u-grow"><div class="u-name" style="font-size:15.5px;font-weight:700">${esc(n.Title)}</div><div class="u-muted">${esc(_ptDay(n.Date))}</div></div>
      </div>
      ${n.Body ? `<p style="font-size:14px;line-height:1.75;color:var(--ink2);margin-top:8px;white-space:pre-line;overflow-wrap:anywhere">${esc(n.Body)}</p>` : ''}
      ${vid ? (typeof ytEmbedHtml === 'function' ? ytEmbedHtml(n.Video_URL) : '') : ''}
      ${vid ? `<button type="button" class="u-btn u-btn-s sm" style="margin-top:10px" onclick="_ptComments(${jsArg(id)})">${svg('chat', 'w-4 h-4')} التعليقات</button><div id="ptc_${esc(id)}" class="hidden"></div>` : ''}
    </div>`;
  }).join('') : `<div class="u-card">${_ptEmpty('news', 'لا توجد إعلانات جديدة')}</div>`;
  const upHtml = `<div class="u-card">${_ptCardH('الفعاليات القادمة')}
    ${up.length ? `<div class="u-list">${up.map(e => `<div class="u-item tap" onclick="showDayEvents(${jsArg(e.Date)})"><div style="width:44px;flex-shrink:0;text-align:center;background:var(--brand-soft);color:var(--brand-ink);border-radius:12px;padding:5px 0;line-height:1.15"><div class="u-num" style="font-size:17px">${esc(_ptFmt(e.Date, { day: 'numeric' }))}</div><div style="font-size:10.5px;font-weight:600">${esc(_ptFmt(e.Date, { month: 'short' }))}</div></div><div class="u-grow"><div class="u-name">${esc(e.Title)}</div><div class="u-muted">${esc(_ptHijri(e.Date))}</div></div>${e.Type ? `<span class="u-pill brand">${esc(e.Type)}</span>` : ''}</div>`).join('')}</div>` : _ptEmpty('calendar', 'لا فعاليات قادمة')}</div>`;
  return `<div class="md:grid md:grid-cols-5 md:gap-3 md:items-start"><div class="md:col-span-3"><div class="u-section" style="margin-top:0">الإعلانات</div>${newsHtml}</div><div class="md:col-span-2"><div class="u-section" style="margin-top:0">الفعاليات</div>${upHtml}<div class="u-card" id="ptCal"></div></div></div>`;
}

/* تقويم شهري مختصر (يستخدم _calDate/_calEvents/showDayEvents المشتركة) */
function _ptCal(){
  const c = $('ptCal'); if(!c) return;
  const y = _calDate.getFullYear(), m = _calDate.getMonth();
  const first = new Date(y, m, 1), startDow = first.getDay(), days = new Date(y, m + 1, 0).getDate();
  const title = new Intl.DateTimeFormat('ar-u-nu-latn', { month: 'long', year: 'numeric' }).format(first);
  const hr = (() => { try{ const f = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { month: 'long', year: 'numeric' }); const a = f.format(first), b = f.format(new Date(y, m, days)); return a === b ? a : a.split(' ')[0] + ' — ' + b; }catch(e){ return ''; } })();
  const ev = {}; (_calEvents || []).forEach(e => { (ev[e.Date] = ev[e.Date] || []).push(e); });
  const t = ymd(new Date());
  let cells = '';
  for(let i = 0; i < startDow; i++) cells += '<div></div>';
  for(let day = 1; day <= days; day++){
    const dt = new Date(y, m, day), ds = ymd(dt), has = ev[ds], isT = ds === t;
    const st = isT ? 'background:var(--brand);color:var(--on-brand)' : has ? 'background:var(--gold-soft);color:var(--ink)' : 'color:var(--ink)';
    cells += `<button type="button" ${has ? `onclick="showDayEvents('${ds}')"` : 'tabindex="-1"'} style="${st};border:0;border-radius:10px;padding:5px 0 4px;font-family:inherit;cursor:${has ? 'pointer' : 'default'};position:relative;min-width:0"><div class="u-num" style="font-size:13.5px;line-height:1.2">${day}</div><div style="font-size:9.5px;opacity:.65;line-height:1.2">${esc(_ptHijri(dt, { day: 'numeric' }))}</div>${has ? `<span style="position:absolute;top:3px;left:4px;width:6px;height:6px;border-radius:50%;background:${isT ? 'var(--gold-bright)' : 'var(--gold)'}"></span>` : ''}</button>`;
  }
  const dow = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
  c.innerHTML = `<div class="u-between" style="margin-bottom:10px">
      <button type="button" class="u-icon-btn" style="width:36px;height:36px;font-size:18px" onclick="_calDate=new Date(_calDate.getFullYear(),_calDate.getMonth()-1,1);_ptCal()" aria-label="الشهر السابق">&#8250;</button>
      <div class="text-center"><div class="u-name" style="font-weight:700">${esc(title)}</div><div class="u-muted" style="color:var(--gold)">${esc(hr)}</div></div>
      <button type="button" class="u-icon-btn" style="width:36px;height:36px;font-size:18px" onclick="_calDate=new Date(_calDate.getFullYear(),_calDate.getMonth()+1,1);_ptCal()" aria-label="الشهر التالي">&#8249;</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center">${dow.map(x => `<div class="u-muted" style="font-weight:700;padding-bottom:4px">${x}</div>`).join('')}${cells}</div>`;
}

/* ---------- تعليقات الإعلانات المرئية ---------- */
async function _ptComments(id, force){
  const w = $('ptc_' + id); if(!w) return;
  if(!force && !w.classList.contains('hidden')){ w.classList.add('hidden'); return; }
  const r = await guard(DS.getNewsComments(id), 'تحميل التعليقات…'); if(!r) return;
  const cs = r.comments || [];
  w.innerHTML = `<div class="u-divider"></div>
    ${cs.length ? `<div class="u-list">${cs.map(c => `<div class="u-item" style="align-items:flex-start"><div class="u-avatar" style="width:32px;height:32px;border-radius:10px;font-size:13px">${esc(String(c.userName || '?').trim().charAt(0))}</div><div class="u-grow"><div class="u-between"><span class="u-name" style="font-size:13px">${esc(c.userName)}</span><span class="u-muted" style="font-size:11px">${esc(_ptDay(ymd(new Date(c.date))))}</span></div><div style="font-size:14px;color:var(--ink2);overflow-wrap:anywhere">${esc(c.body)}</div></div></div>`).join('')}</div>` : `<div class="u-muted text-center" style="padding:6px 0 10px">لا تعليقات بعد</div>`}
    <div class="u-row" style="margin-top:8px"><input id="ptci_${esc(id)}" class="u-input u-grow" style="height:42px" placeholder="أضف تعليقاً…" onkeydown="if(event.key==='Enter')_ptSendComment(${jsArg(id)})"><button type="button" class="u-btn u-btn-p sm" style="height:42px" onclick="_ptSendComment(${jsArg(id)})">إرسال</button></div>`;
  w.classList.remove('hidden');
}
async function _ptSendComment(id){
  const inp = $('ptci_' + id); const body = inp && inp.value.trim();
  if(!body) return toast('اكتب تعليقاً', 'warn');
  const r = await guard(DS.addNewsComment(id, body), 'إرسال…');
  if(!r || !r.success) return;
  toast('تم');
  await _ptComments(id, true);
}
