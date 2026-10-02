/* =====================================================================
   المتابعة (المعلم) — تصميم v6
   يُحمَّل بعد السكربت الرئيسي فيستبدل الدوال القديمة ذات الأسماء نفسها.
   الحالة (_mp, _fuSub) والدوال المساعدة (doMpSaveItem, doCreateManualPlan,
   doSaveEditPlan, doBulkPoints, ensureDayLoaded …) من index.html كما هي.
   ===================================================================== */

/* حالة إضافية للواجهة الجديدة (تُضاف إلى _mp القائم) */
if (typeof _mp !== 'undefined' && !_mp.filter) _mp.filter = 'all';

const _FU_CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const _FU_PREV = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const _FU_NEXT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';

function _fuGregAr(date){
  try{
    const d = new Date(String(date) + 'T12:00:00');
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday:'long', day:'numeric', month:'long' }).format(d);
  }catch(e){ return String(date); }
}
function _fuAyahRange(p){
  const fs = p.From_Surah || '', ts = p.To_Surah || '';
  if(fs && fs === ts) return `${esc(fs)} <span class="u-num">${esc(p.From_Ayah)}–${esc(p.To_Ayah)}</span>`;
  return `${esc(fs)} <span class="u-num">${esc(p.From_Ayah)}</span> ← ${esc(ts)} <span class="u-num">${esc(p.To_Ayah)}</span>`;
}

/* ---------- Hub: المتابعة اليدوية / ناظم ---------- */
function renderFollowUpHub(body){
  body.innerHTML = `<div class="u-page fade-in">
    <div class="u-top">
      <div class="u-grow"><div class="u-sub" id="fuSubTitle"></div><h1>المتابعة</h1></div>
      <div class="u-actions" id="fuActions"></div>
    </div>
    <div class="u-seg" style="margin-bottom:14px">
      <button type="button" class="${_fuSub==='manual'?'on':''}" onclick="_fuSub='manual';renderFollowUpHub($('portal'))">المتابعة اليدوية</button>
      <button type="button" class="${_fuSub==='nazem'?'on':''}" onclick="_fuSub='nazem';renderFollowUpHub($('portal'))">متابعة ناظم</button>
    </div>
    <div id="fuSubBody"></div>
  </div>`;
  if(_fuSub==='manual') renderManualPlanTab($('fuSubBody'));
  else renderNazemTab($('fuSubBody'));
}

/* ---------- تجميع بيانات اليوم ---------- */
function _mpDayData(){
  const {nameMap} = tMaps();
  const students = (_tData.students||[]).slice().sort((a,b)=>String(nameMap[a.Student_ID]||'').localeCompare(String(nameMap[b.Student_ID]||''),'ar'));
  const searched = _mp.search ? students.filter(s=>arMatches(nameMap[s.Student_ID]||s.Student_ID, _mp.search)) : students;
  const dayPlans = (_tData.plans||[]).filter(p => String(p.Date)===String(_mp.date) && p.Source==='Manual');
  const byStudent = {};
  dayPlans.forEach(p => { (byStudent[p.Student_ID] = byStudent[p.Student_ID] || []).push(p); });
  return { students, searched, dayPlans, byStudent };
}
/* حالة الطالب لليوم: none | pending | done | behind */
function _mpStudentState(plans){
  if(!plans || !plans.length) return 'none';
  if(plans.some(p => (p.Accomplishment_Status||'Pending')==='Pending')) return 'pending';
  if(plans.every(p => p.Accomplishment_Status==='Done')) return 'done';
  return 'behind';
}
/* البطاقات مفتوحة افتراضياً، وتنطوي تلقائياً حين تُرصد أوراد الطالب كلها لذلك اليوم.
   الفتح/الطيّ اليدوي يبقى إلى أن تتغيّر حالة رصد الطالب (رصدٌ أو إعادة فتح). */
function _mpCardOpen(sid, dayPlans){
  if(_mp.cardsDate !== _mp.date){ _mp.cards = {}; _mp.cardsDate = _mp.date; }
  const st = _mpStudentState(dayPlans);
  const recorded = st === 'done' || st === 'behind';
  const c = _mp.cards[sid];
  if(!c || c.recorded !== recorded){
    if(c && recorded) _mp.justFolded = sid;
    _mp.cards[sid] = { recorded, open: !recorded };
  }
  return _mp.cards[sid].open;
}
/* بعد طيّ بطاقة رُصدت للتو: أبقِها في مجال الرؤية ليظهر الطالب التالي تحتها مباشرة */
function _mpRevealFolded(){
  const sid = _mp.justFolded; _mp.justFolded = null;
  if(sid) document.querySelector(`[data-mp-student="${CSS.escape(sid)}"]`)?.scrollIntoView({ block:'nearest' });
}
const _MP_FILTERS = [
  ['all','الكل'], ['pending','لم يُرصد'], ['done','مكتمل'], ['behind','متعثّر'], ['none','بلا خطة']
];
function _mpChipsHTML(searched, byStudent){
  const counts = { all: searched.length, pending:0, done:0, behind:0, none:0 };
  searched.forEach(s => counts[_mpStudentState(byStudent[s.Student_ID])]++);
  return _MP_FILTERS.map(([k,t]) =>
    `<button type="button" class="u-chip ${_mp.filter===k?'on':''}" onclick="mpSetFilter(${jsArg(k)})">${t} <span class="u-num">${counts[k]}</span></button>`).join('');
}
function _mpListHTML(searched, byStudent){
  const list = _mp.filter==='all' ? searched : searched.filter(s => _mpStudentState(byStudent[s.Student_ID])===_mp.filter);
  if(!list.length){
    return `<div class="u-card"><div class="u-empty">${svg('users')}${_mp.search ? 'لا طلاب مطابقون للبحث' : 'لا طلاب في هذا التصنيف'}</div></div>`;
  }
  return list.map(s => renderMpStudentCard(s, byStudent[s.Student_ID]||[])).join('');
}

