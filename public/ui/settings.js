/* =====================================================================
   المعلم: تبويب «الإعدادات» — نسخة v6 متقدّمة ومبسّطة
   يُحمَّل بعد الكود الرئيسي في index.html، فيستبدل الدوال التالية
   بالأسماء نفسها:
     renderSettingsTab, renderItemsTab, renderAccountsTab,
     renderAuditTab, renderPushAdminTab, renderAppearanceTab,
     renderManageTab
   مع إبقاء كل IDs التي تعتمد عليها معالجات أخرى (eu_*, ei_*, g_name,
   uacc_*, pp_*, ap_*, audit_*, grp_search ...).
   ===================================================================== */

/* ---------- حالة جديدة (لا تُعيد تعريف ما هو موجود في index.html) ---------- */
if(typeof _settingsSub!=='undefined' && _settingsSub==='students') _settingsSub='overview';
window._itSearch   = window._itSearch   || '';
window._itFilter   = window._itFilter   || 'all';    // all | pos | neg | linked | unlinked
window._itEditing  = window._itEditing  || null;     // Item_ID الذي يُحرَّر داخلياً
window._accSearch  = window._accSearch  || '';
window._accEditing = window._accEditing || null;     // User ID الذي يُحرَّر داخلياً
window._accAddOpen = !!window._accAddOpen;           // هل نموذج الإضافة مفتوح؟
window._auditFrom  = window._auditFrom  || '';
window._auditTo    = window._auditTo    || '';

/* ---------- خريطة التسميات والأيقونات لتبويبات الإعدادات ---------- */
const _SETTINGS_META = {
  students:   { icon:'users',    label:'الطلاب',          desc:'إضافة وتعديل وحذف الطلاب' },
  accounts:   { icon:'lock',     label:'الحسابات',        desc:'المعلمون وأولياء الأمور' },
  groups:     { icon:'users',    label:'المجموعات',       desc:'تنظيم الطلاب في مجموعات' },
  items:      { icon:'coin',     label:'بنود النقاط',     desc:'تعريف نقاط المكافأة والجزاء' },
  audit:      { icon:'history',  label:'سجل النقاط',      desc:'كل عمليات منح وخصم النقاط' },
  plandays:   { icon:'calendar', label:'أيام الحلقة',     desc:'بداية ونهاية الفصل وأيامه' },
  allplans:   { icon:'book',     label:'خطط الطلاب',      desc:'عرض وتعديل خطط الحفظ والمراجعة' },
  push:       { icon:'bell',     label:'الإشعارات',       desc:'سياسة الإشعارات والجمهور' },
  appearance: { icon:'cog',      label:'المظهر',          desc:'الشعار واسم الحلقة والهوية' },
  reset:      { icon:'trash',    label:'تصفير البيانات',  desc:'حذف جميع البيانات (للمشرف)' }
};

function _settingsLabel(k){ return (_SETTINGS_META[k]||{}).label || 'الإعدادات'; }
function _setSub(k){ _settingsSub = k || 'overview'; renderSettingsTab($('portal')); }

/* ---------- بطاقة في شبكة النظرة العامة ---------- */
function _ovCard(key, badge, danger){
  const m = _SETTINGS_META[key]; if(!m) return '';
  const col = danger ? 'var(--bad)' : 'var(--brand-ink)';
  const bg  = danger ? 'var(--bad-soft)' : 'var(--brand-soft)';
  const b   = badge
    ? `<span class="u-pill ${danger?'bad':'brand'}" style="font-size:11px;flex-shrink:0">${badge}</span>`
    : '';
  return `<button type="button" class="u-card" style="padding:14px;text-align:right;cursor:pointer;display:flex;flex-direction:column;align-items:stretch;gap:10px;min-width:0;${danger?'border-color:var(--bad-soft)':''}" onclick="_setSub(${jsArg(key)})">
    <div class="u-row" style="gap:10px;align-items:flex-start">
      <div class="u-avatar" style="width:40px;height:40px;background:${bg};color:${col};flex-shrink:0">${svg(m.icon,'w-5 h-5')}</div>
      <div class="u-grow" style="text-align:right;min-width:0">
        <div class="u-name name-full" style="font-weight:700;font-size:14.5px">${esc(m.label)}</div>
        <div class="u-muted" style="margin-top:2px;font-size:11.5px;line-height:1.5">${esc(m.desc)}</div>
      </div>
    </div>
    ${b?`<div style="display:flex;justify-content:flex-end">${b}</div>`:''}
  </button>`;
}

/* ---------- شريط التنقل العلوي داخل تبويب فرعي ---------- */
function _settingsSubChips(active){
  const chip = (k)=>{
    const m = _SETTINGS_META[k]; if(!m) return '';
    const admin = !!(currentUser && currentUser.isAdmin);
    if(k==='push' && !admin) return '';
    if(k==='reset' && !admin) return '';
    const danger = (k==='reset');
    const on = (active===k);
    const style = danger
      ? (on ? 'background:var(--bad);border-color:var(--bad);color:#fff'
            : 'color:var(--bad);border-color:var(--bad-soft)')
      : '';
    return `<button type="button" class="u-chip ${on?'on':''}" style="${style}" onclick="_setSub(${jsArg(k)})">${esc(m.label)}</button>`;
  };
  const order = ['students','accounts','groups','items','audit','plandays','allplans','appearance','push','reset'];
  return `<div class="u-chips" id="settingsChips" style="margin-bottom:14px">
    <button type="button" class="u-chip" onclick="_setSub('overview')">${svg('arrowdown','w-4 h-4')} الكل</button>
    ${order.map(chip).join('')}
  </div>`;
}

