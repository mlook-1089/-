/* =====================================================================
   المعلم: تبويب «الإعدادات» — نمط iOS Settings (قائمة عمودية + تعمّق)
   يُحمَّل بعد الكود الرئيسي في index.html، فيستبدل الدوال التالية:
     renderSettingsTab, renderItemsTab, renderAccountsTab,
     renderAuditTab, renderPushAdminTab, renderAppearanceTab,
     renderManageTab
   كل IDs المستخدمة من معالجات أخرى (eu_*, ei_*, g_name, uacc_*, pp_*,
   ap_*, audit_*, grp_search ...) محفوظة كما هي.
   ===================================================================== */

/* ===================================================================== */
/*                   أدوات مساعدة + إدارة الحالة                           */
/* ===================================================================== */

/* الحالة الأساسية — ما لم تكن معرَّفة في index.html */
if(typeof _settingsSub!=='undefined' && _settingsSub==='students') _settingsSub='root';
window._itSearch     = window._itSearch     || '';
window._itFilter     = window._itFilter     || 'all';
window._itEditing    = window._itEditing    || null;
window._accSearch    = window._accSearch    || '';
window._accEditing   = window._accEditing   || null;
window._accAddOpen   = !!window._accAddOpen;
window._auditFrom    = window._auditFrom    || '';
window._auditTo      = window._auditTo      || '';

/* -------------- الوضع الليلي: قراءة التفضيل --------------- */
function _prefDark(){ try{ return localStorage.getItem('ibk_dark'); }catch(e){ return null; } }
function _isDarkNow(){ return document.documentElement.classList.contains('dark'); }

/* -------------- حجم خط الواجهة (ميزة جديدة) --------------- */
const _FS_MAP = { small:14, normal:16, large:18 };
function _applyFontSize(key){
  const v = _FS_MAP[key] || _FS_MAP.normal;
  document.documentElement.style.setProperty('--ui-base-size', v + 'px');
  document.body.style.fontSize = v + 'px';
}
function _savedFontSize(){ try{ return localStorage.getItem('ibk_font') || 'normal'; }catch(e){ return 'normal'; } }
/* تطبيق فوري عند تحميل الملف */
_applyFontSize(_savedFontSize());

/* -------------- تنقّل بين الصفحات داخل الإعدادات --------------- */
function _setPage(k){
  _settingsSub = k || 'root';
  _itEditing = null; _accEditing = null;
  renderSettingsTab($('portal'));
}
function _goBack(){ _setPage('root'); }

/* -------------- خريطة الصفحات --------------- */
const _PAGES = {
  // حسابي
  profile:    { label:'الملف الشخصي',      icon:'users',    group:'account' },
  qrSelf:     { label:'رمز QR للدخول',     icon:'lock',     group:'account' },

  // البيانات
  students:   { label:'الطلاب',             icon:'users',    group:'data' },
  groups:     { label:'المجموعات',          icon:'users',    group:'data' },
  accounts:   { label:'الحسابات',           icon:'lock',     group:'data' },
  items:      { label:'بنود النقاط',        icon:'coin',     group:'data' },

  // المتابعة
  plandays:   { label:'الفصل الدراسي',      icon:'calendar', group:'followup' },
  allplans:   { label:'خطط الطلاب',          icon:'book',     group:'followup' },
  audit:      { label:'سجل النقاط',         icon:'history',  group:'followup' },

  // الهوية والمظهر
  appearance: { label:'شعار الحلقة والهوية', icon:'cog',      group:'appearance' },
  darkMode:   { label:'الوضع الليلي',       icon:'bolt',     group:'appearance' },
  fontSize:   { label:'حجم الخط',           icon:'chart',    group:'appearance' },

  // الإشعارات (مشرف)
  push:       { label:'سياسة الإشعارات',    icon:'bell',     group:'notifications', admin:true },

  // النظام (مشرف)
  system:     { label:'معلومات التطبيق',    icon:'cog',      group:'system', admin:true },
  reset:      { label:'تصفير البيانات',     icon:'trash',    group:'danger',  admin:true, danger:true }
};

