/* =====================================================================
   برنامج «تعاهد» — تبويب رصد سرد الأحزاب
   يستخدم DS الموجود + أساليب التصميم v6 (u-* tokens).
   يُسجَّل في index.html بين <script src="/ui/taahud.js?v=1"></script>
   يستبدل الدالتين:
     renderTaahudTab(body)        — بوابة المعلم
     renderTaahudSettings(body)   — صفحة الإعدادات (ضمن تبويب الإعدادات)
     renderTaahudStudent(body)    — بوابتا الطالب وولي الأمر (عرض فقط)
   ===================================================================== */

/* ---------- طلبات HTTP مباشرة (مستقلّة عن DS.c كيلا تحتاج تسجيل أسماء API مسبقاً) ---------- */
async function _thFetch(method, path, body){
  const opts = { method, credentials:'include', headers:{} };
  if(body !== undefined){ opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
  try{
    const res = await fetch(path, opts);
    if(res.status===401){ if(typeof handleAuthExpiry==='function') handleAuthExpiry(); return {success:false, message:'انتهت الجلسة', _auth:true}; }
    const text = await res.text();
    let data; try{ data = text ? JSON.parse(text) : {}; }catch(e){ data = {success:false, message:text}; }
    if(!res.ok && !data.message) data.message = 'HTTP '+res.status;
    return data;
  }catch(e){
    return {success:false, message: (navigator.onLine===false?'لا يوجد اتصال بالإنترنت':'تعذّر الاتصال بالخادم'), _network:true};
  }
}
if(typeof DS === 'object'){
  DS.taahudData            = (periodId) => _thFetch('GET', '/api/taahud/data' + (periodId?'?periodId='+encodeURIComponent(periodId):''));
  DS.taahudCreatePeriod    = (name, startDate, endDate) => _thFetch('POST', '/api/taahud/periods', {name, startDate:startDate||'', endDate:endDate||''});
  DS.taahudUpdatePeriod    = (id, upd) => _thFetch('PATCH', '/api/taahud/periods', Object.assign({id}, upd||{}));
  DS.taahudDeletePeriod    = (id) => _thFetch('DELETE', '/api/taahud/periods', {id});
  DS.taahudSaveAssignments = (periodId, studentId, hizbs) => _thFetch('POST', '/api/taahud/assignments', {periodId, studentId, hizbs:hizbs||[]});
  DS.taahudRecord          = (assignmentId, mistakes, warnings) => _thFetch('POST', '/api/taahud/records', {assignmentId, mistakes, warnings});
  DS.taahudDeleteRecord    = (id) => _thFetch('DELETE', '/api/taahud/records', {id});
}

/* ---------- حالة محلية ---------- */
window._th = window._th || {
  loaded: false,
  loading: false,
  data: null,          // آخر رد من /api/taahud/data
  periodId: '',        // الفترة المعروضة (الافتراضي: النشطة)
  studentId: '',       // الطالب المختار في بوابة المعلم (أو ابن ولي الأمر)
  search: '',          // بحث الطلاب لدى المعلم
  qSheetSid: '',       // الطالب المفتوحة له نافذة الأحزاب
  qPendingSel: new Set() // اختيارات مؤقتة في نافذة الإسناد
};

async function _thLoad(force){
  if(_th.loading) return;
  if(_th.loaded && !force) return;
  _th.loading = true;
  let r;
  try { r = await DS.taahudData(_th.periodId || ''); }
  catch(e){ r = {success:false, message: (e && e.message) || 'تعذّر التحميل'}; }
  finally { _th.loading = false; }
  if(!r || !r.success){ if(r && !r._auth) toast((r && r.message) || 'تعذّر التحميل', 'error'); return; }
  _th.data = r;
  _th.loaded = true;
  if(!_th.periodId) _th.periodId = r.currentPeriodId || r.activePeriodId || '';
}

/* قاموس أسماء الأحزاب (1..60) + السور التي يبدأ منها كل حزب — مرجعي سريع */
const _TH_HIZB = (function(){
  // كل جزء حزبان؛ 30 جزء × 2 = 60 حزب
  const arr = [];
  for(let i=1;i<=60;i++) arr.push(i);
  return arr;
})();
function _thHizbLabel(n){ return 'الحزب ' + _thNum(n); }
function _thJuzOfHizb(n){ return Math.ceil(n/2); }
function _thNum(n){ try{ return new Intl.NumberFormat('ar-u-nu-latn').format(n); }catch(e){ return String(n); } }

/* ---------- عرض: بوابة المعلم ---------- */
async function renderTaahudTab(body){
  if(!body) return;
  if(!_th.loaded) { body.innerHTML = '<div class="u-page fade-in"><div class="u-card"><div class="u-empty">جارٍ التحميل…</div></div></div>'; await _thLoad(); }
  _thRenderTeacher(body);
}

function _thRenderTeacher(body){
  const d = _th.data; if(!d) return;
  const periods = d.periods || [];
  const period = periods.find(p => p.id === _th.periodId) || periods.find(p => p.id === d.activePeriodId);
  const assigns = d.assignments || [];
  const records = d.records || [];
  const recByAid = {}; records.forEach(r => { recByAid[r.assignmentId] = r; });

  const students = (d.students || []).slice();
  const q = (_th.search || '').trim();
  const filtered = q ? students.filter(s => arMatches(s.name || '', q) || arMatches(s.id || '', q)) : students;

  // إحصاء لكل طالب
  const perStudent = {};
  students.forEach(s => { perStudent[s.id] = { total: 0, recorded: 0, score: 0, max: 0 }; });
  assigns.forEach(a => {
    const st = perStudent[a.studentId]; if(!st) return;
    st.total++;
    const r = recByAid[a.id];
    if(r){ st.recorded++; st.score += (r.score || 0); st.max += (r.totalPoints || 0); }
  });

  const periodChips = periods.length ? `<div class="u-chips" style="margin:0 0 12px">
    ${periods.map(p => {
      const on = p.id === (period && period.id);
      const badge = p.status === 'active' ? '<span class="u-pill ok" style="margin-right:6px;font-size:10.5px">نشطة</span>' : '';
      return `<button type="button" class="u-chip ${on?'on':''}" onclick="_thSelectPeriod(${jsArg(p.id)})">${esc(p.name)}${badge}</button>`;
    }).join('')}
  </div>` : '';

  const header = `<div class="u-top">
    <div class="u-grow"><div class="u-sub">برنامج تعاهد</div><h1>${period ? esc(period.name) : 'لا توجد فترة بعد'}</h1></div>
    <button type="button" class="u-btn u-btn-p sm" onclick="_thOpenNewPeriod()">${svg('check','w-4 h-4')} فترة جديدة</button>
  </div>`;

  if(!period){
    body.innerHTML = `<div class="u-page fade-in max-w-5xl mx-auto">${header}
      <div class="u-card">
        <div class="u-empty">${svg('book','w-10 h-10')}لم تُفتح أي فترة تعاهد بعد. ابدأ بإنشاء فترة من زر «فترة جديدة».</div>
      </div></div>`;
    return;
  }

  const searchBar = `<div class="u-row" style="margin:0 0 10px">
    <input class="u-input u-grow" placeholder="ابحث عن طالب…" value="${esc(_th.search||'')}" oninput="_th.search=this.value;_thRenderTeacher($('portal'))">
  </div>`;

  const cards = filtered.map(st => {
    const s = perStudent[st.id] || { total:0, recorded:0, score:0, max:0 };
    const pct = s.max ? Math.round((s.score / s.max) * 100) : null;
    const pill = s.total === 0
      ? `<span class="u-pill mute">لم تُسنَد أحزاب</span>`
      : (s.recorded < s.total
        ? `<span class="u-pill warn">${_thNum(s.recorded)} / ${_thNum(s.total)} رُصد</span>`
        : `<span class="u-pill ok">اكتمل · ${_thNum(s.total)} حزب</span>`);
    const scoreLine = s.recorded ? `<div class="u-muted" style="margin-top:3px">الدرجة: <b style="color:var(--gold)">${_thNum(s.score)}</b> من ${_thNum(s.max)}${pct!=null?` · ${pct}%`:''}</div>` : '';
    return `<div class="u-card" style="padding:14px 14px 10px">
      <div class="u-row" style="align-items:flex-start">
        <div class="u-avatar" style="background:var(--brand);color:var(--gold-bright)">${esc(String(st.name||'?').trim().charAt(0))}</div>
        <div class="u-grow"><div class="u-name" style="font-size:15.5px">${esc(st.name||st.id)}</div><div class="u-row" style="margin-top:4px;gap:6px;flex-wrap:wrap">${pill}</div>${scoreLine}</div>
      </div>
      <div class="u-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
        <button type="button" class="u-btn u-btn-s sm u-grow" onclick="_thOpenAssign(${jsArg(st.id)})">${svg('book','w-4 h-4')} إسناد أحزاب</button>
        <button type="button" class="u-btn u-btn-p sm u-grow" onclick="_thOpenRecord(${jsArg(st.id)})" ${s.total===0 || s.recorded===s.total ? 'disabled' : ''}>${svg('check','w-4 h-4')} رصد سرد</button>
      </div>
    </div>`;
  }).join('');

  const empty = filtered.length === 0 ? `<div class="u-card">${_thEmpty('users', q?'لا طلاب يطابقون البحث':'لا يوجد طلاب')}</div>` : '';

  body.innerHTML = `<div class="u-page fade-in max-w-5xl mx-auto">${header}${periodChips}${searchBar}${empty || `<div class="u-grid1 md2">${cards}</div>`}</div>`;
}

function _thEmpty(icon, text){ return `<div class="u-empty">${svg(icon,'w-9 h-9')}${esc(text)}</div>`; }

function _thSelectPeriod(id){ _th.periodId = id; _thLoad(true).then(()=>_thRenderTeacher($('portal'))); }

/* نافذة: إنشاء فترة جديدة */
function _thOpenNewPeriod(){
  openModal('فترة سرد جديدة', `<div style="display:grid;gap:12px">
    <div><label class="u-muted" style="font-size:12px">اسم الفترة</label><input id="th_pname" class="u-input" placeholder="مثال: الفصل الأول — السرد ١"></div>
    <div class="u-row" style="gap:8px"><div class="u-grow"><label class="u-muted" style="font-size:12px">تاريخ البدء (اختياري)</label><input id="th_pstart" type="date" class="u-input"></div><div class="u-grow"><label class="u-muted" style="font-size:12px">تاريخ النهاية (اختياري)</label><input id="th_pend" type="date" class="u-input"></div></div>
    <div class="u-muted" style="font-size:12.5px;line-height:1.6">فتح فترة جديدة سيؤرشف الفترة الحالية (إن وُجدت) تلقائياً. تظل الدرجات السابقة محفوظة.</div>
    <div class="u-row" style="gap:8px"><button type="button" class="u-btn u-btn-p u-grow" onclick="_thDoCreatePeriod()">${svg('check','w-4 h-4')} إنشاء الفترة</button><button type="button" class="u-btn u-btn-g u-grow" onclick="closeModal()">إلغاء</button></div>
  </div>`);
}
async function _thDoCreatePeriod(){
  const name = ($('th_pname')||{}).value || '';
  const sd = ($('th_pstart')||{}).value || '';
  const ed = ($('th_pend')||{}).value || '';
  if(!name.trim()) return toast('اكتب اسم الفترة', 'warn');
  const r = await guard(DS.taahudCreatePeriod(name.trim(), sd, ed), 'إنشاء الفترة…');
  if(!r || !r.success) return r && toast(r.message||'فشل الإنشاء', 'error');
  closeModal();
  _th.periodId = r.id;
  await _thLoad(true);
  _thRenderTeacher($('portal'));
  toast('تم فتح الفترة الجديدة');
}

/* نافذة: إسناد أحزاب لطالب */
function _thOpenAssign(studentId){
  _th.qSheetSid = studentId;
  const d = _th.data; if(!d) return;
  const assigns = (d.assignments || []).filter(a => a.studentId === studentId);
  const recByAid = {}; (d.records||[]).forEach(r => { recByAid[r.assignmentId] = r; });
  // الأحزاب المسندة الحالية
  const currentSet = new Set(assigns.map(a => a.hizbNumber));
  _th.qPendingSel = new Set(currentSet);
  // الأحزاب المرصودة (مقفلة)
  const lockedSet = new Set(assigns.filter(a => recByAid[a.id]).map(a => a.hizbNumber));

  const student = (d.students||[]).find(s => s.id === studentId);
  const title = 'إسناد أحزاب · ' + (student ? student.name : '');

  const grid = _TH_HIZB.map(n => {
    const assigned = currentSet.has(n);
    const locked = lockedSet.has(n);
    const sel = _th.qPendingSel.has(n);
    const juz = _thJuzOfHizb(n);
    const cls = locked ? 'th-h locked' : (sel ? 'th-h on' : 'th-h');
    const click = locked ? '' : `onclick="_thTogglePick(${n})"`;
    return `<button type="button" class="${cls}" data-h="${n}" ${click}>
      <div class="th-h-num">${_thNum(n)}</div>
      <div class="th-h-sub">جـ${_thNum(juz)}</div>
      ${locked?'<div class="th-h-lock">'+svg('lock','w-3 h-3')+'</div>':''}
    </button>`;
  }).join('');

  openModal(title, `<div style="display:grid;gap:10px">
    <div class="u-muted" style="font-size:12.5px;line-height:1.6">اختر الأحزاب التي سيسردها الطالب. الحزب المرصود مُقفَل ولا يمكن حذفه إلا بحذف رصده أولاً.</div>
    <div class="u-row" style="gap:6px;flex-wrap:wrap">
      <button type="button" class="u-btn u-btn-g sm" onclick="_thSelAllAssign()">تحديد الكل</button>
      <button type="button" class="u-btn u-btn-g sm" onclick="_thClearAssign()">مسح الاختيار</button>
      <button type="button" class="u-btn u-btn-g sm" onclick="_thSelJuz(1,15)">النصف الأول (ج١-١٥)</button>
      <button type="button" class="u-btn u-btn-g sm" onclick="_thSelJuz(16,30)">النصف الثاني (ج١٦-٣٠)</button>
    </div>
    <div class="th-hizb-grid">${grid}</div>
    <div class="u-row" style="gap:8px"><button type="button" class="u-btn u-btn-p u-grow" onclick="_thDoSaveAssign()">${svg('check','w-4 h-4')} حفظ الإسناد</button><button type="button" class="u-btn u-btn-g" onclick="closeModal()">إغلاق</button></div>
  </div>`);
}
function _thTogglePick(n){
  if(_th.qPendingSel.has(n)) _th.qPendingSel.delete(n); else _th.qPendingSel.add(n);
  const btn = document.querySelector('[data-h="'+n+'"]');
  if(btn) btn.classList.toggle('on', _th.qPendingSel.has(n));
}
function _thSelAllAssign(){ _TH_HIZB.forEach(n => _th.qPendingSel.add(n)); _thRefreshAssignGrid(); }
function _thClearAssign(){
  // لا يُلغي المرصود (locked) — ننسخ من الحالي من الـ data
  const d = _th.data; if(!d){ _th.qPendingSel.clear(); _thRefreshAssignGrid(); return; }
  const assigns = (d.assignments || []).filter(a => a.studentId === _th.qSheetSid);
  const recByAid = {}; (d.records||[]).forEach(r => { recByAid[r.assignmentId] = r; });
  _th.qPendingSel = new Set(assigns.filter(a => recByAid[a.id]).map(a => a.hizbNumber));
  _thRefreshAssignGrid();
}
function _thSelJuz(fromJ, toJ){
  for(let n=1;n<=60;n++){ const j = _thJuzOfHizb(n); if(j>=fromJ && j<=toJ) _th.qPendingSel.add(n); }
  _thRefreshAssignGrid();
}
function _thRefreshAssignGrid(){
  document.querySelectorAll('.th-h[data-h]').forEach(b => {
    const n = Number(b.getAttribute('data-h'));
    if(b.classList.contains('locked')) return;
    b.classList.toggle('on', _th.qPendingSel.has(n));
  });
}
async function _thDoSaveAssign(){
  const sid = _th.qSheetSid; if(!sid) return;
  const d = _th.data; if(!d) return;
  const r = await guard(DS.taahudSaveAssignments(_th.periodId, sid, Array.from(_th.qPendingSel)), 'حفظ الإسناد…');
  if(!r || !r.success) return r && toast(r.message||'فشل الحفظ', 'error');
  await _thLoad(true);
  closeModal();
  _thRenderTeacher($('portal'));
  toast('تم الحفظ');
}

/* =====================================================================
   وضع الرصد المباشر: شاشة واحدة — شريط أحزاب في الأعلى، درجة كبيرة متحرّكة،
   وزرّان كبيران «خطأ/تنبيه» بضغطة واحدة لكل حدث. تراجع فوري، حفظ، ثم ينتقل
   تلقائياً للحزب التالي. لا كتابة أرقام، لا نوافذ متداخلة.
   ===================================================================== */
function _thOpenRecord(studentId){
  const d = _th.data; if(!d) return;
  const assigns = (d.assignments||[]).filter(a => a.studentId === studentId).sort((a,b)=>a.hizbNumber-b.hizbNumber);
  const recByAid = {}; (d.records||[]).forEach(r => { recByAid[r.assignmentId] = r; });
  // ابدأ تلقائياً بأول حزب لم يُرصد؛ إن اكتمل الجميع، لا نفتح شيئاً
  const firstPending = assigns.find(a => !recByAid[a.id]);
  _th.rec = {
    studentId,
    activeAid: firstPending ? firstPending.id : (assigns[0] && assigns[0].id) || null,
    mistakes: 0, warnings: 0, log: []
  };
  _thRecRender();
}

function _thRecRender(){
  const d = _th.data; if(!d) return;
  const st = _th.rec; if(!st) return;
  const student = (d.students||[]).find(s => s.id === st.studentId);
  const assigns = (d.assignments||[]).filter(a => a.studentId === st.studentId).sort((a,b)=>a.hizbNumber-b.hizbNumber);
  const recByAid = {}; (d.records||[]).forEach(r => { recByAid[r.assignmentId] = r; });
  const cfg = d.config || { totalPerHizb:100, deductPerMistake:2, deductPerWarning:1 };
  const total = cfg.totalPerHizb || 100;

  const chips = assigns.map(a => {
    const r = recByAid[a.id];
    const active = st.activeAid === a.id;
    const cls = r ? 'th-rchip done' : (active ? 'th-rchip active' : 'th-rchip pending');
    const inner = r
      ? `<div class="th-rchip-num">${_thNum(a.hizbNumber)}</div><div class="th-rchip-score">${_thNum(r.score)}</div>`
      : `<div class="th-rchip-num">${_thNum(a.hizbNumber)}</div><div class="th-rchip-sub">جـ${_thNum(_thJuzOfHizb(a.hizbNumber))}</div>`;
    return `<button type="button" class="${cls}" data-aid="${esc(a.id)}" onclick="_thRecPick(${jsArg(a.id)})">${inner}</button>`;
  }).join('');

  const activeAssign = st.activeAid ? assigns.find(a => a.id === st.activeAid) : null;
  const activeRec = activeAssign && recByAid[activeAssign.id];

  let pad = '';
  if(!activeAssign){
    pad = `<div class="u-empty" style="padding:30px 20px">${svg('book','w-10 h-10')}لا توجد أحزاب مسندة</div>`;
  } else if(activeRec){
    const col = _thScoreColor(activeRec.score, activeRec.totalPoints);
    pad = `<div class="th-rec-done">
      <div class="u-pill ok" style="font-size:12px">تم رصد ${esc(_thHizbLabel(activeAssign.hizbNumber))}</div>
      <div class="th-rec-score-big" style="color:${col}">${_thNum(activeRec.score)}</div>
      <div class="u-muted">من ${_thNum(activeRec.totalPoints)}</div>
      <div class="u-row" style="justify-content:center;gap:14px;margin-top:8px"><span class="u-pill bad">${svg('warn','w-3 h-3')} أخطاء: ${_thNum(activeRec.mistakes)}</span><span class="u-pill warn">${svg('bell','w-3 h-3')} تنبيهات: ${_thNum(activeRec.warnings)}</span></div>
      <button type="button" class="u-btn u-btn-bad sm" style="margin-top:14px" onclick="_thUndoRecord(${jsArg(activeRec.id)}, ${jsArg(st.studentId)})">${svg('trash','w-4 h-4')} إلغاء الرصد لإعادة التسميع</button>
    </div>`;
  } else {
    const score = _thCalcScore(cfg, st.mistakes, st.warnings);
    const col = _thScoreColor(score, total);
    pad = `<div class="th-rec-live">
      <div class="th-rec-hizb-lbl">${esc(_thHizbLabel(activeAssign.hizbNumber))} · الجزء ${_thNum(_thJuzOfHizb(activeAssign.hizbNumber))}</div>
      <div class="th-rec-score-big" id="th_rscore" style="color:${col}">${_thNum(score)}</div>
      <div class="u-muted" style="text-align:center">من ${_thNum(total)}</div>
      <div class="th-rec-counters">
        <button type="button" class="th-cnt mistake" onclick="_thRecTap('m')" aria-label="إضافة خطأ">
          <div class="th-cnt-plus">+1</div>
          <div class="th-cnt-num" id="th_rcm">${_thNum(st.mistakes)}</div>
          <div class="th-cnt-label">خطأ</div>
          <div class="th-cnt-ded">−${_thNum(cfg.deductPerMistake)}</div>
        </button>
        <button type="button" class="th-cnt warning" onclick="_thRecTap('w')" aria-label="إضافة تنبيه">
          <div class="th-cnt-plus">+1</div>
          <div class="th-cnt-num" id="th_rcw">${_thNum(st.warnings)}</div>
          <div class="th-cnt-label">تنبيه</div>
          <div class="th-cnt-ded">−${_thNum(cfg.deductPerWarning)}</div>
        </button>
      </div>
      <div class="u-row" style="gap:8px;margin-top:14px">
        <button type="button" class="u-btn u-btn-g" id="th_rundo" onclick="_thRecUndo()" ${!st.log.length?'disabled':''}>↶ تراجع</button>
        <button type="button" class="u-btn u-btn-g" onclick="_thRecReset()" ${!st.log.length?'disabled':''}>تصفير</button>
        <button type="button" class="u-btn u-btn-p u-grow" onclick="_thRecSave()">${svg('check','w-4 h-4')} حفظ وانتقال للتالي</button>
      </div>
    </div>`;
  }

  const title = 'رصد مباشر · ' + (student ? student.name : '');
  const bodyHtml = `<div class="th-rec-wrap">
    <div class="th-rec-chips">${chips}</div>
    ${pad}
  </div>`;
  openModal(title, bodyHtml);
}

function _thCalcScore(cfg, m, w){
  return Math.max(0, (cfg.totalPerHizb||100) - (m||0)*(cfg.deductPerMistake||0) - (w||0)*(cfg.deductPerWarning||0));
}
function _thScoreColor(score, total){
  if(!total) return 'var(--ink)';
  const pct = Math.round((score/total)*100);
  if(pct >= 85) return 'var(--ok)';
  if(pct >= 60) return 'var(--gold)';
  return 'var(--bad)';
}

/* تحديث جزئي في مكان الدرجة والعدّادات، بدون إعادة بناء النافذة كاملة. */
function _thRecRefreshLive(){
  const d = _th.data; const st = _th.rec; if(!d || !st) return;
  const cfg = d.config || { totalPerHizb:100, deductPerMistake:2, deductPerWarning:1 };
  const score = _thCalcScore(cfg, st.mistakes, st.warnings);
  const total = cfg.totalPerHizb || 100;
  const col = _thScoreColor(score, total);
  const se = $('th_rscore');
  if(se){
    se.textContent = _thNum(score);
    se.style.color = col;
    se.classList.remove('pulse');
    void se.offsetWidth; // restart animation
    se.classList.add('pulse');
  }
  const me = $('th_rcm'); if(me) me.textContent = _thNum(st.mistakes);
  const we = $('th_rcw'); if(we) we.textContent = _thNum(st.warnings);
  const ub = $('th_rundo'); if(ub) ub.disabled = !st.log.length;
}

function _thRecPick(aid){
  const st = _th.rec; if(!st) return;
  // تحذير إن كانت هناك ضغطات غير محفوظة
  if(st.activeAid && st.activeAid !== aid && st.log.length){
    if(!confirm('لديك تحديثات لم تُحفظ. الانتقال سيُفقدها. متابعة؟')) return;
  }
  st.activeAid = aid;
  st.mistakes = 0; st.warnings = 0; st.log = [];
  _thRecRender();
}

function _thRecTap(kind){
  const st = _th.rec; if(!st || !st.activeAid) return;
  if(kind === 'm') st.mistakes++;
  else if(kind === 'w') st.warnings++;
  else return;
  st.log.push(kind);
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
  _thRecRefreshLive();
}

function _thRecUndo(){
  const st = _th.rec; if(!st || !st.log.length) return;
  const last = st.log.pop();
  if(last === 'm') st.mistakes = Math.max(0, st.mistakes-1);
  else if(last === 'w') st.warnings = Math.max(0, st.warnings-1);
  _thRecRefreshLive();
}

function _thRecReset(){
  const st = _th.rec; if(!st) return;
  st.mistakes = 0; st.warnings = 0; st.log = [];
  _thRecRefreshLive();
}

async function _thRecSave(){
  const st = _th.rec; if(!st || !st.activeAid) return;
  const r = await guard(DS.taahudRecord(st.activeAid, st.mistakes, st.warnings), 'حفظ الرصد…');
  if(!r || !r.success) return r && toast(r.message||'فشل', 'error');
  toast('تم · الدرجة ' + _thNum(r.record.score), 'success');
  await _thLoad(true);
  // ابحث عن أول حزب لم يُرصد بعد الحفظ وانتقل إليه
  const d = _th.data;
  const sid = st.studentId;
  const assigns = (d.assignments||[]).filter(a => a.studentId === sid).sort((a,b)=>a.hizbNumber-b.hizbNumber);
  const recByAid = {}; (d.records||[]).forEach(rc => { recByAid[rc.assignmentId] = rc; });
  const next = assigns.find(a => !recByAid[a.id]);
  _th.rec = { studentId: sid, activeAid: next ? next.id : st.activeAid, mistakes:0, warnings:0, log:[] };
  _thRecRender();
  // حدّث قائمة المعلم في الخلفية
  if(typeof _thRenderTeacher === 'function' && $('portal')) _thRenderTeacher($('portal'));
}

async function _thUndoRecord(recordId, studentId){
  const ok = await confirmModal({title:'إلغاء الرصد', message:'سيُحذف سجل الرصد وتتمكن من رصد الحزب مجدداً. متابعة؟', confirmText:'نعم، احذف', danger:true});
  if(!ok) return;
  const r = await guard(DS.taahudDeleteRecord(recordId), 'حذف…');
  if(!r || !r.success) return r && toast(r.message||'فشل', 'error');
  await _thLoad(true);
  if(studentId){ _th.rec = { studentId, activeAid: null, mistakes:0, warnings:0, log:[] }; _thOpenRecord(studentId); }
  else closeModal();
  if(typeof _thRenderTeacher === 'function' && $('portal')) _thRenderTeacher($('portal'));
  toast('تم');
}

/* ---------- عرض: الطالب/ولي الأمر ---------- */
async function renderTaahudStudent(body, studentId){
  if(!body) return;
  if(!_th.loaded) { body.innerHTML = '<div class="u-page fade-in"><div class="u-card"><div class="u-empty">جارٍ التحميل…</div></div></div>'; await _thLoad(); }
  _thRenderStudent(body, studentId);
}
function _thRenderStudent(body, studentId){
  const d = _th.data; if(!d) return;
  const periods = d.periods || [];
  const period = periods.find(p => p.id === _th.periodId) || periods.find(p => p.id === d.activePeriodId);
  const assigns = (d.assignments || []).filter(a => !studentId || a.studentId === studentId);
  const recByAid = {}; (d.records||[]).forEach(r => { recByAid[r.assignmentId] = r; });

  const periodChips = periods.length>1 ? `<div class="u-chips" style="margin:0 0 12px">${periods.map(p => {
    const on = p.id === (period && period.id);
    const badge = p.status === 'active' ? '<span class="u-pill ok" style="margin-right:6px;font-size:10.5px">نشطة</span>' : '';
    return `<button type="button" class="u-chip ${on?'on':''}" onclick="_thSelectPeriodStudent(${jsArg(p.id)}, ${jsArg(studentId||'')})">${esc(p.name)}${badge}</button>`;
  }).join('')}</div>` : '';

  const header = period ? `<div class="u-top"><div class="u-grow"><div class="u-sub">برنامج تعاهد</div><h1>${esc(period.name)}</h1></div></div>` : `<div class="u-top"><div class="u-grow"><div class="u-sub">برنامج تعاهد</div><h1>لا توجد فترة بعد</h1></div></div>`;

  if(!period || !assigns.length){
    body.innerHTML = `<div class="u-page fade-in max-w-5xl mx-auto">${header}${periodChips}<div class="u-card">${_thEmpty('book', period ? 'لم يُسنَد لك أي حزب في هذه الفترة بعد' : 'لم تُفتح أي فترة بعد')}</div></div>`;
    return;
  }

  const sorted = assigns.slice().sort((a,b)=>a.hizbNumber-b.hizbNumber);
  const recorded = sorted.filter(a => recByAid[a.id]);
  const pending = sorted.filter(a => !recByAid[a.id]);
  const totalScore = recorded.reduce((s,a)=>s+(recByAid[a.id].score||0),0);
  const totalMax = recorded.reduce((s,a)=>s+(recByAid[a.id].totalPoints||0),0);
  const maxAll = sorted.length * ((d.config && d.config.totalPerHizb) || 100);

  const hero = `<div class="u-hero">
    <div class="l">درجة تعاهد</div>
    <div class="big u-num">${_thNum(totalScore)}</div>
    <div class="u-bar"><i style="width:${maxAll ? Math.max(0,Math.min(100, Math.round(totalScore/maxAll*100))) : 0}%"></i></div>
    <div class="meta"><span>${_thNum(recorded.length)} سُرد من ${_thNum(sorted.length)}</span><span>من ${_thNum(maxAll)} درجة</span></div>
  </div>`;

  const row = a => {
    const r = recByAid[a.id];
    const left = r
      ? `<div><div class="u-num" style="font-size:17px;color:var(--gold)">${_thNum(r.score)}</div><div class="u-muted" style="font-size:11px">من ${_thNum(r.totalPoints)}</div></div>`
      : `<span class="u-pill mute">قيد السرد</span>`;
    const sub = r
      ? `أخطاء ${_thNum(r.mistakes)} · تنبيهات ${_thNum(r.warnings)}`
      : 'لم يُرصد بعد';
    return `<div class="u-item"><div class="u-avatar" style="width:36px;height:36px;background:var(--brand-soft);color:var(--brand-ink);border-radius:12px;font-weight:800">${_thNum(a.hizbNumber)}</div>
      <div class="u-grow"><div class="u-name" style="font-size:14.5px">${esc(_thHizbLabel(a.hizbNumber))}</div><div class="u-muted">الجزء ${_thNum(_thJuzOfHizb(a.hizbNumber))} · ${sub}</div></div>${left}</div>`;
  };

  const list = `<div class="u-card">${(recorded.length||pending.length)?`<div class="u-list">${sorted.map(row).join('')}</div>`:_thEmpty('book','لا توجد أحزاب')}</div>`;

  body.innerHTML = `<div class="u-page fade-in max-w-5xl mx-auto">${header}${periodChips}${hero}${list}</div>`;
}
function _thSelectPeriodStudent(id, studentId){ _th.periodId = id; _thLoad(true).then(()=>_thRenderStudent($('portal'), studentId||'')); }

/* ---------- إعدادات المشرف ---------- */
async function renderTaahudSettings(body){
  if(!body) return;
  if(!_th.loaded) { body.innerHTML = '<div class="u-empty">جارٍ التحميل…</div>'; await _thLoad(); }
  const d = _th.data; if(!d) return;
  const cfg = d.config || { totalPerHizb:100, deductPerMistake:2, deductPerWarning:1 };
  const periods = d.periods || [];

  const periodsHtml = periods.length ? periods.map(p => {
    const isActive = p.status === 'active';
    return `<div class="u-item">
      <div class="u-grow"><div class="u-name" style="font-size:14.5px">${esc(p.name)}</div><div class="u-muted">${isActive?'<span class="u-pill ok" style="font-size:10.5px">نشطة</span>':'<span class="u-pill mute" style="font-size:10.5px">أرشيف</span>'} ${p.startDate?' · من '+esc(p.startDate):''}${p.endDate?' إلى '+esc(p.endDate):''}</div></div>
      ${isActive?'': `<button type="button" class="u-btn u-btn-s sm" onclick="_thActivatePeriod(${jsArg(p.id)})">تفعيل</button>`}
      <button type="button" class="u-icon-btn" title="حذف" onclick="_thDoDeletePeriod(${jsArg(p.id)})">${svg('trash','w-4 h-4')}</button>
    </div>`;
  }).join('') : _thEmpty('book','لا توجد فترات بعد');

  body.innerHTML = `<div style="max-width:620px;margin:0 auto;display:grid;gap:14px">
    <div class="u-card">
      <div class="u-section" style="margin:0 0 10px">إعدادات الاحتساب</div>
      <div class="u-muted" style="font-size:12.5px;line-height:1.6;margin-bottom:10px">تطبّق هذه الإعدادات على الرصدات <b>الجديدة</b> فقط. الدرجات المسجّلة سابقاً تحتفظ بإعدادات لحظة رصدها.</div>
      <div class="u-row" style="gap:8px;flex-wrap:wrap">
        <div class="u-grow" style="min-width:160px"><label class="u-muted" style="font-size:12px">الدرجة الكلية للحزب</label><input id="th_cfg_total" type="number" min="0" value="${esc(cfg.totalPerHizb)}" class="u-input"></div>
        <div class="u-grow" style="min-width:160px"><label class="u-muted" style="font-size:12px">حسم كل خطأ</label><input id="th_cfg_dm" type="number" min="0" value="${esc(cfg.deductPerMistake)}" class="u-input"></div>
        <div class="u-grow" style="min-width:160px"><label class="u-muted" style="font-size:12px">حسم كل تنبيه</label><input id="th_cfg_dw" type="number" min="0" value="${esc(cfg.deductPerWarning)}" class="u-input"></div>
      </div>
      <div class="u-row" style="margin-top:10px"><button type="button" class="u-btn u-btn-p u-grow" onclick="_thSaveConfig()">${svg('check','w-4 h-4')} حفظ الإعدادات</button></div>
    </div>

    <div class="u-card">
      <div class="u-between" style="margin-bottom:10px"><div class="u-section" style="margin:0">فترات السرد</div><button type="button" class="u-btn u-btn-p sm" onclick="_thOpenNewPeriod()">فترة جديدة</button></div>
      <div class="u-list">${periodsHtml}</div>
    </div>
  </div>`;
}
async function _thSaveConfig(){
  const t = Math.max(0, Math.round(Number(($('th_cfg_total')||{}).value || 0)));
  const dm = Math.max(0, Math.round(Number(($('th_cfg_dm')||{}).value || 0)));
  const dw = Math.max(0, Math.round(Number(($('th_cfg_dw')||{}).value || 0)));
  const r = await guard(Promise.all([
    DS.setSetting('taahud_total_per_hizb', String(t)),
    DS.setSetting('taahud_deduct_per_mistake', String(dm)),
    DS.setSetting('taahud_deduct_per_warning', String(dw))
  ]), 'حفظ…');
  if(!r) return;
  await _thLoad(true);
  toast('تم الحفظ');
  if(typeof renderTaahudSettings === 'function' && $('settingsSubBody')) renderTaahudSettings($('settingsSubBody'));
}
async function _thActivatePeriod(id){
  const r = await guard(DS.taahudUpdatePeriod(id, { status:'active' }), 'تفعيل…');
  if(!r || !r.success) return r && toast(r.message||'فشل', 'error');
  _th.periodId = id;
  await _thLoad(true);
  toast('تم');
  if($('settingsSubBody')) renderTaahudSettings($('settingsSubBody'));
}
async function _thDoDeletePeriod(id){
  const ok = await confirmModal({title:'حذف فترة', message:'سيُحذف كل ما يخصّها من إسنادات وسجلات. لا يمكن التراجع. متابعة؟', confirmText:'نعم، احذف', danger:true});
  if(!ok) return;
  const r = await guard(DS.taahudDeletePeriod(id), 'حذف…');
  if(!r || !r.success) return r && toast(r.message||'فشل', 'error');
  if(_th.periodId === id) _th.periodId = '';
  await _thLoad(true);
  toast('تم');
  if($('settingsSubBody')) renderTaahudSettings($('settingsSubBody'));
}