/* ===================================================================== */
/*                       1) renderSettingsTab                             */
/* ===================================================================== */
function renderSettingsTab(body){
  if(!body) return;
  const admin = !!(currentUser && currentUser.isAdmin);

  if(!_settingsSub || _settingsSub==='overview'){
    const d = _tData || {};
    const sCount = (d.students||[]).length;
    const gCount = (d.groups||[]).length;
    const iCount = (d.items||[]).length;
    const nCount = (d.news||[]).length;
    const pCount = (d.plans||[]).filter(p=>p.Source==='Manual').length;
    const planConfig = d.planConfig || {};
    const hasTerm = !!(planConfig.termStart && planConfig.termEnd);
    const studentsBadge = sCount ? `<span class="u-num">${sCount}</span> طالب` : '';
    const groupsBadge   = gCount ? `<span class="u-num">${gCount}</span> مجموعة` : '';
    const itemsBadge    = iCount ? `<span class="u-num">${iCount}</span> بند` : '';
    const planBadge     = hasTerm ? 'مُعيَّن' : 'لم يُعيَّن';
    const plansBadge    = pCount ? `<span class="u-num">${new Set((d.plans||[]).filter(p=>p.Source==='Manual').map(p=>p.Student_ID)).size}</span> طالب` : '';

    body.innerHTML = `<div class="u-page fade-in">
      <div class="u-top">
        <div class="u-grow">
          <div class="u-sub">إدارة الحلقة ومنصّة الرصد</div>
          <h1>الإعدادات</h1>
        </div>
      </div>

      <div class="u-section">البيانات</div>
      <div class="u-grid2" style="margin-bottom:12px">
        ${_ovCard('students', studentsBadge)}
        ${_ovCard('groups',   groupsBadge)}
        ${_ovCard('accounts', '')}
        ${_ovCard('items',    itemsBadge)}
      </div>

      <div class="u-section">المتابعة والخطط</div>
      <div class="u-grid2" style="margin-bottom:12px">
        ${_ovCard('plandays', planBadge)}
        ${_ovCard('allplans', plansBadge)}
        ${_ovCard('audit',    '')}
      </div>

      <div class="u-section">المنصّة</div>
      <div class="u-grid2" style="margin-bottom:12px">
        ${_ovCard('appearance', '')}
        ${admin ? _ovCard('push', '') : ''}
      </div>

      ${admin ? `<div class="u-section" style="color:var(--bad)">منطقة حسّاسة</div>
        <div class="u-grid2" style="margin-bottom:12px">
          ${_ovCard('reset','', true)}
        </div>` : ''}
    </div>`;
    return;
  }

  const label = _settingsLabel(_settingsSub);
  body.innerHTML = `<div class="u-page fade-in">
    <div class="u-top">
      <button type="button" class="u-icon-btn" title="رجوع إلى الإعدادات" aria-label="رجوع" onclick="_setSub('overview')">${svg('arrowdown','w-5 h-5')}</button>
      <div class="u-grow">
        <div class="u-sub">الإعدادات</div>
        <h1>${esc(label)}</h1>
      </div>
    </div>
    ${_settingsSubChips(_settingsSub)}
    <div id="settingsSubBody"></div>
  </div>`;
  requestAnimationFrame(()=>{ document.querySelector('#settingsChips .u-chip.on')?.scrollIntoView({block:'nearest', inline:'center'}); });

  const sub = $('settingsSubBody');
  const map = {
    students: typeof renderStudentsTab==='function' ? renderStudentsTab : null,
    accounts: renderAccountsTab,
    groups:   renderManageTab,
    items:    renderItemsTab,
    audit:    renderAuditTab,
    plandays: typeof renderPlanDaysTab==='function' ? renderPlanDaysTab : null,
    allplans: typeof renderAllPlansTab==='function' ? renderAllPlansTab : null,
    push:     renderPushAdminTab,
    appearance: renderAppearanceTab,
    reset:    typeof renderResetTab==='function' ? renderResetTab : null
  };
  const fn = map[_settingsSub] || renderItemsTab;
  fn(sub);
}


/* ===================================================================== */
/*                       2) بنود النقاط — متقدّم                           */
/* ===================================================================== */
function _itVisibleItems(){
  let list = (_tData && _tData.items) || [];
  const s = (_itSearch||'').trim();
  if(s) list = list.filter(i => arMatches(i.Description||'', s));
  if(_itFilter==='pos')      list = list.filter(i => Number(i.Point_Value)>=0);
  else if(_itFilter==='neg') list = list.filter(i => Number(i.Point_Value)<0);
  else if(_itFilter==='linked')   list = list.filter(i => (i.Trigger||'none')!=='none');
  else if(_itFilter==='unlinked') list = list.filter(i => (i.Trigger||'none')==='none');
  return list;
}

function renderItemsTab(body){
  body = body || $('settingsSubBody'); if(!body) return;
  const items  = (_tData && _tData.items) || [];
  const posN   = items.filter(i => Number(i.Point_Value)>=0).length;
  const negN   = items.length - posN;
  const linkedN = items.filter(i => (i.Trigger||'none')!=='none').length;

  const chip = (k, lbl, n)=>`<button type="button" class="u-chip ${_itFilter===k?'on':''}" onclick="itSetFilter(${jsArg(k)})">${esc(lbl)}${n!=null?` <span class="u-num">${n}</span>`:''}</button>`;

  body.innerHTML = `<div class="fade-in" style="max-width:900px;margin:0 auto">
    <div class="u-card">
      <div class="u-card-h">
        <h3>${svg('plus','w-5 h-5')} إضافة بند جديد</h3>
        <button type="button" class="u-link" onclick="itFocusAdd()">إخفاء/إظهار</button>
      </div>
      <div id="it_add_wrap">
        <div class="u-grid2" style="margin-bottom:10px">
          <div class="u-field" style="margin:0"><label for="it_desc">وصف البند</label><input id="it_desc" class="u-input" placeholder="مثال: حفظ ممتاز"></div>
          <div class="u-field" style="margin:0"><label for="it_val">قيمة النقاط</label><input id="it_val" type="number" class="u-input num" placeholder="+5 أو -3"></div>
        </div>
        <div class="u-field"><label for="it_trig">الربط التلقائي بنظام المتابعة</label>
          <select id="it_trig" class="u-input">${TRIGGER_OPTS.map(t=>`<option value="${t[0]}">${t[1]}</option>`).join('')}</select>
        </div>
        <div class="u-note brand" style="margin-bottom:12px">عند اختيار «ربط تلقائي» تُمنح النقاط آلياً للطالب حين يُسجَّل الحدث المرتبط (مرة واحدة في اليوم).</div>
        <button onclick="doAddItem()" class="u-btn u-btn-p w">${svg('check','w-4 h-4')} حفظ البند</button>
      </div>
    </div>

    <div class="u-card">
      <div class="u-card-h"><h3>${svg('history','w-5 h-5')} البنود الحالية</h3>
        <span class="u-pill mute"><span class="u-num" id="it_count">${items.length}</span></span>
      </div>
      <div class="u-search">${svg('search','w-5 h-5')}
        <input type="search" value="${esc(_itSearch||'')}" oninput="itSearch(this.value)" placeholder="ابحث عن بند…" enterkeyhint="search" autocomplete="off">
      </div>
      <div class="u-chips" style="margin-bottom:10px">
        ${chip('all','الكل', items.length)}
        ${chip('pos','موجبة', posN)}
        ${chip('neg','سالبة', negN)}
        ${chip('linked','مربوطة', linkedN)}
        ${chip('unlinked','بدون ربط', items.length-linkedN)}
      </div>
      <div id="it_list"></div>
    </div>
  </div>`;
  _itRenderList();
}

