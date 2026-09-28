/* =====================================================================
   المعلم: تبويبا «الحضور» و«الطلاب» — تصميم v6 (مكوّنات u-* من ui/app.css)
   يُحمَّل بعد السكربت الرئيسي في index.html، فالدوال هنا تحلّ محلّ
   نظيراتها القديمة بالأسماء نفسها. الحالة (_att, _attDirty, _stSearch,
   _stPage, _stGroupFilter) معرّفة في index.html ونستخدمها كما هي.
   ===================================================================== */

/* أيقونة «المزيد» (ثلاث نقاط) — غير موجودة في IC */
function _uDotsIcon(){
  return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
}
function _uInitial(name){ return esc((String(name||'').trim() || '?').charAt(0)); }
function _uGroupChipsData(){
  const groups = (_tData && _tData.groups) || [];
  const hasNone = ((_tData && _tData.students) || []).some(s => !s.Group_ID);
  return { groups, hasNone };
}
function _uMatchGroup(s, g){
  if(!g || g === 'all') return true;
  if(g === 'none') return !s.Group_ID;
  return String(s.Group_ID) === String(g);
}

/* =====================================================================
   الحضور
   ===================================================================== */
function _attFmtDate(d){
  try{
    const dt = new Date(String(d) + 'T12:00:00');
    const sameYear = dt.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', sameYear
      ? { weekday:'long', day:'numeric', month:'long' }
      : { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(dt);
  }catch(e){ return String(d); }
}
/* الطلاب المعروضون حالياً (فلتر المجموعة + البحث) */
function _attVisible(){
  const { nameMap } = tMaps();
  let list = (_tData.students || []).slice()
    .sort((a,b) => String(nameMap[a.Student_ID]||'').localeCompare(String(nameMap[b.Student_ID]||''), 'ar'));
  list = list.filter(s => _uMatchGroup(s, _att.group));
  if(_att.search) list = list.filter(s => arMatches(nameMap[s.Student_ID]||s.Student_ID, _att.search));
  return list;
}
function _attCounts(){
  const counts = { Present:0, Late:0, Absent:0, none:0 };
  (_tData.students || []).forEach(s => { const m = _att.marks[s.Student_ID]; if(m && counts[m] !== undefined) counts[m]++; else counts.none++; });
  return counts;
}

function renderAttendanceTab(body){
  body = body || $('portal'); if(!body) return;
  _att.date = _att.date || ymd(new Date());
  if(_att.group === undefined) _att.group = 'all';
  _initAttMarks();
  const today = ymd(new Date());
  const { groups, hasNone } = _uGroupChipsData();
  if(_att.group !== 'all' && _att.group !== 'none' && !groups.some(g => String(g.Group_ID) === String(_att.group))) _att.group = 'all';
  const hij = String(toHijri(_att.date)||'').replace(/(هـ)\s*هـ\s*$/, '$1');
  const chip = (v, label) => `<button type="button" class="u-chip ${String(_att.group)===String(v)?'on':''}" onclick="attSetGroup(${jsArg(v)})">${esc(label)}</button>`;
  const chips = (groups.length || hasNone)
    ? chip('all','الكل') + groups.map(g => chip(g.Group_ID, g.Group_Name)).join('') + (hasNone ? chip('none','بدون مجموعة') : '')
    : '';

  body.innerHTML = `<div class="u-page fade-in" id="attPage">
    <div class="u-top">
      <div class="u-grow">
        <div class="u-sub">${esc(_attFmtDate(_att.date))}${hij ? ' · ' + esc(hij) : ''}</div>
        <div class="u-row" style="flex-wrap:wrap;gap:8px">
          <h1>الحضور</h1>
          <span id="att_state"></span>
        </div>
      </div>
      <div class="u-actions">
        ${_att.date !== today ? `<button type="button" class="u-btn u-btn-g sm" style="height:40px" onclick="attChangeDate(${jsArg(today)})">اليوم</button>` : ''}
        <label class="u-icon-btn" title="اختيار التاريخ" style="overflow:hidden">
          ${svg('calendar','w-5 h-5')}
          <input type="date" id="att_date" value="${esc(_att.date)}" max="${esc(today)}"
            onchange="if(this.value) attChangeDate(this.value)"
            onclick="try{this.showPicker&&this.showPicker()}catch(e){}"
            aria-label="تاريخ الحضور"
            style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:16px">
        </label>
      </div>
    </div>

    <div id="att_stats"></div>

    ${chips ? `<div class="u-chips">${chips}</div>` : ''}

    <div class="u-search">
      ${svg('search','w-5 h-5')}
      <input type="search" id="att_search" value="${esc(_att.search||'')}" oninput="attSearch(this.value)" placeholder="بحث عن طالب" autocomplete="off" enterkeyhint="search">
    </div>

    <div id="att_list"></div>

    <div class="u-sticky" id="att_save"></div>
  </div>`;
  _attRefresh();
}

/* تحديث الأجزاء المتغيّرة دون المساس بحقل البحث (يحافظ على التركيز والكتابة) */
function _attRefresh(){
  if(!$('att_list')) return renderAttendanceTab($('portal'));
  const { nameMap, groupMap } = tMaps();
  const total = (_tData.students || []).length;
  const c = _attCounts();
  const marked = total - c.none;

  const stat = (lbl, v, color, extra) => `<div class="u-stat" style="padding:10px 10px;min-width:0">
      <div class="l" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lbl}</div>
      <div class="v" style="font-size:21px${color?';color:'+color:''}">${v}${extra||''}</div></div>`;
  $('att_stats').innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px">
      ${stat('حاضر', c.Present, 'var(--ok)', total ? ` <small>/ ${total}</small>` : '')}
      ${stat('متأخر', c.Late, 'var(--warn)')}
      ${stat('غائب', c.Absent, 'var(--bad)')}
      ${stat('لم يُسجَّل', c.none, '')}
    </div>`;

  const hasSaved = (_tData.attendance || []).some(a => String(a.Date) === String(_att.date));
  const st = $('att_state');
  if(st) st.innerHTML = _attDirty
    ? '<span class="u-pill warn">غير محفوظ</span>'
    : (hasSaved ? '<span class="u-pill ok">محفوظ</span>' : '<span class="u-pill mute">لم يُرصد</span>');

  const list = _attVisible();
  let html;
  if(!total){
    html = `<div class="u-card"><div class="u-empty">${svg('users')}لا يوجد طلاب بعد
      <div style="margin-top:12px"><button type="button" class="u-btn u-btn-p sm" onclick="openAddStudent()">${svg('plus','w-4 h-4')} إضافة طالب</button></div></div></div>`;
  } else if(!list.length){
    html = `<div class="u-card"><div class="u-empty">${svg('search')}لا نتائج مطابقة
      <div style="margin-top:12px"><button type="button" class="u-btn u-btn-g sm" onclick="attResetFilters()">إعادة ضبط الفلاتر</button></div></div></div>`;
  } else {
    const seg = (sid, m, st, lbl, cls) => `<button type="button" class="${m===st?cls:''}" aria-pressed="${m===st}" onclick="attMark(${jsArg(sid)},'${st}')">${lbl}</button>`;
    const showGroup = !_att.group || _att.group === 'all';
    const filt = list.length !== total;
    html = `<div class="u-card flush"><div class="u-between" style="padding:10px 0 4px">
        <span class="u-muted">${filt ? `<span class="u-num">${list.length}</span> من <span class="u-num">${total}</span> طالب` : `<span class="u-num">${total}</span> طالب`}</span>
        <button type="button" class="u-btn u-btn-s sm" style="height:32px;color:var(--ok);background:var(--ok-soft)" onclick="attSetAll('Present')">${svg('check','w-4 h-4')} ${filt ? 'تحضير المعروضين' : 'الكل حاضر'}</button>
      </div><div class="u-list">` + list.map(s => {
      const sid = s.Student_ID, name = nameMap[sid] || sid, m = _att.marks[sid] || '';
      const grp = showGroup && groupMap[s.Group_ID] ? `<div class="u-muted">${esc(groupMap[s.Group_ID])}</div>` : '';
      return `<div class="u-item" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px 0">
        <div class="u-row">
          <div class="u-avatar">${_uInitial(name)}</div>
          <div class="u-grow"><div class="u-name">${esc(name)}</div>${grp}</div>
        </div>
        <div class="u-seg" role="group" aria-label="${esc(name)}">
          ${seg(sid, m, 'Present', 'حاضر', 'on-ok')}${seg(sid, m, 'Late', 'متأخر', 'on-warn')}${seg(sid, m, 'Absent', 'غائب', 'on-bad')}
        </div>
      </div>`;
    }).join('') + `</div></div>`;
  }
  $('att_list').innerHTML = html;

  const sv = $('att_save');
  if(sv) sv.innerHTML = total ? `<button type="button" onclick="doSaveAttendance()" class="u-btn ${_attDirty?'u-btn-p':'u-btn-s'} w lg">
      ${svg('check','w-5 h-5')} حفظ الحضور · <span class="u-num">${marked}</span> من <span class="u-num">${total}</span>
    </button>` : '';
}

function _initAttMarks(){
  // تهيئة العلامات من سجل الحضور المحمّل لهذا التاريخ (مرة واحدة لكل تاريخ)
  if(_att._loadedDate === _att.date) return;
  _att.marks = {};
  (_tData.attendance || []).forEach(a => { if(String(a.Date) === String(_att.date)) _att.marks[a.Student_ID] = a.Status; });
  _att._loadedDate = _att.date;
}
function attMark(sid, st){
  _att.marks[sid] = (_att.marks[sid] === st ? '' : st);
  _attDirty = true;
  _attRefresh();
}
function attSetAll(st){
  // احترم فلتري المجموعة والبحث: علّم المعروضين فقط
  const list = _attVisible();
  list.forEach(s => _att.marks[s.Student_ID] = st);
  if(list.length) _attDirty = true;
  _attRefresh();
  if(list.length && typeof toast === 'function') toast(`تم تعليم ${list.length} طالب`);
}
function attSetGroup(g){
  _att.group = g || 'all';
  renderAttendanceTab($('portal'));
}
function attResetFilters(){ _att.search = ''; _att.group = 'all'; renderAttendanceTab($('portal')); }
async function attChangeDate(v){
  if(!v || v === _att.date) return;
  if(_attDirty){
    const ok = await confirmModal({ title:'تغييرات غير محفوظة', message:'لديك حضور غير محفوظ لهذا اليوم. الانتقال لتاريخ آخر سيتجاهله. متابعة؟', confirmText:'نعم، تابع', danger:true });
    if(!ok){ const el = $('att_date'); if(el) el.value = _att.date; return; }
  }
  _att.date = v; _att._loadedDate = null; _attDirty = false;
  await ensureDayLoaded(v);
  renderAttendanceTab($('portal'));
}
function attSearch(v){ _att.search = v; _attRefresh(); }
async function doSaveAttendance(){
  const list = Object.keys(_att.marks).filter(sid => _att.marks[sid]).map(sid => ({ Student_ID:sid, Status:_att.marks[sid], Note:'حضور يدوي' }));
  // allIds = كل الطلاب — يخبر الخادم بحذف الذين أُلغي تعليمهم (إلغاء الحضور)
  const allIds = _tData.students.map(s => String(s.Student_ID));
  if(!list.length){
    const ok = await confirmModal({ title:'لم تُعلّم أي حالة', message:'لم تُعلَّم أي حالة حضور. هل تريد <b>مسح كل الحضور</b> المسجَّل لهذا اليوم؟', confirmText:'نعم، امسح الكل', danger:true });
    if(!ok) return;
  }
  const r = await guard(DS.bulkAttendance(_att.date, list, allIds, true), `حفظ حضور ${list.length} طالب…`);
  if(!r || !r.success) return toast((r && r.message) || 'فشل', 'error');
  // حدّث سجل الحضور محلياً (احذف كل سجلات اليوم للطلاب، ثم أضف الجديد)
  const allSet = new Set(allIds);
  _tData.attendance = (_tData.attendance || []).filter(a => !(String(a.Date) === String(_att.date) && allSet.has(String(a.Student_ID))));
  list.forEach(x => _tData.attendance.push({ Att_ID:'A_'+x.Student_ID+'_'+_att.date, Student_ID:x.Student_ID, Date:_att.date, Status:x.Status, Note:x.Note }));
  _attDirty = false;
  if(_teacherTab === 'attend') renderAttendanceTab($('portal'));
  toast(`تم حفظ الحضور · ${list.length} مُعلَّم${r.deleted?` · حُذف ${r.deleted}`:''}${r.awarded?` · +${r.awarded} بند نقاط`:''}`);
}

/* =====================================================================
   الطلاب
   ===================================================================== */
const _ST_PAGE_SIZE = 30; // _stPage = عدد الصفحات المعروضة («عرض المزيد»)

function _stBody(){ return (typeof _teacherTab !== 'undefined' && _teacherTab === 'students') ? $('portal') : ($('settingsSubBody') || $('portal')); }

async function renderStudentsTab(body){
  body = body || _stBody(); if(!body) return;
  if(!(_tData && _tData.students)){
    body.innerHTML = `<div class="u-page"><div class="u-empty"><div class="spinner mx-auto"></div><div style="margin-top:12px">تحميل بيانات الطلاب…</div></div></div>`;
    await refreshTeacherStudents();
    if(!(_tData && _tData.students)) return;
  }
  const { groups, hasNone } = _uGroupChipsData();
  if(_stGroupFilter !== 'all' && _stGroupFilter !== 'none' && !groups.some(g => String(g.Group_ID) === String(_stGroupFilter))) _stGroupFilter = 'all';
  const chip = (v, label) => `<button type="button" class="u-chip ${String(_stGroupFilter)===String(v)?'on':''}" data-g="${esc(v)}" onclick="onStGroupFilter(${jsArg(v)})">${esc(label)}</button>`;
  const chips = (groups.length || hasNone)
    ? `<div class="u-chips" id="st_chips">${chip('all','الكل')}${groups.map(g => chip(g.Group_ID, g.Group_Name)).join('')}${hasNone ? chip('none','بدون مجموعة') : ''}</div>`
    : '';

  body.innerHTML = `<div class="u-page fade-in">
    <div class="u-top">
      <div class="u-grow">
        <div class="u-sub">إجمالي <span class="u-num">${_tData.students.length}</span> طالب</div>
        <h1>الطلاب</h1>
      </div>
      <div class="u-actions">
        <button type="button" class="u-icon-btn" title="استيراد وتصدير" aria-label="استيراد وتصدير" onclick="openStToolsMenu()">${_uDotsIcon()}</button>
        <button type="button" class="u-btn u-btn-p sm" style="height:40px" onclick="openAddStudent()">${svg('plus','w-4 h-4')} إضافة طالب</button>
      </div>
    </div>
    <div class="u-search">
      ${svg('search','w-5 h-5')}
      <input type="search" id="st_search" value="${esc(_stSearch)}" oninput="onStSearch(this.value)" placeholder="بحث بالاسم" autocomplete="off" enterkeyhint="search">
    </div>
    ${chips}
    <div id="stList"></div>
  </div>`;
  renderStList();
}
function onStGroupFilter(v){
  _stGroupFilter = v || 'all'; _stPage = 1;
  document.querySelectorAll('#st_chips .u-chip').forEach(b => b.classList.toggle('on', b.dataset.g === String(_stGroupFilter)));
  renderStList();
}
function onStSearch(v){ _stSearch = v; _stPage = 1; renderStList(); }
function stResetFilters(){ _stSearch = ''; _stGroupFilter = 'all'; _stPage = 1; renderStudentsTab(_stBody()); }
function stShowMore(){ _stPage = (Number(_stPage) || 1) + 1; renderStList(); }
async function doRefreshStudents(){
  await guard(refreshTeacherStudents(), 'تحديث...');
  renderStudentsTab(_stBody());
  toast('تم التحديث');
}
function renderStList(){
  const box = $('stList'); if(!box || !_tData || !_tData.students) return;
  const { nameMap, groupMap } = tMaps();
  let list = _tData.students.slice();
  list = list.filter(s => _uMatchGroup(s, _stGroupFilter));
  if(_stSearch) list = list.filter(s => arMatches(nameMap[s.Student_ID]||s.Student_ID, _stSearch));
  list.sort((a,b) => String(nameMap[a.Student_ID]||'').localeCompare(String(nameMap[b.Student_ID]||''), 'ar'));
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / _ST_PAGE_SIZE));
  _stPage = Math.min(Math.max(1, Number(_stPage) || 1), pages);
  const shown = list.slice(0, _stPage * _ST_PAGE_SIZE);

  if(!_tData.students.length){
    box.innerHTML = `<div class="u-card"><div class="u-empty">${svg('users')}لا يوجد طلاب بعد
      <div class="u-muted" style="margin-top:4px;font-weight:500">أضف أول طالب يدوياً أو استورد من ناظم</div>
      <div class="u-row" style="justify-content:center;margin-top:14px;flex-wrap:wrap">
        <button type="button" class="u-btn u-btn-p sm" onclick="openAddStudent()">${svg('plus','w-4 h-4')} إضافة طالب</button>
        <button type="button" class="u-btn u-btn-s sm" onclick="openNazemImport()">استيراد من ناظم</button>
      </div></div></div>`;
    return;
  }
  if(!total){
    box.innerHTML = `<div class="u-card"><div class="u-empty">${svg('search')}لا نتائج مطابقة${_stSearch ? ` لـ «${esc(_stSearch)}»` : ''}
      <div style="margin-top:12px"><button type="button" class="u-btn u-btn-g sm" onclick="stResetFilters()">إعادة ضبط الفلاتر</button></div></div></div>`;
    return;
  }
  const rows = shown.map(s => {
    const sid = s.Student_ID, name = nameMap[sid] || sid;
    const meta = [groupMap[s.Group_ID] ? esc(groupMap[s.Group_ID]) : 'بدون مجموعة', `<span class="u-num">${esc(Number(s.Total_Points)||0)}</span> نقطة`].join(' · ');
    return `<div class="u-item tap" onclick="openStudentProfile(${jsArg(sid)})">
      <div class="u-avatar">${_uInitial(name)}</div>
      <div class="u-grow"><div class="u-name">${esc(name)}</div><div class="u-muted">${meta}</div></div>
      <button type="button" class="u-icon-btn" style="width:36px;height:36px;border-color:transparent;background:transparent" title="إجراءات" aria-label="إجراءات ${esc(name)}" onclick="event.stopPropagation();openStActions(${jsArg(sid)})">${_uDotsIcon()}</button>
    </div>`;
  }).join('');
  const filtered = total !== _tData.students.length;
  const more = total > shown.length
    ? `<button type="button" class="u-btn u-btn-g w" onclick="stShowMore()">عرض المزيد <span class="u-muted">(${total - shown.length})</span></button>` : '';
  box.innerHTML = `<div class="u-card flush"><div class="u-list">${rows}</div></div>
    ${filtered ? `<div class="u-muted" style="text-align:center;margin-bottom:10px">${total} نتيجة</div>` : ''}
    ${more}`;
}

/* قائمة إجراءات الطالب (بديل أزرار الصف القديمة) */
function openStActions(sid){
  const { nameMap, groupMap } = tMaps();
  const s = (_tData.students || []).find(x => String(x.Student_ID) === String(sid)) || {};
  const name = nameMap[sid] || sid;
  const wa = s.Parent_Phone ? waLink(s.Parent_Phone, 'السلام عليكم') : '';
  const item = (icon, label, js, cls) => `<button type="button" class="u-btn ${cls||'u-btn-g'} w" style="justify-content:flex-start" onclick="${js}">${svg(icon,'w-5 h-5')} ${label}</button>`;
  openModal(name, `<div class="u-muted" style="margin:-4px 0 12px"><span dir="ltr">${esc(sid)}</span>${groupMap[s.Group_ID] ? ' · ' + esc(groupMap[s.Group_ID]) : ''} · ${esc(Number(s.Total_Points)||0)} نقطة</div>
    <div style="display:grid;gap:8px">
      ${item('users', 'الملف الشخصي', `closeModal();openStudentProfile(${jsArg(sid)})`)}
      ${item('points', 'تسجيل نقاط', `fQuickPoint(${jsArg(sid)})`)}
      ${item('trophy', 'منح شارة', `openGrantBadge(${jsArg(sid)})`)}
      ${item('edit', 'تعديل البيانات', `openEditStudent(${jsArg(sid)})`)}
      ${item('print', 'تقرير الطالب', `closeModal();doExportReport(${jsArg(sid)})`)}
      ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener" class="u-btn u-btn-g w" style="justify-content:flex-start" onclick="closeModal()">${svg('wa','w-5 h-5')} مراسلة ولي الأمر</a>` : ''}
      ${item('trash', 'حذف الطالب', `confirmDeleteStudent(${jsArg(sid)},${jsArg(nameMap[sid]||'')})`, 'u-btn-bad')}
    </div>`);
}

/* قائمة الاستيراد/التصدير (بديل أزرار شريط الأدوات القديم) */
function openStToolsMenu(){
  const item = (icon, label, js) => `<button type="button" class="u-btn u-btn-g w" style="justify-content:flex-start" onclick="${js}">${svg(icon,'w-5 h-5')} ${label}</button>`;
  openModal('إدارة الطلاب', `<div style="display:grid;gap:8px">
    ${item('arrowup', 'استيراد من ملف Excel', 'openImportStudents()')}
    ${item('cloud', 'استيراد الطلاب من ناظم', 'closeModal();openNazemImport()')}
    ${item('cloud', 'تصدير إلى Excel', 'closeModal();exportStudentsExcel()')}
    ${item('lock', 'بيانات الدخول', 'openCredentials()')}
    ${item('repeat', 'تحديث القائمة', 'closeModal();doRefreshStudents()')}
  </div>`);
}

/* استيراد أسماء الطلاب من ناظم — يتطلب حساب ناظم مربوطاً في الإعدادات */
async function openNazemImport(){
  const st = await guard(DS.nazemStatus(), 'فحص ربط ناظم…');
  if(!st || !st.linked){
    return openModal('استيراد من ناظم', `<div class="u-empty">${svg('warn','w-8 h-8')}
      <div style="margin-top:8px;font-weight:700;color:var(--ink)">لم يُربط حساب ناظم بعد</div>
      <div class="u-muted" style="margin-top:4px">افتح الإعدادات ثم «ناظم» وأدخل بيانات الدخول أولاً.</div>
      <button type="button" class="u-btn u-btn-p sm" style="margin-top:14px" onclick="closeModal();switchTeacherTab('settings')">فتح الإعدادات</button>
    </div>`);
  }
  const [terms, planKey] = await Promise.all([
    guard(DS.nazemTerms(), 'جلب الفصول…'),
    guard(DS.getSettings(['nz_term','nz_plan']), '')
  ]);
  const cfg = planKey?.values || {};
  const nzTerm = cfg.nz_term || '';
  const nzPlan = cfg.nz_plan || '';
  const termsList = (terms?.terms || terms?.data || []);
  const termOpts = termsList.map(t => `<option value="${esc(t.id||t.term_id)}" ${String(t.id||t.term_id)===String(nzTerm)?'selected':''}>${esc(t.name||t.term_name||t.id)}</option>`).join('');
  openModal('استيراد الطلاب من ناظم', `<div class="u-field">
    <label>الفصل</label>
    <select id="nzi_term" class="u-input" onchange="_nzLoadPlansFor(this.value)">${'<option value="">— اختر —</option>'+termOpts}</select>
  </div>
  <div class="u-field">
    <label>الخطة</label>
    <select id="nzi_plan" class="u-input"><option value="">— اختر الفصل أولاً —</option></select>
  </div>
  <div class="u-plan" style="background:var(--info-soft);border-color:transparent;font-size:12.5px;color:var(--info);margin-bottom:14px">
    يُنشأ حساب لكل طالب في الخطة ليس له حساب على المنصة، ويُربط بمعرّفه في ناظم لتفادي التكرار.
    <br><b>ملاحظة:</b> لا يُستورد أي ورد أو حضور أو نقاط — كل المتابعة تُدار يدوياً من المنصة.
  </div>
  <div class="u-grid2" style="margin:0">
    <button type="button" class="u-btn u-btn-g" onclick="closeModal()">إلغاء</button>
    <button type="button" class="u-btn u-btn-p" onclick="doNazemImport()">استيراد الأسماء</button>
  </div>`);
  if(nzTerm) _nzLoadPlansFor(nzTerm, nzPlan);
}
async function _nzLoadPlansFor(termId, preselect){
  const sel = $('nzi_plan'); if(!sel) return;
  sel.innerHTML = '<option value="">جارٍ التحميل…</option>';
  const r = await guard(DS.nazemPlans(termId), '');
  const list = r?.plans || r?.data || [];
  sel.innerHTML = '<option value="">— اختر خطة —</option>' + list.map(p => `<option value="${esc(p.id||p.plan_id)}" ${String(p.id||p.plan_id)===String(preselect||'')?'selected':''}>${esc(p.name||p.plan_name||p.id)}</option>`).join('');
}
async function doNazemImport(){
  const planId = $('nzi_plan')?.value; if(!planId) return toast('اختر خطة','warn');
  const date = ymd(new Date()); // أي تاريخ ضمن الخطة يعطي قائمة الطلاب
  const r = await guard(DS.nazemSyncPlanDay(planId, date, true), 'استيراد الطلاب من ناظم…');
  if(!r || !r.success) return toast((r&&r.message)||'فشل الاستيراد','error');
  closeModal();
  await refreshTeacherStudents();
  renderStudentsTab($('portal'));
  if(r.newAccounts && r.newAccounts.length){
    showCredentials('حسابات الطلاب الجدد', credRowsFrom(r.newAccounts), `تم إنشاء <b>${r.newAccounts.length}</b> حساب من ناظم.`, r.unmatched||[]);
  } else {
    toast(r.message || 'لا يوجد طلاب جدد للاستيراد');
  }
}