/* ---------- الشاشة الرئيسية ---------- */
async function renderManualPlanTab(body){
  if(!body) return;
  _mp.date = _mp.date || ymd(new Date());
  _mp.filter = _mp.filter || 'all';
  await ensureDayLoaded(_mp.date);
  const today = ymd(new Date());
  const { students, searched, dayPlans, byStudent } = _mpDayData();
  const withPlan = students.filter(s => byStudent[s.Student_ID]).length;
  const cnt = st => dayPlans.filter(p => (p.Accomplishment_Status||'Pending')===st).length;
  const done = cnt('Done'), partial = cnt('Partial'), missed = cnt('Missed');
  const total = dayPlans.length, recorded = done + partial + missed;
  const pct = total ? Math.round(recorded/total*100) : 0;
  const isToday = _mp.date === today;

  const sub = $('fuSubTitle'); if(sub) sub.textContent = isToday ? 'رصد التسميع اليومي' : 'رصد يوم سابق';
  const act = $('fuActions');
  if(act) act.innerHTML = `<button type="button" class="u-icon-btn" title="نقاط جماعية" aria-label="نقاط جماعية" onclick="openBulkPointsModal()">${svg('coin')}</button>`;

  body.innerHTML = `<div class="fade-in">
    <div class="u-card" style="padding:10px">
      <div class="u-between">
        <button type="button" class="u-icon-btn" aria-label="اليوم السابق" onclick="_mpShiftDay(-1)">${_FU_PREV}</button>
        <label class="u-grow" style="position:relative;text-align:center;cursor:pointer;display:block">
          <div class="u-name" style="font-size:15px">${esc(_fuGregAr(_mp.date))}${isToday?' <span class="u-pill brand" style="margin-inline-start:4px">اليوم</span>':''}</div>
          <div class="u-muted">${esc(toHijri(_mp.date))}</div>
          <input type="date" id="mp_date" max="${today}" value="${esc(_mp.date)}" aria-label="اختيار اليوم"
            onchange="if(this.value){_mp.date=this.value;renderManualPlanTab($('fuSubBody'))}"
            onclick="try{this.showPicker()}catch(e){}"
            style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0">
        </label>
        <button type="button" class="u-icon-btn" aria-label="اليوم التالي" onclick="_mpShiftDay(1)" ${isToday?'disabled style="opacity:.4;cursor:default"':''}>${_FU_NEXT}</button>
      </div>
    </div>

    <div class="u-hero">
      <div class="u-between"><div class="l">رُصد اليوم</div><div class="l">${withPlan} من ${students.length} طالب لديهم خطة</div></div>
      <div class="big"><span class="u-num">${recorded}</span> <span style="font-size:16px;opacity:.8">من ${total} ورد</span></div>
      <div class="u-bar"><i style="width:${pct}%"></i></div>
      <div class="meta"><span>مكتمل ${done} · جزئي ${partial} · لم يحفظ ${missed}</span><span class="u-num">${pct}%</span></div>
    </div>

    <div class="u-search">${svg('search')}<input type="search" id="mp_search" value="${esc(_mp.search)}" oninput="mpSetSearch(this.value)" placeholder="ابحث عن طالب…" autocomplete="off"></div>
    <div class="u-chips" id="mp_chips">${_mpChipsHTML(searched, byStudent)}</div>
    <div id="mp_list">${_mpListHTML(searched, byStudent)}</div>
  </div>`;
  _mpRevealFolded();
}
function _mpShiftDay(n){
  const d = new Date(_mp.date + 'T12:00:00'); d.setDate(d.getDate() + n);
  const v = ymd(d); if(v > ymd(new Date())) return;
  _mp.date = v; renderManualPlanTab($('fuSubBody'));
}
function mpSetSearch(v){
  _mp.search = v || '';
  const { searched, byStudent } = _mpDayData();
  const c = $('mp_chips'); if(c) c.innerHTML = _mpChipsHTML(searched, byStudent);
  const box = $('mp_list'); if(box) box.innerHTML = _mpListHTML(searched, byStudent);
  _mpRevealFolded();
}
function mpSetFilter(k){
  _mp.filter = k || 'all';
  mpSetSearch(_mp.search);
}