function itSetFilter(k){ _itFilter = k || 'all'; _itEditing = null; _itRenderList(); }
function itSearch(v){ _itSearch = v || ''; _itEditing = null; _itRenderList(); }
function itFocusAdd(){
  const w = $('it_add_wrap'); if(w) w.classList.toggle('hidden');
}

function _itRenderList(){
  const box = $('it_list'); if(!box) return;
  const list = _itVisibleItems();
  const c = $('it_count'); if(c) c.textContent = list.length;

  if(!list.length){
    box.innerHTML = `<div class="u-empty">${svg('search','w-8 h-8')}لا يوجد بنود مطابقة
      ${(_itSearch || _itFilter!=='all') ? `<div style="margin-top:10px"><button type="button" class="u-btn u-btn-g sm" onclick="_itSearch='';_itFilter='all';renderItemsTab($('settingsSubBody'))">إعادة ضبط</button></div>`:''}
    </div>`;
    return;
  }

  box.innerHTML = list.map(_itRow).join('');
}

function _itRow(i){
  const id = i.Item_ID;
  const pos = Number(i.Point_Value)>=0;
  const trig = i.Trigger || 'none';
  const trigLbl = triggerLabel(trig);
  const editing = String(_itEditing)===String(id);

  if(editing){
    return `<div class="u-plan" style="padding:12px;border-color:var(--brand-ink)">
      <div class="u-grid2" style="margin-bottom:8px">
        <div class="u-field" style="margin:0"><label>الوصف</label><input id="ei_desc" value="${esc(i.Description)}" class="u-input" autofocus></div>
        <div class="u-field" style="margin:0"><label>القيمة</label><input id="ei_val" type="number" value="${esc(i.Point_Value)}" class="u-input num"></div>
      </div>
      <div class="u-field" style="margin-bottom:8px"><label>الربط التلقائي</label>
        <select id="ei_trig" class="u-input">${TRIGGER_OPTS.map(t=>`<option value="${t[0]}" ${t[0]===trig?'selected':''}>${t[1]}</option>`).join('')}</select>
      </div>
      <div class="u-grid2" style="margin:0">
        <button type="button" class="u-btn u-btn-g" onclick="itCancelEdit()">إلغاء</button>
        <button type="button" class="u-btn u-btn-p" onclick="saveEditItem(${jsArg(id)})">${svg('check','w-4 h-4')} حفظ التغييرات</button>
      </div>
    </div>`;
  }

  const trigPill = trig==='none'
    ? `<span class="u-pill mute">بدون ربط</span>`
    : `<span class="u-pill info">${esc(trigLbl)}</span>`;

  return `<div class="u-plan u-row" style="gap:12px;padding:12px;align-items:center">
    <div class="u-avatar" style="width:48px;height:48px;border-radius:14px;font-size:16px;background:${pos?'var(--ok-soft)':'var(--bad-soft)'};color:${pos?'var(--ok)':'var(--bad)'}">${pos?'+':''}${esc(i.Point_Value)}</div>
    <div class="u-grow" style="min-width:0">
      <div class="u-name">${esc(i.Description)}</div>
      <div style="margin-top:4px">${trigPill}</div>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0">
      <button type="button" aria-label="تعديل" title="تعديل" onclick="itStartEdit(${jsArg(id)})" class="u-icon-btn" style="width:36px;height:36px">${svg('edit','w-4 h-4')}</button>
      <button type="button" aria-label="حذف" title="حذف" onclick="confirmDeleteItem(${jsArg(id)},${jsArg(i.Description)})" class="u-icon-btn" style="width:36px;height:36px;color:var(--bad)">${svg('trash','w-4 h-4')}</button>
    </div>
  </div>`;
}

function itStartEdit(id){ _itEditing = id; _itRenderList(); }
function itCancelEdit(){ _itEditing = null; _itRenderList(); }

/* نُعيد تعريف saveEditItem لتعمل مع التحرير المضمَّن (نفس حقول ei_* داخل الصف) */
async function saveEditItem(id){
  const upd = {
    Description: ($('ei_desc')?.value||'').trim(),
    Point_Value: Number($('ei_val')?.value) || 0,
    Trigger: $('ei_trig')?.value || 'none'
  };
  if(!upd.Description) return toast('الوصف مطلوب','warn');
  const r = await guard(DS.updatePointItem(id, upd), 'حفظ…');
  if(!r || !r.success) return toast((r&&r.message)||'فشل','error');
  const it = (_tData.items||[]).find(x => String(x.Item_ID)===String(id));
  if(it) Object.assign(it, upd);
  _itEditing = null;
  toast('تم التحديث');
  _itRenderList();
}