const _GROUPS = [
  { key:'account',       label:'حسابي'                },
  { key:'data',          label:'البيانات'              },
  { key:'followup',      label:'المتابعة والخطط'        },
  { key:'appearance',    label:'الهوية والمظهر'         },
  { key:'notifications', label:'الإشعارات',  admin:true },
  { key:'system',        label:'النظام',     admin:true },
  { key:'danger',        label:'منطقة حسّاسة', admin:true }
];


/* ===================================================================== */
/*                   مكوّنات مشتركة — صفوف قائمة iOS                        */
/* ===================================================================== */

/* شريط رأس الصفحة الفرعية مع زر رجوع */
function _subHeader(label, extra){
  return `<div class="u-top" style="margin-bottom:14px">
    <button type="button" class="u-icon-btn" title="رجوع إلى الإعدادات" aria-label="رجوع" onclick="_goBack()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:20px;height:20px"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
    </button>
    <div class="u-grow"><div class="u-sub">الإعدادات</div><h1>${esc(label)}</h1></div>
    ${extra||''}
  </div>`;
}

/* شيفرون للسهم في نهاية صف قائمة iOS */
function _chevron(){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--ink3);flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>`;
}

/* صف قائمة قابل للنقر (iOS style) */
function _listRow(pageKey, badge){
  const p = _PAGES[pageKey]; if(!p) return '';
  const col = p.danger ? 'var(--bad)' : 'var(--brand-ink)';
  const bg  = p.danger ? 'var(--bad-soft)' : 'var(--brand-soft)';
  const nameCol = p.danger ? 'var(--bad)' : 'var(--ink)';
  const b   = badge ? `<span class="u-pill mute" style="font-size:11px;flex-shrink:0">${badge}</span>` : '';
  return `<button type="button" class="u-row _lrow" style="width:100%;padding:14px 16px;background:transparent;border:0;border-bottom:1px solid var(--line);cursor:pointer;text-align:right;font-family:inherit;gap:12px" onclick="_setPage(${jsArg(pageKey)})">
    <div class="u-avatar" style="width:34px;height:34px;background:${bg};color:${col};border-radius:10px;flex-shrink:0">${svg(p.icon,'w-4 h-4')}</div>
    <div class="u-grow" style="min-width:0"><div class="name-full" style="font-weight:600;font-size:15px;color:${nameCol}">${esc(p.label)}</div></div>
    ${b}
    ${_chevron()}
  </button>`;
}

/* صف تبديل داخلي (toggle switch — ضمن صفحة فرعية) */
function _toggleRow(id, label, desc, checked, onChange){
  return `<label class="_lrow" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);cursor:pointer">
    <div class="u-grow"><div class="name-full" style="font-weight:600;font-size:15px;color:var(--ink)">${esc(label)}</div>
      ${desc?`<div class="u-muted" style="margin-top:3px;font-size:12px;line-height:1.5">${esc(desc)}</div>`:''}
    </div>
    <input type="checkbox" id="${esc(id)}" ${checked?'checked':''} onchange="${onChange}" style="width:46px;height:28px;appearance:none;background:${checked?'var(--brand)':'var(--muted-bg)'};border-radius:99px;position:relative;cursor:pointer;transition:background .18s;outline:none;flex-shrink:0">
  </label>`;
}

/* قسم عنوانه رمادي صغير فوق مجموعة صفوف */
function _listSection(label, rowsHtml){
  if(!rowsHtml) return '';
  return `<div class="u-section" style="margin:18px 2px 6px;font-size:12px;font-weight:700;color:var(--ink3);text-transform:none">${esc(label)}</div>
    <div class="u-card" style="padding:0;overflow:hidden">${rowsHtml}
      <style>.u-card ._lrow:last-child{border-bottom:0 !important}</style>
    </div>`;
}


/* ===================================================================== */
/*               1) الصفحة الرئيسية — قائمة iOS                           */
/* ===================================================================== */
function renderSettingsTab(body){
  if(!body) return;
  // 'overview' و 'students' و undefined → الصفحة الرئيسية
  const page = (!_settingsSub || _settingsSub==='overview' || _settingsSub==='root') ? 'root' : _settingsSub;
  if(page === 'root') return _rootMenu(body);

  // صفحة فرعية
  const p = _PAGES[page];
  if(!p){ _settingsSub='root'; return _rootMenu(body); }

  const dispatch = _PAGE_DISPATCH[page];
  if(!dispatch){ _settingsSub='root'; return _rootMenu(body); }

  body.innerHTML = `<div class="u-page fade-in" id="settingsPage">
    ${_subHeader(p.label)}
    <div id="settingsSubBody"></div>
  </div>`;
  dispatch($('settingsSubBody'));
}

function _rootMenu(body){
  const admin = !!(currentUser && currentUser.isAdmin);
  const d = _tData || {};

  // badges
  const sCount = (d.students||[]).length;
  const gCount = (d.groups||[]).length;
  const iCount = (d.items||[]).length;
  const planConfig = d.planConfig || {};
  const hasTerm = !!(planConfig.termStart && planConfig.termEnd);
  const manualPlans = (d.plans||[]).filter(p=>p.Source==='Manual');
  const planStudents = new Set(manualPlans.map(p=>p.Student_ID)).size;

  const badges = {
    students: sCount ? sCount+' طالب' : '',
    groups:   gCount ? gCount : '',
    items:    iCount ? iCount : '',
    plandays: hasTerm ? planConfig.termStart.slice(0,7) : 'لم يُعيَّن',
    allplans: planStudents ? planStudents+' طالب' : '',
    darkMode: _isDarkNow() ? 'مُفعَّل' : 'إيقاف',
    fontSize: ({small:'صغير',normal:'عادي',large:'كبير'})[_savedFontSize()] || 'عادي'
  };

  // ابنِ الأقسام
  const sectionsHtml = _GROUPS.map(g => {
    if(g.admin && !admin) return '';
    const pages = Object.keys(_PAGES).filter(k => {
      const p = _PAGES[k];
      if(p.admin && !admin) return false;
      return p.group === g.key;
    });
    if(!pages.length) return '';
    const rows = pages.map(k => _listRow(k, badges[k] || '')).join('');
    return _listSection(g.label, rows);
  }).join('');

  // بطاقة المستخدم أعلى الصفحة
  const user = currentUser || {};
  const initial = esc(String(user.Name||'?').trim().charAt(0));
  const userCard = `<button type="button" class="u-card" style="padding:16px;text-align:right;cursor:pointer;display:flex;gap:12px;align-items:center;border:1px solid var(--line);width:100%;font-family:inherit" onclick="_setPage('profile')">
    <div class="u-avatar lg" style="background:var(--brand);color:var(--gold-bright);width:52px;height:52px;font-size:21px">${initial}</div>
    <div class="u-grow" style="text-align:right"><div class="u-name" style="font-size:16px;font-weight:700">${esc(user.Name||'')}</div>
      <div class="u-muted" style="margin-top:3px;font-size:12.5px"><span dir="ltr">${esc(user.ID||'')}</span>${user.isAdmin?' · <span style="color:var(--gold);font-weight:700">مشرف عام</span>':''}</div>
    </div>
    ${_chevron()}
  </button>`;

  body.innerHTML = `<div class="u-page fade-in" style="max-width:720px;margin:0 auto">
    <div class="u-top" style="margin-bottom:14px">
      <div class="u-grow"><div class="u-sub">إدارة الحلقة والمنصّة</div><h1>الإعدادات</h1></div>
    </div>
    ${userCard}
    ${sectionsHtml}
    <div style="height:28px"></div>
  </div>`;
}


/* ===================================================================== */
/*                   توزيع الصفحات على الدوال المُنفِّذة                     */
/* ===================================================================== */
const _PAGE_DISPATCH = {
  profile:    (b)=>_renderProfilePage(b),
  qrSelf:     (b)=>_renderQrSelf(b),
  students:   (b)=>{ if(typeof renderStudentsTab==='function') renderStudentsTab(b); },
  groups:     (b)=>renderManageTab(b),
  accounts:   (b)=>renderAccountsTab(b),
  items:      (b)=>renderItemsTab(b),
  plandays:   (b)=>{ if(typeof renderPlanDaysTab==='function') renderPlanDaysTab(b); },
  allplans:   (b)=>{ if(typeof renderAllPlansTab==='function') renderAllPlansTab(b); },
  audit:      (b)=>renderAuditTab(b),
  appearance: (b)=>renderAppearanceTab(b),
  darkMode:   (b)=>_renderDarkModePage(b),
  fontSize:   (b)=>_renderFontSizePage(b),
  push:       (b)=>renderPushAdminTab(b),
  system:     (b)=>_renderSystemPage(b),
  reset:      (b)=>{ if(typeof renderResetTab==='function') renderResetTab(b); }
};


/* ===================================================================== */
/*                   2) الملف الشخصي (ميزة جديدة)                          */
/* ===================================================================== */
async function _renderProfilePage(body){
  if(!body || !currentUser) return;
  const u = currentUser;

  body.innerHTML = `<div class="fade-in" style="max-width:620px;margin:0 auto">
    <div class="u-card" style="text-align:center;padding:22px 14px">
      <div class="u-avatar lg" style="width:72px;height:72px;font-size:28px;margin:0 auto 12px;background:var(--brand);color:var(--gold-bright)">${esc(String(u.Name||'?').charAt(0))}</div>
      <div class="u-name" style="font-size:19px;font-weight:800">${esc(u.Name||'')}</div>
      <div class="u-muted" style="margin-top:4px;font-size:12.5px"><span dir="ltr">${esc(u.ID||'')}</span>${u.isAdmin?' · <span style="color:var(--gold);font-weight:700">مشرف عام</span>':''}</div>
    </div>

    ${_listSection('التعديل', `
      <div class="u-field _lrow" style="padding:14px 16px;margin:0;border-bottom:1px solid var(--line)">
        <label for="prof_name" style="font-size:12.5px">الاسم المعروض</label>
        <div class="u-row" style="gap:8px;margin-top:4px">
          <input id="prof_name" value="${esc(u.Name||'')}" class="u-input" style="flex:1" placeholder="اسمك">
          <button type="button" class="u-btn u-btn-p sm" onclick="_doSaveProfileName()" style="height:46px;flex-shrink:0">${svg('check','w-4 h-4')} حفظ</button>
        </div>
      </div>
      <button type="button" class="u-row _lrow" style="width:100%;padding:14px 16px;background:transparent;border:0;cursor:pointer;text-align:right;font-family:inherit;gap:12px" onclick="openChangePassword(false)">
        <div class="u-avatar" style="width:34px;height:34px;background:var(--brand-soft);color:var(--brand-ink);border-radius:10px;flex-shrink:0">${svg('lock','w-4 h-4')}</div>
        <div class="u-grow"><div style="font-weight:600;font-size:15px">تغيير كلمة المرور</div></div>
        ${_chevron()}
      </button>
    `)}

    ${_listSection('الوصول', `
      <button type="button" class="u-row _lrow" style="width:100%;padding:14px 16px;background:transparent;border:0;cursor:pointer;text-align:right;font-family:inherit;gap:12px" onclick="openLoginQR([${jsArg(u.ID)}])">
        <div class="u-avatar" style="width:34px;height:34px;background:var(--info-soft);color:var(--info);border-radius:10px;flex-shrink:0">${svg('lock','w-4 h-4')}</div>
        <div class="u-grow"><div style="font-weight:600;font-size:15px">إنشاء رمز QR للدخول</div>
          <div class="u-muted" style="margin-top:3px;font-size:12px">صالح لمدة ١٠ دقائق — امسحه بجهاز آخر للدخول دون كلمة مرور.</div>
        </div>
        ${_chevron()}
      </button>
    `)}

    <div style="height:24px"></div>
  </div>`;
}

async function _doSaveProfileName(){
  const name = ($('prof_name')?.value||'').trim();
  if(!name) return toast('الاسم مطلوب','warn');
  if(name === currentUser.Name) return toast('لا تغيير');
  const r = await guard(DS.updateUser(currentUser.ID, { Name: name }), 'حفظ…');
  if(!r || !r.success) return toast((r&&r.message)||'فشل الحفظ','error');
  currentUser.Name = name;
  // حدّث شريط الاسم في الواجهة
  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = name);
  toast('تم حفظ الاسم');
  _renderProfilePage($('settingsSubBody'));
}


/* ===================================================================== */
/*                   3) رمز QR للمعلم نفسه                                 */
/* ===================================================================== */
function _renderQrSelf(body){
  if(!body || !currentUser) return;
  body.innerHTML = `<div class="fade-in" style="max-width:620px;margin:0 auto">
    <div class="u-card" style="text-align:center;padding:22px">
      <div class="u-name" style="font-size:16px;font-weight:700;margin-bottom:6px">رمز الدخول السريع</div>
      <div class="u-muted" style="line-height:1.6;margin-bottom:16px">يُنشَأ رمز QR صالح لـ ١٠ دقائق فقط. امسحه بكاميرا جهاز آخر للدخول بحسابك دون كتابة كلمة المرور.</div>
      <button type="button" class="u-btn u-btn-p" onclick="openLoginQR([${jsArg(currentUser.ID)}])">${svg('lock','w-4 h-4')} إنشاء رمز QR</button>
    </div>
  </div>`;
}


/* ===================================================================== */
/*                   4) الوضع الليلي (toggle + متابعة تلقائية)              */
/* ===================================================================== */
function _renderDarkModePage(body){
  if(!body) return;
  const pref = _prefDark(); // '1' | '0' | null
  const isAuto = pref == null;
  const isDark = _isDarkNow();

  const opt = (val, label, desc) => {
    const on = (val==='auto' && isAuto) || (val==='on' && pref==='1') || (val==='off' && pref==='0');
    return `<button type="button" class="_lrow u-row" style="width:100%;padding:14px 16px;background:${on?'var(--brand-soft)':'transparent'};border:0;border-bottom:1px solid var(--line);cursor:pointer;text-align:right;font-family:inherit;gap:12px" onclick="_setDarkPref(${jsArg(val)})">
      <div style="width:22px;height:22px;border-radius:50%;border:2px solid ${on?'var(--brand)':'var(--line2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${on?`<div style="width:11px;height:11px;border-radius:50%;background:var(--brand)"></div>`:''}
      </div>
      <div class="u-grow"><div style="font-weight:600;font-size:15px;color:var(--ink)">${esc(label)}</div>
        <div class="u-muted" style="margin-top:3px;font-size:12px">${esc(desc)}</div>
      </div>
    </button>`;
  };

  body.innerHTML = `<div class="fade-in" style="max-width:620px;margin:0 auto">
    <div class="u-card" style="padding:0;overflow:hidden">
      ${opt('auto','تلقائي (حسب الجهاز)','يتبع إعداد الوضع الليلي في جهازك')}
      ${opt('on','مُفعَّل دائماً','خلفية داكنة في جميع الأوقات')}
      ${opt('off','مُوقَف دائماً','خلفية فاتحة في جميع الأوقات')}
    </div>
    <div class="u-note brand" style="margin-top:14px">الوضع الحالي: <b>${isDark?'ليلي':'نهاري'}</b></div>
  </div>`;
}
function _setDarkPref(mode){
  try{
    if(mode === 'auto'){ localStorage.removeItem('ibk_dark'); }
    else if(mode === 'on'){ localStorage.setItem('ibk_dark','1'); }
    else { localStorage.setItem('ibk_dark','0'); }
  }catch(e){}
  // طبّق فوراً
  if(mode === 'auto'){
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    applyDark(!!(mq && mq.matches));
  } else if(mode === 'on'){ applyDark(true); }
  else { applyDark(false); }
  _renderDarkModePage($('settingsSubBody'));
}


/* ===================================================================== */
/*                   5) حجم الخط (ميزة جديدة)                              */
/* ===================================================================== */
function _renderFontSizePage(body){
  if(!body) return;
  const cur = _savedFontSize();

  const opt = (val, label, px) => {
    const on = (val === cur);
    return `<button type="button" class="_lrow u-row" style="width:100%;padding:14px 16px;background:${on?'var(--brand-soft)':'transparent'};border:0;border-bottom:1px solid var(--line);cursor:pointer;text-align:right;font-family:inherit;gap:12px" onclick="_setFontSize(${jsArg(val)})">
      <div style="width:22px;height:22px;border-radius:50%;border:2px solid ${on?'var(--brand)':'var(--line2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${on?`<div style="width:11px;height:11px;border-radius:50%;background:var(--brand)"></div>`:''}
      </div>
      <div class="u-grow"><div style="font-weight:600;font-size:${px}px;color:var(--ink);line-height:1.3">${esc(label)}</div>
        <div class="u-muted" style="margin-top:3px;font-size:12px">${px}px</div>
      </div>
    </button>`;
  };

  body.innerHTML = `<div class="fade-in" style="max-width:620px;margin:0 auto">
    <div class="u-card" style="padding:0;overflow:hidden">
      ${opt('small','خط صغير — مزيد من المحتوى',14)}
      ${opt('normal','خط عادي (مُستحسَن)',16)}
      ${opt('large','خط كبير — أوضح للقراءة',18)}
    </div>
    <div class="u-note brand" style="margin-top:14px">يُطبَّق التغيير فوراً على جميع نصوص الواجهة ويُحفَظ في جهازك.</div>
  </div>`;
}
function _setFontSize(key){
  try{ localStorage.setItem('ibk_font', key); }catch(e){}
  _applyFontSize(key);
  _renderFontSizePage($('settingsSubBody'));
  toast('تم تطبيق الحجم');
}


/* ===================================================================== */
/*                   6) معلومات التطبيق (ميزة جديدة — مشرف)                 */
/* ===================================================================== */
async function _renderSystemPage(body){
  if(!body) return;
  body.innerHTML = `<div class="u-empty">${svg('cog','w-8 h-8')}<div style="margin-top:8px">جمع معلومات التطبيق…</div></div>`;

  const info = { sw:'-', scope:'-', cacheName:'-', cacheSize:'-', pwa:'-', online:navigator.onLine?'متصل':'غير متصل', platform:navigator.platform||'-', ua:(navigator.userAgent||'').slice(0,80) };
  try{
    if(navigator.serviceWorker){
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg){
        info.sw = reg.active ? 'نشط' : (reg.installing ? 'يُثبَّت' : (reg.waiting ? 'ينتظر التحديث' : 'غير نشط'));
        info.scope = reg.scope || '-';
      } else info.sw = 'غير مُسجَّل';
    } else info.sw = 'غير مدعوم';
  }catch(e){}
  try{
    const keys = await caches.keys();
    const ibk = keys.find(k=>k.startsWith('ibk-shell-'));
    info.cacheName = ibk || '-';
  }catch(e){}
  try{
    if(navigator.storage && navigator.storage.estimate){
      const est = await navigator.storage.estimate();
      const mb = (est.usage||0) / (1024*1024);
      const quotaMb = (est.quota||0) / (1024*1024);
      info.cacheSize = mb.toFixed(2) + ' MB من ' + quotaMb.toFixed(0) + ' MB';
    }
  }catch(e){}
  try{
    const inst = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    info.pwa = inst ? 'مُثبَّت كتطبيق' : 'يعمل داخل متصفح';
  }catch(e){}

  const row = (label, value, mono) => `<div class="_lrow" style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)">
    <div class="u-grow"><div style="font-weight:600;font-size:14px;color:var(--ink)">${esc(label)}</div>
      <div class="${mono?'u-num':''}" style="margin-top:4px;font-size:12.5px;color:var(--ink2);${mono?'font-variant-numeric:tabular-nums;':''}word-break:break-all">${esc(value)}</div>
    </div>
  </div>`;

  body.innerHTML = `<div class="fade-in" style="max-width:720px;margin:0 auto">
    ${_listSection('Service Worker', row('حالة SW', info.sw) + row('اسم الكاش', info.cacheName, true) + row('نطاق SW', info.scope, true))}
    ${_listSection('التخزين المحلي', row('حجم الكاش', info.cacheSize, true))}
    ${_listSection('التثبيت والاتصال', row('حالة PWA', info.pwa) + row('الاتصال بالإنترنت', info.online))}
    ${_listSection('الجهاز', row('المنصّة', info.platform, true) + row('متصفح User Agent', info.ua, true))}

    <div class="u-card" style="margin-top:14px">
      <div class="u-grid2" style="margin:0">
        <button type="button" class="u-btn u-btn-g sm" onclick="_doClearCache()" style="height:44px">${svg('trash','w-4 h-4')} مسح كاش التطبيق</button>
        <button type="button" class="u-btn u-btn-p sm" onclick="_doForceReload()" style="height:44px">${svg('repeat','w-4 h-4')} تحديث قسري</button>
      </div>
      <div class="u-note warn" style="margin-top:12px;margin-bottom:0">يفيد عند عدم ظهور آخر التحديثات على جهاز معيّن. البيانات لا تُحذَف — فقط ملفات الواجهة.</div>
    </div>
    <div style="height:24px"></div>
  </div>`;
}

async function _doClearCache(){
  const ok = await confirmModal({ title:'مسح كاش التطبيق', message:'سيتم حذف جميع ملفات الواجهة المخزّنة محلياً. بياناتك (الطلاب/الخطط/النقاط) لا تتأثر. متابعة؟', confirmText:'نعم، امسح', danger:true });
  if(!ok) return;
  try{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    if(navigator.serviceWorker){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    toast('تم المسح — جارٍ إعادة التحميل');
    setTimeout(()=>location.reload(), 500);
  }catch(e){ toast('فشل المسح: '+(e.message||e),'error'); }
}
function _doForceReload(){
  try{ location.reload(); }catch(e){ location.href = location.href; }
}


/* ===================================================================== */
/*                   7) بنود النقاط — متقدّم مع تحرير مضمَّن                  */
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
function itFocusAdd(){ const w = $('it_add_wrap'); if(w) w.classList.toggle('hidden'); }

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
    : `<span class="u-pill info">${esc(triggerLabel(trig))}</span>`;

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
async function saveEditItem(id){
  const upd = { Description:($('ei_desc')?.value||'').trim(), Point_Value:Number($('ei_val')?.value)||0, Trigger:$('ei_trig')?.value||'none' };
  if(!upd.Description) return toast('الوصف مطلوب','warn');
  const r = await guard(DS.updatePointItem(id, upd), 'حفظ…');
  if(!r || !r.success) return toast((r&&r.message)||'فشل','error');
  const it = (_tData.items||[]).find(x => String(x.Item_ID)===String(id));
  if(it) Object.assign(it, upd);
  _itEditing = null; toast('تم التحديث'); _itRenderList();
}


/* ===================================================================== */
/*                   8) الحسابات                                           */
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
  const {nameMap} = tMaps();
  const list = (preList || (_accSub==='Teacher' ? (window._accCache?.teachers||[]) : (window._accCache?.parents||[])));
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
/*                   9) سجل النقاط                                         */
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
  _auditSearch=''; _auditFrom=''; _auditTo='';
  const el=$('audit_search'); if(el) el.value='';
  const f=$('audit_from'); if(f) f.value='';
  const t=$('audit_to'); if(t) t.value='';
  renderAuditRows();
}

function _auditFiltered(){
  let logs = _auditLogs || [];
  if(_auditSearch){ const q=_auditSearch; logs = logs.filter(l => arMatches(l.studentName||'', q) || arMatches(l.itemDesc||'', q)); }
  if(_auditFrom) logs = logs.filter(l => String(l.date||'').slice(0,10) >= _auditFrom);
  if(_auditTo)   logs = logs.filter(l => String(l.date||'').slice(0,10) <= _auditTo);
  return logs;
}

function renderAuditRows(){
  const logs = _auditFiltered();
  const tb = $('audit_tbody'); if(!tb) return;
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
  logs.forEach(l => rows.push([ String(l.date||''), String(l.studentName||''), String(l.itemDesc||''), String(l.points||0), String(l.teacherName||'') ]));
  const csv = '﻿' + rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = 'audit_' + (_auditFrom||'all') + (_auditTo?'_to_'+_auditTo:'') + '.csv';
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 200);
  toast('تم التصدير');
}


/* ===================================================================== */
/*                   10) الإشعارات (مشرف)                                  */
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
    <div class="u-card">
      <label class="u-between" style="cursor:pointer">
        <div><div class="u-name">تفعيل الإشعارات الخارجية</div>
          <div class="u-muted" style="margin-top:4px">مفتاح رئيسي — إن أُوقف لن يُرسَل أي إشعار.</div>
        </div>
        <input type="checkbox" id="pp_enabled" ${p.enabled?'checked':''} style="width:22px;height:22px;accent-color:var(--brand)">
      </label>
    </div>

    ${_listSection('الجمهور المستهدف', audOpts.map(([v,lbl])=>`
      <label class="_lrow u-row" style="padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--line);${p.audience===v?'background:var(--brand-soft)':''}">
        <input type="radio" name="pp_audience" value="${v}" ${p.audience===v?'checked':''} style="accent-color:var(--brand);width:16px;height:16px">
        <span class="u-name" style="font-size:13.5px;flex:1">${lbl}</span>
      </label>`).join(''))}

    ${_listSection('أنواع الإشعارات', `
      <label class="_lrow u-row" style="padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--line);justify-content:space-between">
        <div><div class="u-name" style="font-size:13.5px">إعلان جديد</div>
          <div class="u-muted" style="margin-top:2px">عند نشر إعلان من الأخبار.</div></div>
        <input type="checkbox" id="pp_news" ${p.news?'checked':''} style="width:18px;height:18px;accent-color:var(--brand)">
      </label>
      <label class="_lrow u-row" style="padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--line);justify-content:space-between">
        <div><div class="u-name" style="font-size:13.5px">تنبيه غياب</div>
          <div class="u-muted" style="margin-top:2px">إشعار ولي الأمر عند تسجيل غياب ابنه.</div></div>
        <input type="checkbox" id="pp_absence" ${p.absence?'checked':''} style="width:18px;height:18px;accent-color:var(--brand)">
      </label>
    `)}

    <div class="u-sticky"><div class="u-row">
      <button onclick="doSavePushPolicy()" class="u-btn u-btn-p" style="flex:1">${svg('check','w-4 h-4')} حفظ السياسة</button>
      <button onclick="renderPushAdminTab($('settingsSubBody'))" class="u-btn u-btn-g">تحديث</button>
    </div></div>
  </div>`;
}


/* ===================================================================== */
/*                   11) المظهر (الشعار + صحة قاعدة البيانات)              */
/* ===================================================================== */
async function renderAppearanceTab(body){
  body = body || $('settingsSubBody'); if(!body) return;
  body.innerHTML = `<div class="u-empty">${svg('cog','w-8 h-8')}<div style="margin-top:8px">تحميل الإعدادات…</div></div>`;
  const r = await guard(DS.getSettings(['logo_url','halaqa_name','halaqa_tagline']), 'تحميل…');
  const v = (r && r.values) || {};
  const currentLogo = v.logo_url || '';
  const currentName = v.halaqa_name || '';
  const currentTag  = v.halaqa_tagline || '';
  const admin = !!(currentUser && currentUser.isAdmin);

  body.innerHTML = `<div class="fade-in" style="max-width:900px;margin:0 auto">

    ${admin?`<div class="u-card" style="background:var(--brand);color:#fff;border-color:transparent">
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
    </div>`:''}

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
      </div>
    </div>
  </div>`;
}


/* ===================================================================== */
/*                   12) المجموعات                                         */
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