/* ---------- بطاقة الطالب ---------- */
function _mpAttPill(st){
  return st==='Present' ? '<span class="u-pill ok">حاضر</span>'
       : st==='Late'    ? '<span class="u-pill warn">متأخر</span>'
       : st==='Absent'  ? '<span class="u-pill bad">غائب</span>'
       : '<span class="u-pill mute">لم يُسجَّل الحضور</span>';
}
function renderMpStudentCard(st, dayPlans){
  const {nameMap, groupMap} = tMaps();
  const sid = String(st.Student_ID);
  const name = nameMap[sid] || sid;
  const groupName = groupMap[st.Group_ID] || '';
  const pts = Number(st.Total_Points) || 0;
  const total = dayPlans.length;
  const done = dayPlans.filter(p => p.Accomplishment_Status==='Done').length;
  const state = _mpStudentState(dayPlans);
  const statePill = state==='none' ? '<span class="u-pill mute">بلا خطة</span>'
                  : state==='done' ? `<span class="u-pill ok">مكتمل <span class="u-num">${done}/${total}</span></span>`
                  : state==='behind' ? `<span class="u-pill warn">متعثّر <span class="u-num">${done}/${total}</span></span>`
                  : `<span class="u-pill info">لم يُرصد <span class="u-num">${done}/${total}</span></span>`;
  const attSt = getAttendanceStatus(sid, _mp.date);
  const isOpen = _mpCardOpen(sid, dayPlans);
  const items = total ? dayPlans.map(p => renderMpPlanItem(p)).join('') : renderMpEmpty(sid);
  const hasAnyManual = (_tData.plans||[]).some(p => String(p.Student_ID)===sid && p.Source==='Manual');
  const attSeg = [['Present','حاضر','on-ok'],['Late','متأخر','on-warn'],['Absent','غائب','on-bad']]
    .map(([v,t,on]) => `<button type="button" class="${attSt===v?on:''}" onclick="_mpSetAttendance(${jsArg(sid)},${jsArg(v)})">${t}</button>`).join('');

  return `<details class="u-card" style="padding:0;overflow:hidden;scroll-margin-top:12px" ${isOpen?'open':''} data-mp-student="${esc(sid)}" ontoggle="_mpToggleStudent(${jsArg(sid)}, this.open)">
    <summary style="display:block;list-style:none;cursor:pointer;padding:12px 14px;outline:none">
      <div class="u-row" style="align-items:flex-start">
        <div class="u-avatar">${esc(String(name).trim().charAt(0))}</div>
        <div class="u-grow">
          <div class="u-name">${esc(name)}</div>
          <div class="u-muted" style="margin-top:1px">${groupName?esc(groupName)+' · ':''}<span class="u-num" style="color:var(--gold)">${pts}</span> نقطة</div>
          <div class="u-row" style="gap:6px;flex-wrap:wrap;margin-top:7px">${statePill}${_mpAttPill(attSt)}</div>
        </div>
        <span data-mp-chev style="color:var(--ink3);display:flex;padding-top:8px;transition:transform .2s;${isOpen?'transform:rotate(180deg)':''}">${_FU_CHEV}</span>
      </div>
    </summary>
    <div style="border-top:1px solid var(--line);background:var(--card2);padding:12px 14px">
      <div class="u-muted" style="font-weight:600;margin-bottom:6px">الحضور</div>
      <div class="u-seg" style="margin-bottom:12px">${attSeg}</div>
      ${items}
    </div>
  </details>`;
}
function _mpToggleStudent(sid, isOpen){
  sid = String(sid);
  if(_mp.cards && _mp.cards[sid]) _mp.cards[sid].open = isOpen;
  const card = document.querySelector(`[data-mp-student="${CSS.escape(sid)}"] [data-mp-chev]`);
  if(card) card.style.transform = isOpen ? 'rotate(180deg)' : '';
}
function renderMpEmpty(sid){
  return `<div class="u-plan" style="border-style:dashed;text-align:center;padding:18px 12px">
    <div style="color:var(--ink3);margin-bottom:6px">${svg('book','w-8 h-8 mx-auto')}</div>
    <div class="u-muted" style="font-size:13px;font-weight:600;margin-bottom:10px">لا توجد خطة لهذا اليوم</div>
    <button type="button" class="u-btn sm u-btn-p" onclick="openCreateManualPlan(${jsArg(sid)})">${svg('plus','w-4 h-4')} إنشاء خطة</button>
  </div>`;
}

/* حضور الطالب من البطاقة — يُحفظ مباشرة */
async function _mpSetAttendance(sid, status){
  const r = await guard(DS.saveAttendance(sid, _mp.date, status, 'مع الرصد', currentUser.ID), 'حفظ الحضور…');
  if(!r || r.success===false) return toast((r&&r.message)||'فشل حفظ الحضور','error');
  _tData.attendance = (_tData.attendance||[]).filter(a=>!(String(a.Student_ID)===String(sid) && String(a.Date)===String(_mp.date)));
  _tData.attendance.push({ Att_ID:'A_'+sid+'_'+_mp.date, Student_ID:sid, Date:_mp.date, Status:status, Note:'مع الرصد' });
  // أبطل ذاكرة صفحة التحضير حتى تُعيد التحميل من _tData.attendance عند فتحها
  if(typeof _att !== 'undefined') _att._loadedDate = null;
  toast('تم حفظ الحضور');
  mpSetSearch(_mp.search);
}