/* ===================================================================== */
/*                   3) الحسابات — متقدّم: قائمة موحّدة                     */
/* ===================================================================== */
async function renderAccountsTab(body){
  body = body || $('settingsSubBody'); if(!body) return;
  body.innerHTML = `<div class="u-empty">${svg('users','w-8 h-8')}<div style="margin-top:8px">تحميل الحسابات…</div></div>`;
  const r = await guard(DS.listUsers(), 'تحميل الحسابات…');
  if(!r || !r.success){
    body.innerHTML = `<div class="u-card"><div class="u-empty" style="color:var(--bad)">فشل تحميل الحسابات</div></div>`;
    return;
  }
  const list     = r.users || [];
  const teachers = list.filter(u=>u.Role==='Teacher');
  const parents  = list.filter(u=>u.Role==='Parent');
  const isAdmin  = !!(currentUser && currentUser.isAdmin);
  const orphans  = (_tData?.students||[]).filter(s=>!s.Parent_ID).length;
  const sdIds    = new Set((_tData?.students||[]).map(s=>s.Student_ID));
  const unlinked = list.filter(u=>u.Role==='Student' && !sdIds.has(u.ID)).length;

  if(_accSub!=='Teacher' && _accSub!=='Parent') window._accSub = 'Teacher';
  const activeList = (_accSub==='Teacher') ? teachers : parents;

  const chip = (k, lbl, n)=>`<button type="button" class="u-chip ${_accSub===k?'on':''}" onclick="accSetSub(${jsArg(k)})">${esc(lbl)} <span class="u-num">${n}</span></button>`;

  const alerts = [];
  if(orphans>0){
    alerts.push(`<div class="u-plan" style="background:var(--gold-soft);border-color:transparent">
      <div class="u-row" style="gap:10px"><div style="color:var(--gold)">${svg('users','w-6 h-6')}</div>
      <div class="u-grow"><div class="u-name"><b>${orphans}</b> طالب بدون ولي أمر</div>
      <div class="u-muted" style="margin-top:2px">أنشئ حسابات أولياء أمور تلقائياً بكلمات مرور مؤقّتة.</div></div>
      <button type="button" class="u-btn u-btn-p sm" onclick="doAutoCreateParents()">إنشاء</button></div></div>`);
  }
  if(unlinked>0){
    alerts.push(`<div class="u-plan" style="background:var(--info-soft);border-color:transparent">
      <div class="u-row" style="gap:10px"><div style="color:var(--info)">${svg('users','w-6 h-6')}</div>
      <div class="u-grow"><div class="u-name"><b>${unlinked}</b> حساب طالب غير مرتبط</div>
      <div class="u-muted" style="margin-top:2px">حسابات طلاب موجودة بلا سجل بيانات.</div></div>
      <button type="button" class="u-btn u-btn-p sm" onclick="doAutoCreateStudentAccounts()">ربط</button></div></div>`);
  }

  body.innerHTML = `<div class="fade-in" style="max-width:900px;margin:0 auto">
    ${alerts.join('')}

    <div class="u-card">
      <div class="u-card-h">
        <h3>${svg('plus','w-5 h-5')} إضافة حساب جديد</h3>
        <button type="button" class="u-link" onclick="accToggleAdd()">${_accAddOpen?'إخفاء':'إظهار النموذج'}</button>
      </div>
      <div id="acc_add_wrap" class="${_accAddOpen?'':'hidden'}">
        <div class="u-grid2">
          <div class="u-field" style="margin:0"><label for="uacc_role">نوع الحساب</label>
            <select id="uacc_role" class="u-input" onchange="accRoleChange()">
              ${isAdmin?'<option value="Teacher">معلم</option>':''}
              <option value="Parent">ولي أمر</option>
            </select>
          </div>
          <div class="u-field" style="margin:0"><label for="uacc_name">الاسم الكامل</label>
            <input id="uacc_name" class="u-input" placeholder="مثال: أحمد محمد">
          </div>
        </div>
        <div class="u-grid2">
          <div class="u-field" style="margin:0"><label for="uacc_id">المعرّف (اختياري)</label>
            <input id="uacc_id" class="u-input" placeholder="يُولَّد تلقائياً">
          </div>
          <div class="u-field" style="margin:0"><label for="uacc_pass">كلمة المرور</label>
            <input id="uacc_pass" class="u-input" placeholder="••••••">
          </div>
        </div>
        ${isAdmin ? `<label id="uacc_admin_wrap" class="${_accSub==='Teacher'?'':'hidden'}" style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:12px">
          <input type="checkbox" id="uacc_admin" style="width:16px;height:16px;accent-color:var(--brand)"> منح صلاحية مشرف عام
        </label>` : `<div class="u-note brand">إضافة حسابات المعلمين مقصورة على المشرف.</div>`}
        <button onclick="doAddUser()" class="u-btn u-btn-p w">${svg('check','w-4 h-4')} إضافة الحساب</button>
      </div>
    </div>

    <div class="u-card">
      <div class="u-card-h"><h3>${svg('users','w-5 h-5')} الحسابات الحالية</h3></div>
      <div class="u-chips" style="margin-bottom:10px">
        ${chip('Teacher','المعلمون', teachers.length)}
        ${chip('Parent','أولياء الأمور', parents.length)}
      </div>
      <div class="u-search">${svg('search','w-5 h-5')}
        <input type="search" value="${esc(_accSearch||'')}" oninput="accSearch(this.value)" placeholder="ابحث بالاسم أو المعرّف…" autocomplete="off">
      </div>
      <div id="acc_list"></div>
    </div>
  </div>`;

  _accRenderList(activeList);
}

function accSetSub(k){ _accSub = k; _accEditing = null; renderAccountsTab($('settingsSubBody')); }
function accSearch(v){ _accSearch = v||''; _accEditing = null; _accRenderList(); }
function accToggleAdd(){
  _accAddOpen = !_accAddOpen;
  const w = $('acc_add_wrap'); if(w) w.classList.toggle('hidden', !_accAddOpen);
}

function _accRenderList(preList){
  const box = $('acc_list'); if(!box) return;
  const r = (_tData || {});
  const {nameMap} = tMaps();
  const list = (preList || (_accSub==='Teacher'
    ? (window._accCache?.teachers||[])
    : (window._accCache?.parents||[])));
  // كاش بسيط ليعمل accSearch بدون إعادة طلب للخادم
  if(preList) window._accCache = { teachers: preList.filter(u=>u.Role==='Teacher'), parents: preList.filter(u=>u.Role==='Parent') };

  const s = (_accSearch||'').trim();
  const filtered = list.filter(u => !s || arMatches(u.Name||'', s) || arMatches(String(u.ID||''), s));
  const isAdmin = !!(currentUser && currentUser.isAdmin);

  if(!filtered.length){
    box.innerHTML = `<div class="u-empty">${svg('search','w-8 h-8')}لا نتائج${s?` لـ «${esc(s)}»`:''}
      ${s?`<div style="margin-top:10px"><button type="button" class="u-btn u-btn-g sm" onclick="accSearch('')">مسح البحث</button></div>`:''}
    </div>`;
    return;
  }

  const parentChildrenList = (pid)=>{
    return (_tData?.students||[]).filter(s=>String(s.Parent_ID)===String(pid))
      .map(s=>esc(nameMap[s.Student_ID]||s.Student_ID)).join('، ');
  };

  box.innerHTML = filtered.map(u => _accRow(u, isAdmin, parentChildrenList)).join('');
}

function _accRow(u, isAdmin, parentChildrenList){
  const isSelf = String(u.ID)===String(currentUser?.ID);
  const canManage = u.Role==='Parent' || isAdmin;
  const canDelete = canManage && !isSelf;
  const editing = String(_accEditing)===String(u.ID);

  if(editing){
    return `<div class="u-plan" style="border-color:var(--brand-ink);padding:12px">
      <div class="u-field" style="margin-bottom:8px"><label>الاسم</label>
        <input id="eu_name" value="${esc(u.Name||'')}" class="u-input" autofocus>
      </div>
      <div class="u-field" style="margin-bottom:8px"><label>كلمة مرور جديدة (اتركها فارغة لعدم التغيير)</label>
        <input id="eu_pass" placeholder="••••" class="u-input" type="text">
      </div>
      <div class="u-note brand" style="margin-bottom:10px">المعرّف: <span class="u-num" dir="ltr">${esc(u.ID)}</span> · النوع: ${u.Role==='Teacher'?'معلم':'ولي أمر'}</div>
      <div class="u-grid2" style="margin:0">
        <button type="button" class="u-btn u-btn-g" onclick="accCancelEdit()">إلغاء</button>
        <button type="button" class="u-btn u-btn-p" onclick="doSaveUser(${jsArg(u.ID)})">${svg('check','w-4 h-4')} حفظ</button>
      </div>
    </div>`;
  }

  const children = (u.Role==='Parent' && u.ChildrenCount) ? parentChildrenList(u.ID) : '';
  return `<div class="u-plan u-row" style="gap:10px;padding:12px;align-items:flex-start">
    <div class="u-avatar">${esc((u.Name||'?').charAt(0))}</div>
    <div class="u-grow" style="min-width:0">
      <div class="u-name">${esc(u.Name)}
        ${u.IsAdmin?'<span class="u-pill gold" style="margin-right:6px">مشرف</span>':''}
        ${isSelf?'<span class="u-pill mute" style="margin-right:6px">أنت</span>':''}
      </div>
      <div class="u-muted" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:10px">
        <span dir="ltr">${esc(u.ID)}</span>
        ${u.Role==='Parent'?`<span><span class="u-num">${u.ChildrenCount||0}</span> أبناء</span>`:''}
      </div>
      ${children?`<div class="u-muted" style="margin-top:4px;color:var(--brand-ink);font-size:11.5px">الأبناء: ${children}</div>`:''}
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0">
      ${canManage?`<button type="button" aria-label="تعديل" title="تعديل" onclick="accStartEdit(${jsArg(u.ID)})" class="u-icon-btn" style="width:36px;height:36px">${svg('edit','w-4 h-4')}</button>`:''}
      ${canDelete?`<button type="button" aria-label="حذف" title="حذف" onclick="confirmDeleteUser(${jsArg(u.ID)},${jsArg(u.Name)},${jsArg(u.Role)})" class="u-icon-btn" style="width:36px;height:36px;color:var(--bad)">${svg('trash','w-4 h-4')}</button>`:''}
      ${u.Role==='Teacher'&&!isAdmin?`<span class="u-icon-btn" style="width:36px;height:36px;color:var(--ink3)" title="يُدار بواسطة المشرف">${svg('lock','w-4 h-4')}</span>`:''}
    </div>
  </div>`;
}

function accStartEdit(id){ _accEditing = id; _accRenderList(); }
function accCancelEdit(){ _accEditing = null; _accRenderList(); }


/* ===================================================================== */
/*                 4) سجل النقاط — متقدّم: فلاتر تاريخ + تصدير              */
/* ===================================================================== */
async function renderAuditTab(body){
  body = body || $('settingsSubBody'); if(!body) return;
  body.innerHTML = `<div class="u-empty">${svg('history','w-8 h-8')}<div style="margin-top:8px">تحميل السجل…</div></div>`;
  const r = await guard(DS.getAudit(), 'تحميل سجل النقاط…');
  if(!r || !r.success){
    body.innerHTML = `<div class="u-card"><div class="u-empty" style="color:var(--bad)">فشل تحميل السجل</div></div>`;
    return;
  }
  _auditLogs = r.logs || [];
  _auditSearch = '';
  // تعبئة الحدود الافتراضية للتاريخ من السجل نفسه
  if(_auditLogs.length){
    const dates = _auditLogs.map(l=>String(l.date||'').slice(0,10)).filter(Boolean).sort();
    if(!_auditFrom) _auditFrom = dates[0] || '';
    if(!_auditTo)   _auditTo   = dates[dates.length-1] || '';
  }

  body.innerHTML = `<div class="fade-in">
    <div class="u-card">
      <div class="u-card-h">
        <h3>${svg('history','w-5 h-5')} سجل النقاط</h3>
        <span class="u-pill mute" id="audit_count">${_auditLogs.length}</span>
      </div>
      <div class="u-grid2" style="margin-bottom:10px">
        <div class="u-field" style="margin:0"><label>من</label>
          <input id="audit_from" type="date" value="${esc(_auditFrom)}" oninput="auditDateChange()" class="u-input num">
        </div>
        <div class="u-field" style="margin:0"><label>إلى</label>
          <input id="audit_to" type="date" value="${esc(_auditTo)}" oninput="auditDateChange()" class="u-input num">
        </div>
      </div>
      <div class="u-search">${svg('search','w-5 h-5')}
        <input id="audit_search" value="${esc(_auditSearch||'')}" oninput="auditSearch(this.value)" placeholder="بحث باسم الطالب أو البند…" autocomplete="off">
      </div>
      <div class="u-row" style="justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        <button type="button" class="u-btn u-btn-g sm" onclick="auditClearFilters()">${svg('ban','w-4 h-4')} مسح الفلاتر</button>
        <button type="button" class="u-btn u-btn-s sm" onclick="auditExportCsv()">${svg('arrowup','w-4 h-4')} تصدير CSV</button>
      </div>
      <div class="u-note brand" style="margin-bottom:8px">يُعرض أحدث ٢٠٠ عملية. السجلات المرتبطة بورد أو حضور تُلغى من شاشة المتابعة.</div>
      <div style="max-height:60vh;overflow:auto;border:1px solid var(--line);border-radius:14px">
        <table class="w-full text-right" style="font-size:13px;border-collapse:collapse;width:100%">
          <thead style="position:sticky;top:0;background:var(--card2);z-index:1">
            <tr style="color:var(--ink2);font-weight:700;font-size:12px">
              <th style="padding:10px">التاريخ</th>
              <th style="padding:10px">الطالب</th>
              <th style="padding:10px">البند</th>
              <th style="padding:10px">النقاط</th>
              <th style="padding:10px">بواسطة</th>
              <th style="padding:10px;width:36px"></th>
            </tr>
          </thead>
          <tbody id="audit_tbody"></tbody>
        </table>
      </div>
    </div>
  </div>`;
  renderAuditRows();
}