/* ---------- بند الورد ---------- */
function renderMpPlanItem(p){
  const surs = _tData?.surahs || [];
  const status = p.Accomplishment_Status || 'Pending';
  const isDone = status==='Done', isPartial = status==='Partial', isMissed = status==='Missed';
  const pid = p.Plan_ID;
  const typeTag = p.Type==='revision' ? '<span class="u-tag rev">مراجعة</span>' : '<span class="u-tag">حفظ</span>';
  const statusPill = isDone ? '<span class="u-pill ok">مكتمل</span>'
                   : isPartial ? '<span class="u-pill warn">جزئي</span>'
                   : isMissed ? '<span class="u-pill bad">لم يحفظ</span>'
                   : '<span class="u-pill mute">لم يُسمَّع</span>';
  const amount = Number(p.Amount) || 0;
  const smallBtn = 'style="width:34px;height:34px;border-radius:10px"';
  const head = `<div class="u-row" style="gap:6px;margin-bottom:8px">
      ${typeTag}${statusPill}
      <span class="u-grow"></span>
      <button type="button" class="u-icon-btn" ${smallBtn} title="خيارات" aria-label="خيارات" onclick="openMpPlanMenu(${jsArg(pid)},${jsArg(p.Student_ID)})">${svg('edit','w-4 h-4')}</button>
      <button type="button" class="u-icon-btn" ${smallBtn} title="حذف الورد" aria-label="حذف الورد" onclick="doMpDeleteItem(${jsArg(pid)})">${svg('trash','w-4 h-4')}</button>
    </div>
    <div class="u-name" style="font-size:15px">${_fuAyahRange(p)}</div>
    ${amount?`<div class="u-muted" style="margin-top:2px">المقدار: <span class="u-num">${amount}</span> آية</div>`:''}`;

  const lbl = t => `<label style="display:block;font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:4px">${t}</label>`;
  const numIn = (k, v) => `<input type="number" inputmode="numeric" min="0" data-k="${k}" value="${esc(v)}" class="u-input u-num" style="height:42px;text-align:center;padding:0 6px">`;

  if(isDone){
    const cell = (t, v) => `<div style="background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px;text-align:center"><div class="u-muted">${t}</div><div class="u-num" style="color:var(--ink)">${v!=null&&v!==''?esc(v):'—'}</div></div>`;
    return `<div class="u-plan" style="background:var(--ok-soft);border-color:transparent">
      ${head}
      <div class="u-grid3" style="gap:8px;margin:10px 0 8px">${cell('أخطاء',p.Mistakes)}${cell('استماع',p.Hearing)}${cell('تكرار',p.Repetition)}</div>
      <button type="button" class="u-btn sm u-btn-g w" onclick="doMpReopen(${jsArg(pid)})">${svg('repeat','w-4 h-4')} إعادة فتح</button>
    </div>`;
  }

  const attSt = getAttendanceStatus(p.Student_ID, _mp.date) || 'Present';
  const surahOpts = surs.map(s=>`<option value="${esc(s)}" ${s===p.To_Surah?'selected':''}>${esc(s)}</option>`).join('');
  const bg = isMissed ? 'background:var(--bad-soft);border-color:transparent' : isPartial ? 'background:var(--warn-soft);border-color:transparent' : '';
  return `<div class="u-plan" style="${bg}">
    ${head}
    <div data-mp-form="${esc(pid)}" style="margin-top:10px">
      <input type="hidden" data-k="attendance" value="${esc(attSt)}">
      ${lbl('وصل إلى')}
      <div class="u-row" style="gap:8px;margin-bottom:10px">
        <select data-k="toSurah" class="u-input u-grow" style="height:42px">${surahOpts}</select>
        <input type="number" inputmode="numeric" min="1" data-k="toAyah" value="${esc(p.To_Ayah||'')}" class="u-input u-num" style="height:42px;width:84px;text-align:center" aria-label="الآية">
      </div>
      <div class="u-grid3" style="gap:8px;margin-bottom:12px">
        <div>${lbl('أخطاء')}${numIn('mistakes', p.Mistakes!=null?p.Mistakes:0)}</div>
        <div>${lbl('استماع')}${numIn('hearing', p.Hearing!=null?p.Hearing:1)}</div>
        <div>${lbl('تكرار')}${numIn('repetition', p.Repetition!=null?p.Repetition:0)}</div>
      </div>
      <div class="u-seg" style="padding:4px;gap:4px">
        <button type="button" style="padding:13px 0;font-size:14px;background:var(--ok);color:#fff" onclick="doMpSaveItem(${jsArg(pid)},'Done')">مكتمل</button>
        <button type="button" class="${isPartial?'on-warn':''}" style="padding:13px 0;font-size:14px" onclick="doMpSaveItem(${jsArg(pid)},'Partial')">جزئي</button>
        <button type="button" class="${isMissed?'on-bad':''}" style="padding:13px 0;font-size:14px" onclick="doMpSaveItem(${jsArg(pid)},'Missed')">لم يحفظ</button>
      </div>
    </div>
  </div>`;
}

/* قائمة إجراءات على مستوى خطة الطالب كلها — تُفتح من زر القلم على بطاقة الورد */
function openMpPlanMenu(planId, sid){
  const {nameMap} = tMaps();
  const p = (_tData.plans||[]).find(x => String(x.Plan_ID)===String(planId));
  const type = p && p.Type==='revision' ? 'revision' : 'conserve';
  const item = (icon, label, js, cls) => `<button type="button" class="u-btn u-btn-${cls||'g'} w" style="justify-content:flex-start" onclick="closeModal();setTimeout(()=>{${js}},60)">${svg(icon,'w-5 h-5')} ${label}</button>`;
  openModal('خيارات الخطة — ' + (nameMap[sid]||sid), `<div style="display:grid;gap:8px">
    ${item('edit','تعديل الخطة كاملة','openEditFullPlan('+jsArg(sid)+','+jsArg(type)+')','p')}
    ${item('edit','تعديل ورد هذا اليوم فقط','openEditManualPlan('+jsArg(planId)+')')}
    ${item('plus','خطة جديدة','openCreateManualPlan('+jsArg(sid)+')')}
    ${item('trash','مسح الخطة','_mp.studentId='+jsArg(sid)+';confirmClearManualPlans()','bad')}
  </div>`);
}

/* ---------- نقاط جماعية ---------- */
function openBulkPointsModal(){
  const students = _tData.students||[];
  const {nameMap} = tMaps();
  const items = (_tData.items||[]).filter(it=>it.Trigger==='none'||!it.Trigger);
  if(!items.length) return toast('لا توجد بنود نقاط يدوية','warn');
  const itemOpts = items.map(it=>`<option value="${esc(it.Item_ID)}">${esc(it.Description)} (${it.Point_Value>=0?'+':''}${it.Point_Value})</option>`).join('');
  const rows = students.map(st=>{
    const name = nameMap[st.Student_ID]||st.Student_ID;
    return `<label class="u-item" style="cursor:pointer"><input type="checkbox" class="bp_stud" value="${esc(st.Student_ID)}" checked style="width:20px;height:20px;accent-color:var(--brand)"><span class="u-name u-grow">${esc(name)}</span></label>`;
  }).join('');
  openModal('نقاط جماعية', `
    <div class="u-field"><label>بند النقاط</label><select id="bp_item" class="u-input">${itemOpts}</select></div>
    <div class="u-between" style="margin-bottom:6px">
      <span style="font-size:13px;font-weight:600;color:var(--ink2)">الطلاب (<span class="u-num">${students.length}</span>)</span>
      <span class="u-row" style="gap:12px">
        <button type="button" style="border:0;background:none;font:inherit;font-size:12.5px;font-weight:600;color:var(--brand-ink);cursor:pointer" onclick="document.querySelectorAll('.bp_stud').forEach(x=>x.checked=true)">تحديد الكل</button>
        <button type="button" style="border:0;background:none;font:inherit;font-size:12.5px;font-weight:600;color:var(--brand-ink);cursor:pointer" onclick="document.querySelectorAll('.bp_stud').forEach(x=>x.checked=false)">إلغاء الكل</button>
      </span>
    </div>
    <div class="u-list" style="max-height:260px;overflow-y:auto;border:1px solid var(--line);border-radius:14px;padding:0 12px;margin-bottom:14px">${rows||'<div class="u-empty">لا طلاب</div>'}</div>
    <div class="u-grid2" style="margin:0">
      <button type="button" class="u-btn u-btn-g" onclick="closeModal()">إلغاء</button>
      <button type="button" class="u-btn u-btn-p" onclick="doBulkPoints()">تطبيق</button>
    </div>`);
}

/* ---------- نافذة إنشاء خطة فصلية ---------- */
const _FU_LBL = 'style="display:block;font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:5px"';
function _fuRangeHTML(sfx, surOpts){
  const id = k => `cp_${k}${sfx}`;
  return `<div class="u-seg" style="margin-bottom:8px">
      <button type="button" class="on" id="${id('dirAsc')}" onclick="_fuSetRangeDir(${jsArg(sfx)},'asc')">من الفاتحة إلى الناس</button>
      <button type="button" id="${id('dirDesc')}" onclick="_fuSetRangeDir(${jsArg(sfx)},'desc')">من الناس إلى الفاتحة</button>
    </div>
    <div class="u-grid2" style="gap:8px;margin-bottom:8px">
      <div><label ${_FU_LBL}>من سورة</label><select id="${id('fromS')}" onchange="_cpUpdateAyahMax('${id('fromA')}','${id('fromS')}')" class="u-input">${surOpts}</select></div>
      <div><label ${_FU_LBL}>من آية</label><input type="number" inputmode="numeric" id="${id('fromA')}" min="1" value="1" class="u-input u-num" style="text-align:center"></div>
    </div>
    <div class="u-grid2" style="gap:8px;margin-bottom:0">
      <div><label ${_FU_LBL}>إلى سورة</label><select id="${id('toS')}" onchange="_cpUpdateAyahMax('${id('toA')}','${id('toS')}')" class="u-input">${surOpts}</select></div>
      <div><label ${_FU_LBL}>إلى آية</label><input type="number" inputmode="numeric" id="${id('toA')}" min="1" value="1" class="u-input u-num" style="text-align:center"></div>
    </div>`;
}
/* اتجاه نطاق واحد — يعبّئ سورتَي البداية والنهاية بسرعة، ثم يترك للمستخدم ضبط الآيات */
function _fuSetRangeDir(sfx, dir){
  const id = k => `cp_${k}${sfx}`;
  const surs = _tData?.surahs || []; if(!surs.length) return;
  const first = surs[0]||'', last = surs[surs.length-1]||'';
  $(id('dirAsc'))?.classList.toggle('on', dir==='asc');
  $(id('dirDesc'))?.classList.toggle('on', dir==='desc');
  if($(id('fromS'))) $(id('fromS')).value = dir==='desc' ? last : first;
  if($(id('toS'))) $(id('toS')).value = dir==='desc' ? first : last;
  if($(id('fromA'))) $(id('fromA')).value = '1';
  if($(id('toA'))) $(id('toA')).value = '1';
  _cpUpdateAyahMax(id('fromA'), id('fromS'));
  _cpUpdateAyahMax(id('toA'), id('toS'));
}
/* ---------- تعريف الخطة كما أُدخلت: يُستنتج من أورادها (عكس ما يفعله مولّد الخطط في الخادم) ---------- */
function _fuOrd(surah, ayah){
  const surs = _tData?.surahs || [], counts = _tData?.surahCounts || [];
  const i = surs.indexOf(String(surah||'')); if(i < 0) return 0;
  let o = 0; for(let k = 0; k < i; k++) o += counts[k] || 0;
  return o + Math.max(1, Number(ayah) || 1);
}
/* أوراد متتالية في الترتيب = نطاق واحد. المولّد يكتب كل ورد من الأدنى إلى الأعلى،
   فالنطاق التنازلي (من الناس نحو الفاتحة) يتقدّم بأورادٍ كل منها قبل سابقه مباشرة. */