function auditDateChange(){
  _auditFrom = $('audit_from')?.value || '';
  _auditTo   = $('audit_to')?.value || '';
  renderAuditRows();
}
function auditClearFilters(){
  _auditSearch = ''; _auditFrom = ''; _auditTo = '';
  const el = $('audit_search'); if(el) el.value = '';
  const f  = $('audit_from');   if(f)  f.value  = '';
  const t  = $('audit_to');     if(t)  t.value  = '';
  renderAuditRows();
}

function _auditFiltered(){
  let logs = _auditLogs || [];
  if(_auditSearch){
    const q = _auditSearch;
    logs = logs.filter(l => arMatches(l.studentName||'', q) || arMatches(l.itemDesc||'', q));
  }
  if(_auditFrom) logs = logs.filter(l => String(l.date||'').slice(0,10) >= _auditFrom);
  if(_auditTo)   logs = logs.filter(l => String(l.date||'').slice(0,10) <= _auditTo);
  return logs;
}

/* نُعيد تعريف renderAuditRows لتحترم فلاتر التاريخ أيضاً */
function renderAuditRows(){
  const logs = _auditFiltered();
  const tb = $('audit_tbody');
  if(!tb) return;
  if(!logs.length){
    tb.innerHTML = `<tr><td colspan="6" style="padding:28px;text-align:center;color:var(--ink3);font-weight:700">لا نتائج</td></tr>`;
  } else {
    tb.innerHTML = logs.map(l => {
      const p = Number(l.points)||0;
      return `<tr style="border-top:1px solid var(--line)" data-audit-id="${esc(l.id||'')}">
        <td style="padding:10px;color:var(--ink3);font-size:12px;white-space:nowrap">${esc(l.date)}</td>
        <td style="padding:10px;color:var(--ink);font-weight:700">${esc(l.studentName||'')}</td>
        <td style="padding:10px;color:var(--ink2)">${esc(l.itemDesc||'')}</td>
        <td style="padding:10px"><span class="u-pill ${p>=0?'ok':'bad'}">${p>=0?'+':''}${esc(l.points)}</span></td>
        <td style="padding:10px;color:var(--ink3);font-size:12px">${esc(l.teacherName||'')}</td>
        <td style="padding:10px">${l.auto
          ? `<span style="color:var(--ink3)" title="مرتبط بورد/حضور">${svg('lock','w-4 h-4')}</span>`
          : `<button type="button" class="u-icon-btn" style="width:30px;height:30px;color:var(--bad)" title="حذف السجل" onclick="confirmDeleteAuditLog(${jsArg(l.id||'')},${jsArg(l.studentName||'')},${jsArg(l.itemDesc||'')},${jsArg(String(p))})">${svg('trash','w-4 h-4')}</button>`}
        </td>
      </tr>`;
    }).join('');
  }
  const c = $('audit_count'); if(c) c.textContent = logs.length;
}

function auditExportCsv(){
  const logs = _auditFiltered();
  if(!logs.length) return toast('لا شيء للتصدير','warn');
  const rows = [['التاريخ','الطالب','البند','النقاط','بواسطة']];
  logs.forEach(l => rows.push([
    String(l.date||''), String(l.studentName||''), String(l.itemDesc||''),
    String(l.points||0), String(l.teacherName||'')
  ]));
  const csv = '﻿' + rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_${ymd(new Date())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 200);
  toast('تم التصدير');
}