function _fuPlanRanges(items){
  const seq = items.map(p => {
    const a = _fuOrd(p.From_Surah, p.From_Ayah), b = _fuOrd(p.To_Surah, p.To_Ayah);
    return a <= b
      ? { lo:a, hi:b, loS:p.From_Surah, loA:p.From_Ayah, hiS:p.To_Surah, hiA:p.To_Ayah }
      : { lo:b, hi:a, loS:p.To_Surah, loA:p.To_Ayah, hiS:p.From_Surah, hiA:p.From_Ayah };
  }).filter(x => x.lo > 0);
  const runs = [];
  let run = null;
  for(const x of seq){
    if(run){
      const last = run.items[run.items.length - 1];
      const asc = x.lo === last.hi + 1, desc = x.hi === last.lo - 1;
      if((asc && run.dir !== 'desc') || (desc && run.dir !== 'asc')){
        run.dir = run.dir || (asc ? 'asc' : 'desc');
        run.items.push(x);
        continue;
      }
      runs.push(run);
    }
    run = { dir:'', items:[x] };
  }
  if(run) runs.push(run);
  return runs.map(r => {
    const f = r.items[0], l = r.items[r.items.length - 1];
    return r.dir === 'desc'
      ? { fromSurah:f.hiS, fromAyah:Number(f.hiA)||1, toSurah:l.loS, toAyah:Number(l.loA)||1 }
      : { fromSurah:f.loS, fromAyah:Number(f.loA)||1, toSurah:l.hiS, toAyah:Number(l.hiA)||1 };
  });
}
/* المقدار اليومي = الأكثر تكراراً (آخر ورد في كل نطاق قد يكون أقصر) */
function _fuPlanDaily(items){
  const cnt = {};
  items.forEach(p => { const n = Number(p.Amount) || 0; if(n > 0) cnt[n] = (cnt[n] || 0) + 1; });
  let best = 0, bestC = 0;
  Object.keys(cnt).forEach(k => { const n = Number(k), c = cnt[k]; if(c > bestC || (c === bestC && n > best)){ best = n; bestC = c; } });
  return best;
}
/* أوراد الخطة كاملة — بيانات المعلم تحمل آخر ٤٥ يوماً فقط، فنجلب الفصل كله من الخادم */
async function _fuLoadPlanItems(sid, type){
  const cfg = _tData?.planConfig || {};
  let items = [];
  if(cfg.termStart && cfg.termEnd){
    const r = await guard(DS.plansByStudent(sid, cfg.termStart, cfg.termEnd, type), 'تحميل الخطة…');
    if(r && r.success && Array.isArray(r.plans)) items = r.plans.filter(p => p.Source === 'Manual' && p.Type === type);
  }
  if(!items.length) items = (_tData.plans || []).filter(p => String(p.Student_ID) === String(sid) && p.Type === type && p.Source === 'Manual');
  return items.slice().sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
}

/* تعديل الخطة كاملة — نفس نافذة إنشاء الخطة، معبّأة بالخطة كما أُدخلت */
async function openEditFullPlan(sid, type){
  sid = String(sid || _mp.studentId || '');
  type = type === 'revision' ? 'revision' : 'conserve';
  if(!sid) return toast('اختر طالباً','warn');
  const cfg = _tData?.planConfig || {};
  if(!cfg.termStart || !cfg.termEnd) return toast('عيّن بداية ونهاية الفصل من الإعدادات ← أيام الحلقة','warn');
  const items = await _fuLoadPlanItems(sid, type);
  if(!items.length) return toast('لا توجد خطة ' + (type === 'revision' ? 'مراجعة' : 'حفظ') + ' لهذا الطالب — أنشئ خطة جديدة','warn');
  const ranges = _fuPlanRanges(items);
  if(!ranges.length) return toast('تعذّر قراءة مدى الخطة','error');
  const recorded = items.filter(p => (p.Accomplishment_Status || 'Pending') !== 'Pending').length;
  openCreateManualPlan(sid, { type, ranges, daily: _fuPlanDaily(items), recorded });
}
function _fuPrefillPlan(edit){
  if($('cp_type')) $('cp_type').value = edit.type;
  edit.ranges.forEach((rg, i) => {
    if(i > 0) _cpAddRange();
    const sfx = i > 0 ? '_' + _cpRangeCount : '';
    const id = k => `cp_${k}${sfx}`;
    const desc = _fuOrd(rg.fromSurah, rg.fromAyah) > _fuOrd(rg.toSurah, rg.toAyah);
    $(id('dirAsc'))?.classList.toggle('on', !desc);
    $(id('dirDesc'))?.classList.toggle('on', desc);
    if($(id('fromS'))){ $(id('fromS')).value = rg.fromSurah; _cpUpdateAyahMax(id('fromA'), id('fromS')); }
    if($(id('fromA'))) $(id('fromA')).value = rg.fromAyah;
    if($(id('toS'))){ $(id('toS')).value = rg.toSurah; _cpUpdateAyahMax(id('toA'), id('toS')); }
    if($(id('toA'))) $(id('toA')).value = rg.toAyah;
  });
  const r0 = edit.ranges[0];
  const unit = ['full','half','quarter','page'].find(k => qExactAyahs(r0.fromSurah, r0.fromAyah, k) === edit.daily) || 'custom';
  if($('cp_unit')) $('cp_unit').value = unit;
  if($('cp_daily')) $('cp_daily').value = edit.daily || '';
  _mpToggleUnit();
}
function _fuReadPlanForm(){
  const val = id => $(id)?.value;
  const ranges = [];
  const add = sfx => {
    const fS = val('cp_fromS' + sfx), tS = val('cp_toS' + sfx);
    if(fS && tS) ranges.push({ fromSurah:fS, fromAyah:Number(val('cp_fromA' + sfx))||1, toSurah:tS, toAyah:Number(val('cp_toA' + sfx))||1 });
  };
  add('');
  document.querySelectorAll('[id^="cp_range_"]').forEach(div => add('_' + div.id.replace('cp_range_', '')));
  const unit = val('cp_unit') || 'full', r0 = ranges[0];
  const daily = unit === 'custom'
    ? Number(val('cp_daily')) || 0
    : (r0 ? (qExactAyahs(r0.fromSurah, r0.fromAyah, unit) || MP_UNITS[unit]?.ayat || 0) : 0);
  return { type: val('cp_type') === 'revision' ? 'revision' : 'conserve', ranges, daily };
}
async function doSaveFullPlan(sid, origType){
  const cfg = _tData?.planConfig || {};
  if(!cfg.termStart || !cfg.termEnd) return toast('عيّن بداية ونهاية الفصل من الإعدادات ← أيام الحلقة','warn');
  const f = _fuReadPlanForm();
  if(!f.ranges.length) return toast('اختر المدى القرآني','warn');
  if(!f.daily || f.daily < 1) return toast('أدخل مقداراً يومياً صحيحاً','warn');
  const typeChanged = f.type !== origType;
  if(typeChanged && (_tData.plans||[]).some(p => String(p.Student_ID) === String(sid) && p.Type === f.type && p.Source === 'Manual'))
    return toast('لدى الطالب خطة ' + (f.type === 'revision' ? 'مراجعة' : 'حفظ') + ' قائمة — عدّلها هي بدلاً من تغيير النوع','warn');
  const payload = { studentId:sid, type:f.type, startDate:cfg.termStart, endDate:cfg.termEnd, ranges:f.ranges,
    workDays: cfg.workDays?.length ? cfg.workDays : [0,1,2,3,4], dailyAmount:f.daily, replaceExisting:true };
  const r = await guard(DS.planGenerate(payload), 'حفظ الخطة وإعادة توليدها…');
  if(!r || !r.success) return toast((r && r.message) || 'فشل حفظ الخطة','error');
  // الخطة الجديدة حُفظت أولاً؛ عند تغيير النوع نحذف أوراد النوع السابق فقط
  if(typeChanged) await guard(DS.deleteManualPlans(sid, origType), 'حذف الخطة السابقة…');
  closeModal();
  toast('تم حفظ الخطة' + (r.created != null ? ' — ' + r.created + ' ورد' : ''));
  await refreshTeacherStudents();
  if($('fuSubBody')) renderManualPlanTab($('fuSubBody'));
  else if($('settingsSubBody') && _settingsSub === 'allplans') renderAllPlansTab($('settingsSubBody'));
}
function openCreateManualPlan(sid, edit){
  const targetId = sid || _mp.studentId;
  if(!targetId) return toast('اختر طالباً','warn');
  _mp.studentId = targetId;
  _cpRangeCount = 0;
  const {nameMap} = tMaps();
  const name = nameMap[targetId] || targetId;
  const surs = _tData?.surahs || [];
  const surOpts = surs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const unitOpts = Object.entries(MP_UNITS).map(([k,v])=>`<option value="${k}" ${k==='full'?'selected':''}>${v.label}</option>`).join('') + '<option value="custom">مخصّص (بالآيات)</option>';
  const cfg = _tData?.planConfig || {};
  const dayN = ['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
  const cfgInfo = cfg.termStart && cfg.termEnd
    ? `<div class="u-plan" style="background:var(--brand-soft);border-color:transparent;font-size:12.5px;font-weight:600;color:var(--brand-ink);margin-bottom:12px">الفصل: <span class="u-num">${esc(cfg.termStart)}</span> — <span class="u-num">${esc(cfg.termEnd)}</span><br>الأيام: ${(cfg.workDays||[]).map(d=>dayN[d]||d).join('، ')}</div>`
    : `<div class="u-plan" style="background:var(--warn-soft);border-color:transparent;font-size:12.5px;font-weight:600;color:var(--warn);margin-bottom:12px">لم تُعيَّن بيانات الفصل — من الإعدادات ثم أيام الحلقة</div>`;
  const editNote = edit ? `<div class="u-plan" style="background:var(--warn-soft);border-color:transparent;font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:12px">عند الحفظ تُعاد الخطة كاملة على أيام الفصل بالقيم أدناه${edit.recorded ? ` — يُستبدل <span class="u-num">${edit.recorded}</span> ورد مرصود سابقاً، وتبقى نقاطه` : ''}.</div>` : '';
  openModal((edit ? 'تعديل الخطة — ' : 'خطة فصلية — ') + name, `
    ${cfgInfo}
    ${editNote}
    <div class="u-grid2" style="gap:8px">
      <div><label ${_FU_LBL}>النوع</label><select id="cp_type" class="u-input"><option value="conserve">حفظ</option><option value="revision">مراجعة</option></select></div>
      <div><label ${_FU_LBL}>المقدار اليومي</label><select id="cp_unit" onchange="_mpToggleUnit()" class="u-input">${unitOpts}</select></div>
    </div>
    <div id="cp_custom_wrap" class="hidden u-field">
      <label>عدد الآيات في اليوم</label>
      <input type="number" inputmode="numeric" id="cp_daily" min="1" placeholder="10" class="u-input u-num" style="text-align:center">
    </div>
    <div class="u-plan" style="background:var(--card2);margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px">المدى القرآني</div>
      ${_fuRangeHTML('', surOpts)}
      <div id="cp_extra_ranges"></div>
      <button type="button" class="u-btn sm u-btn-s w" style="margin-top:10px" onclick="_cpAddRange()">${svg('plus','w-4 h-4')} نطاق تالٍ</button>
    </div>
    ${edit ? '' : `<label class="u-row" style="gap:8px;font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:14px;cursor:pointer">
      <input type="checkbox" id="cp_replace" style="width:18px;height:18px;accent-color:var(--brand)"> استبدال أي خطة قائمة من النوع نفسه في هذا المدى
    </label>`}
    <div class="u-grid2" style="margin:0">
      <button type="button" class="u-btn u-btn-g" onclick="closeModal()">إلغاء</button>
      ${edit
        ? `<button type="button" class="u-btn u-btn-p" onclick="doSaveFullPlan(${jsArg(targetId)},${jsArg(edit.type)})">حفظ وإعادة التوليد</button>`
        : `<button type="button" class="u-btn u-btn-p" onclick="doCreateManualPlan()">إنشاء الخطة</button>`}
    </div>`);
  if(edit) _fuPrefillPlan(edit);
}
function _fuSetDir(dir){
  const r = document.querySelector(`[name="cp_dir"][value="${dir}"]`); if(r) r.checked = true;
  _mpPlanDirChange();
}
function _mpPlanDirChange(){
  const dir = document.querySelector('[name="cp_dir"]:checked')?.value || 'asc';
  $('cp_dir_asc_lbl')?.classList.toggle('on', dir==='asc');
  $('cp_dir_desc_lbl')?.classList.toggle('on', dir==='desc');
  const surs = _tData?.surahs || [];
  if(!surs.length) return;
  const first = surs[0] || '', last = surs[surs.length-1] || '';
  if($('cp_fromS')) $('cp_fromS').value = dir==='desc' ? last : first;
  if($('cp_toS')) $('cp_toS').value = dir==='desc' ? first : last;
  if($('cp_fromA')) $('cp_fromA').value = '1';
  if($('cp_toA')) $('cp_toA').value = '1';
}
function _cpAddRange(){
  const surs = _tData?.surahs || [];
  const surOpts = surs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const n = ++_cpRangeCount;
  const div = document.createElement('div');
  div.id = `cp_range_${n}`;
  div.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px dashed var(--line2)';
  div.innerHTML = `<div class="u-between" style="margin-bottom:6px">
      <span style="font-size:12.5px;font-weight:700;color:var(--ink2)">نطاق تالٍ <span class="u-num">${n+1}</span></span>
      <button type="button" style="border:0;background:none;font:inherit;font-size:12.5px;font-weight:700;color:var(--bad);cursor:pointer" onclick="this.closest('[id^=cp_range_]').remove()">حذف</button>
    </div>${_fuRangeHTML('_'+n, surOpts)}`;
  const c = $('cp_extra_ranges'); if(c) c.appendChild(div);
}

/* ---------- نافذة تعديل ورد ---------- */
function openEditManualPlan(planId){
  const p = (_tData.plans||[]).find(x=>String(x.Plan_ID)===String(planId));
  if(!p) return toast('لم يُعثر على الورد','error');
  const surs = _tData?.surahs || [], counts = _tData?.surahCounts || [];
  const surOpts = sel => surs.map(s=>`<option value="${esc(s)}" ${s===sel?'selected':''}>${esc(s)}</option>`).join('');
  const ayahMax = s => { const i = surs.indexOf(s); return i>=0 ? (counts[i]||999) : 999; };
  openModal('تعديل ورد هذا اليوم فقط', `
    <div class="u-grid2" style="gap:8px">
      <div><label ${_FU_LBL}>التاريخ</label><input type="date" id="ep_date" value="${esc(p.Date)}" class="u-input u-num"></div>
      <div><label ${_FU_LBL}>النوع</label><select id="ep_type" class="u-input"><option value="conserve" ${p.Type==='conserve'?'selected':''}>حفظ</option><option value="revision" ${p.Type==='revision'?'selected':''}>مراجعة</option></select></div>
    </div>
    <div class="u-plan" style="background:var(--card2);margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px">المدى</div>
      <div class="u-grid2" style="gap:8px;margin-bottom:8px">
        <div><label ${_FU_LBL}>من سورة</label><select id="ep_fromS" onchange="_epUpdateAyahMax('ep_fromA','ep_fromS')" class="u-input">${surOpts(p.From_Surah)}</select></div>
        <div><label ${_FU_LBL}>من آية</label><input type="number" inputmode="numeric" id="ep_fromA" min="1" max="${ayahMax(p.From_Surah)}" value="${esc(p.From_Ayah||1)}" class="u-input u-num" style="text-align:center"></div>
      </div>
      <div class="u-grid2" style="gap:8px;margin:0">
        <div><label ${_FU_LBL}>إلى سورة</label><select id="ep_toS" onchange="_epUpdateAyahMax('ep_toA','ep_toS')" class="u-input">${surOpts(p.To_Surah)}</select></div>
        <div><label ${_FU_LBL}>إلى آية</label><input type="number" inputmode="numeric" id="ep_toA" min="1" max="${ayahMax(p.To_Surah)}" value="${esc(p.To_Ayah||1)}" class="u-input u-num" style="text-align:center"></div>
      </div>
    </div>
    <div class="u-grid2" style="margin:0">
      <button type="button" class="u-btn u-btn-g" onclick="closeModal()">إلغاء</button>
      <button type="button" class="u-btn u-btn-p" onclick="doSaveEditPlan(${jsArg(planId)})">حفظ التعديل</button>
    </div>`);
}
async function doSaveEditPlan(planId){
  const upd = { Date: $('ep_date').value, Type: $('ep_type').value, From_Surah: $('ep_fromS').value, From_Ayah: String($('ep_fromA').value||1), To_Surah: $('ep_toS').value, To_Ayah: String($('ep_toA').value||1) };
  const r = await guard(DS.updatePlan(planId, upd), 'حفظ…');
  if(!r || !r.success) return toast((r && r.message) || 'فشل الحفظ','error');
  const p = (_tData.plans||[]).find(x => String(x.Plan_ID)===String(planId));
  if(p) Object.assign(p, upd);
  closeModal();
  toast('تم التعديل');
  if($('fuSubBody')) renderManualPlanTab($('fuSubBody'));
  else if($('settingsSubBody') && _settingsSub === 'allplans') renderAllPlansTab($('settingsSubBody'));
}