/* ===================================================================== */
/*                   5) الإشعارات — modernized (u-*)                       */
/* ===================================================================== */
async function renderPushAdminTab(body){
  body = body || $('settingsSubBody'); if(!body) return;
  if(!currentUser || !currentUser.isAdmin){
    body.innerHTML = `<div class="u-card"><div class="u-empty">${svg('lock','w-10 h-10')}<div style="margin-top:8px;color:var(--ink);font-weight:800">مقصور على المشرف العام</div></div></div>`;
    return;
  }
  body.innerHTML = `<div class="u-empty">${svg('bell','w-8 h-8')}<div style="margin-top:8px">تحميل سياسة الإشعارات…</div></div>`;
  const r = await guard(DS.pushPolicyGet(), 'تحميل…');
  if(!r || !r.success){
    body.innerHTML = `<div class="u-card"><div class="u-empty" style="color:var(--bad)">فشل التحميل</div></div>`;
    return;
  }
  const p = r.policy || {enabled:true, audience:'all', news:true, absence:true};
  const audOpts = [
    ['all','الكل (طلاب + أولياء + معلمون)'],
    ['students_parents','الطلاب وأولياء الأمور'],
    ['students','الطلاب فقط'],
    ['parents','أولياء الأمور فقط']
  ];

  body.innerHTML = `<div class="fade-in" style="max-width:720px;margin:0 auto">
    <div class="u-card" style="background:var(--brand);color:var(--on-brand);border-color:transparent">
      <div class="u-row" style="gap:12px"><div style="color:var(--gold-bright)">${svg('bell','w-7 h-7')}</div>
        <div class="u-grow"><div class="u-name" style="color:#fff">الإشعارات الخارجية للمنصّة</div>
          <div style="color:rgba(255,255,255,.78);font-size:12.5px;margin-top:4px;line-height:1.6">تحكّم في تفعيل الإشعارات والجمهور المستهدف والأنواع المرسَلة. تُطبَّق التغييرات فوراً.</div>
        </div></div>
    </div>

    <div class="u-card">
      <label class="u-between" style="cursor:pointer">
        <div><div class="u-name">تفعيل الإشعارات الخارجية</div>
          <div class="u-muted" style="margin-top:4px">مفتاح رئيسي — إن أُوقف لن يُرسَل أي إشعار.</div>
        </div>
        <input type="checkbox" id="pp_enabled" ${p.enabled?'checked':''} style="width:22px;height:22px;accent-color:var(--brand)">
      </label>
    </div>

    <div class="u-card">
      <div class="u-card-h"><h3>الجمهور المستهدف</h3></div>
      <div style="display:grid;gap:8px">
        ${audOpts.map(([v,lbl])=>`<label class="u-plan u-row" style="cursor:pointer;${p.audience===v?'border-color:var(--brand-ink);background:var(--brand-soft)':''}">
          <input type="radio" name="pp_audience" value="${v}" ${p.audience===v?'checked':''} style="accent-color:var(--brand);width:16px;height:16px">
          <span class="u-name" style="font-size:13.5px">${lbl}</span>
        </label>`).join('')}
      </div>
    </div>

    <div class="u-card">
      <div class="u-card-h"><h3>أنواع الإشعارات</h3></div>
      <label class="u-plan u-row" style="cursor:pointer;justify-content:space-between">
        <div><div class="u-name" style="font-size:13.5px">إعلان جديد</div>
          <div class="u-muted" style="margin-top:2px">عند نشر إعلان من الأخبار.</div></div>
        <input type="checkbox" id="pp_news" ${p.news?'checked':''} style="width:18px;height:18px;accent-color:var(--brand)">
      </label>
      <label class="u-plan u-row" style="cursor:pointer;justify-content:space-between">
        <div><div class="u-name" style="font-size:13.5px">تنبيه غياب</div>
          <div class="u-muted" style="margin-top:2px">إشعار ولي الأمر عند تسجيل غياب ابنه.</div></div>
        <input type="checkbox" id="pp_absence" ${p.absence?'checked':''} style="width:18px;height:18px;accent-color:var(--brand)">
      </label>
    </div>

    <div class="u-sticky"><div class="u-row">
      <button onclick="doSavePushPolicy()" class="u-btn u-btn-p" style="flex:1">${svg('check','w-4 h-4')} حفظ السياسة</button>
      <button onclick="renderPushAdminTab($('settingsSubBody'))" class="u-btn u-btn-g">إعادة تحميل</button>
    </div></div>

    <div class="u-note gold" style="margin-top:14px"><b>ملاحظة:</b> السياسة تُطبَّق على الإشعارات القادمة فقط. المستخدمون يُفعّلون/يُوقفون الإشعارات على أجهزتهم من نافذة الجرس.</div>
  </div>`;
}


/* ===================================================================== */
/*                   6) المظهر — modernized (u-*)                          */
/* ===================================================================== */
async function renderAppearanceTab(body){
  body = body || $('settingsSubBody'); if(!body) return;
  body.innerHTML = `<div class="u-empty">${svg('cog','w-8 h-8')}<div style="margin-top:8px">تحميل الإعدادات…</div></div>`;
  const r = await guard(DS.getSettings(['logo_url','halaqa_name','halaqa_tagline']), 'تحميل…');
  const v = (r && r.values) || {};
  const currentLogo = v.logo_url || '';
  const currentName = v.halaqa_name || '';
  const currentTag  = v.halaqa_tagline || '';

  body.innerHTML = `<div class="fade-in" style="max-width:900px;margin:0 auto">

    <div class="u-card" style="background:var(--brand);color:#fff;border-color:transparent">
      <div class="u-row" style="gap:12px">
        <div style="color:var(--gold-bright)">${svg('warn','w-7 h-7')}</div>
        <div class="u-grow"><div class="u-name" style="color:#fff">صحة قاعدة البيانات</div>
          <div style="color:rgba(255,255,255,.78);font-size:12.5px;margin-top:4px">فحص وإصلاح الربط بين المستخدمين وسجلات الطلاب والمجموعات.</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="doDbHealthCheck()" class="u-btn u-btn-s sm" style="background:rgba(255,255,255,.14);color:#fff;border-color:transparent">فحص</button>
          <button onclick="doDbRepair(true)" class="u-btn sm" style="background:var(--gold-bright);color:var(--brand);border-color:transparent">إصلاح</button>
        </div>
      </div>
      <div id="db_health_result" style="margin-top:10px"></div>
    </div>

    <div class="u-grid2 md4" style="grid-template-columns:1fr">
      <div class="u-card">
        <div class="u-card-h"><h3>شعار الحلقة والهوية</h3></div>
        <div class="u-field">
          <label>شعار الحلقة</label>
          <input type="hidden" id="ap_logo" value="${esc(currentLogo)}">
          <input type="file" id="ap_logo_file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="apPickLogo(this.files[0])" style="display:none">
          <div id="ap_dropzone"
               onclick="document.getElementById('ap_logo_file').click()"
               ondragover="event.preventDefault();this.style.borderColor='var(--brand-ink)'"
               ondragleave="this.style.borderColor='var(--line2)'"
               ondrop="event.preventDefault();this.style.borderColor='var(--line2)';apPickLogo(event.dataTransfer?.files?.[0])"
               style="cursor:pointer;border:2px dashed var(--line2);border-radius:14px;padding:18px;text-align:center;transition:border-color .15s,background .15s">
            <div style="color:var(--ink3);margin-bottom:6px;display:flex;justify-content:center">${svg('arrowup','w-8 h-8')}</div>
            <div class="u-name" style="font-size:13.5px">اضغط لاختيار صورة أو أفلتها هنا</div>
            <div class="u-muted" style="margin-top:4px">PNG أو JPG أو WEBP · يُصغَّر إلى 256×256</div>
          </div>
        </div>
        <div class="u-field"><label for="ap_name">اسم الحلقة</label>
          <input id="ap_name" value="${esc(currentName)}" placeholder="حلقة ابن كثير" class="u-input">
        </div>
        <div class="u-field"><label for="ap_tag">الشعار الفرعي</label>
          <input id="ap_tag" value="${esc(currentTag)}" placeholder="مجمع حلق الراجحي" class="u-input">
        </div>
        <button onclick="doSaveAppearance()" class="u-btn u-btn-p w">${svg('check','w-4 h-4')} حفظ وتطبيق</button>
        <button id="ap_clear_btn" onclick="doClearLogo()" class="u-btn u-btn-bad w ${currentLogo?'':'hidden'}" style="margin-top:8px">${svg('trash','w-4 h-4')} إزالة الشعار</button>
      </div>

      <div class="u-card">
        <div class="u-card-h"><h3>المعاينة</h3></div>
        <div style="background:var(--brand);border-radius:16px;padding:24px;text-align:center;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div id="ap_preview_wrap" style="width:112px;height:112px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center;padding:8px;overflow:hidden;margin-bottom:12px;box-shadow:var(--shadow-lg)">
            ${currentLogo
              ? `<img id="ap_preview" src="${esc(currentLogo)}" alt="Logo" style="width:100%;height:100%;object-fit:contain">`
              : `<span style="color:var(--brand)">${svg('book','w-12 h-12')}</span>`}
          </div>
          <div style="color:#fff;font-weight:800;font-size:17px">${esc(currentName||'حلقة ابن كثير')}</div>
          <div style="color:var(--gold-bright);font-size:12px;margin-top:3px;font-weight:700">${esc(currentTag||'مجمع حلق الراجحي')}</div>
        </div>
        <div class="u-muted" style="margin-top:10px;text-align:center;line-height:1.6">يظهر الشعار في: شاشة الدخول · الشريط الجانبي · رأس الجوال · التقارير</div>
      </div>
    </div>

  </div>`;
}


/* ===================================================================== */
/*                   7) المجموعات — modernized (u-*)                       */
/* ===================================================================== */
function renderManageTab(body){
  body = body || $('settingsSubBody'); if(!body) return;
  const {nameMap} = tMaps();
  const groups = (_tData?.groups || []);
  const students = (_tData?.students || []);

  const gRows = groups.map(g => {
    const inGroup = students.filter(s => String(s.Group_ID)===String(g.Group_ID));
    const c = inGroup.length;
    const preview = inGroup.slice(0,5).map(s =>
      `<span class="u-pill brand" style="font-size:11px">${esc(nameMap[s.Student_ID]||s.Student_ID)}</span>`
    ).join(' ') + (c>5?` <span class="u-muted">+${c-5}</span>`:'');
    return `<div class="u-plan" style="padding:14px;margin-bottom:10px">
      <div class="u-row" style="gap:12px;margin-bottom:10px">
        <div class="u-avatar" style="width:48px;height:48px;background:var(--brand);color:var(--gold-bright);border-radius:14px">${svg('users','w-6 h-6')}</div>
        <div class="u-grow" style="min-width:0">
          <div class="u-name">${esc(g.Group_Name)}</div>
          <div class="u-muted" style="margin-top:4px;display:flex;gap:10px">
            <span><span class="u-num">${c}</span> طلاب</span>
            <span style="color:var(--gold)"><span class="u-num">${esc(g.Group_Total_Points||0)}</span> نقطة</span>
          </div>
        </div>
        <button type="button" class="u-icon-btn" style="width:36px;height:36px" title="تعديل الاسم" onclick="openRenameGroup(${jsArg(g.Group_ID)},${jsArg(g.Group_Name)})">${svg('edit','w-4 h-4')}</button>
      </div>
      ${c?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${preview}</div>`:''}
      <div class="u-grid2" style="margin:0;gap:6px">
        <button onclick="openGroupMembers(${jsArg(g.Group_ID)},${jsArg(g.Group_Name)})" class="u-btn u-btn-s sm">${svg('users','w-4 h-4')} الأعضاء</button>
        <button onclick="openAddGroupPoints(${jsArg(g.Group_ID)},${jsArg(g.Group_Name)})" class="u-btn sm" style="background:var(--gold-soft);color:var(--gold)">${svg('trophy','w-4 h-4')} نقاط للمجموعة</button>
        <button onclick="openBulkGroupPoints(${jsArg(g.Group_ID)},${jsArg(g.Group_Name)})" class="u-btn sm" style="background:var(--ok-soft);color:var(--ok)">${svg('points','w-4 h-4')} نقاط للأفراد</button>
        <button onclick="confirmDeleteGroup(${jsArg(g.Group_ID)},${jsArg(g.Group_Name)})" class="u-btn u-btn-bad sm">${svg('trash','w-4 h-4')} حذف</button>
      </div>
    </div>`;
  }).join('') || `<div class="u-empty">${svg('users','w-8 h-8')}لا توجد مجموعات بعد</div>`;

  body.innerHTML = `<div class="fade-in" style="max-width:900px;margin:0 auto">
    <div class="u-card">
      <div class="u-card-h"><h3>${svg('plus','w-5 h-5')} إضافة مجموعة جديدة</h3></div>
      <div class="u-grid2" style="margin-bottom:0;align-items:end">
        <div class="u-field" style="margin:0"><label for="g_name">اسم المجموعة</label>
          <input id="g_name" class="u-input" placeholder="مثال: مجموعة الأنبياء" onkeydown="if(event.key==='Enter')doAddGroup()">
        </div>
        <button onclick="doAddGroup()" class="u-btn u-btn-p" style="height:46px">${svg('plus','w-4 h-4')} إضافة</button>
      </div>
      <div class="u-note brand" style="margin-top:12px"><b>الأعضاء:</b> نقرة واحدة تضيف أو تُخرج الطالب. &nbsp; <b>نقاط للأفراد:</b> منح جميع أعضاء المجموعة نقاطاً دفعة واحدة.</div>
    </div>

    <div class="u-card">
      <div class="u-card-h"><h3>${svg('users','w-5 h-5')} المجموعات (<span class="u-num">${groups.length}</span>)</h3></div>
      ${gRows}
    </div>
  </div>`;
}
