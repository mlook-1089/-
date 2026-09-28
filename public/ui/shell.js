/* =====================================================================
   هيكل الواجهة v6: رأس الجوال + شريط التنقل السفلي + لوحة «المزيد/حسابي»
   واجهة برمجية تستخدمها كل البوابات:
     uiNav(items, active, opts)  — items: [{k, t, i, onSelect(k)}]
                                   opts: { moreLabel, moreIcon, moreItems:[{t, i, fn, danger}] }
     uiNavActive(k)              — تمييز العنصر النشط (الجوال + الشريط الجانبي)
     uiHeader(title, sub)        — نص رأس الجوال
     openMoreSheet() / closeMoreSheet()
   ===================================================================== */
let _uiNav = { items: [], active: '', opts: {} };

function _uiEnsureShell(){
  if(!document.getElementById('uNav')){
    const nav = document.createElement('nav');
    nav.id = 'uNav'; nav.className = 'u-nav no-print'; nav.style.display = 'none';
    document.body.appendChild(nav);
  }
  if(!document.getElementById('uSheet')){
    const bg = document.createElement('div');
    bg.id = 'uSheetBg'; bg.className = 'u-sheet-bg'; bg.onclick = closeMoreSheet;
    const sh = document.createElement('div');
    sh.id = 'uSheet'; sh.className = 'u-sheet'; sh.setAttribute('role', 'dialog');
    document.body.appendChild(bg); document.body.appendChild(sh);
  }
}

function uiNav(items, active, opts){
  _uiEnsureShell();
  _uiNav = { items: items || [], active: active || (items && items[0] && items[0].k) || '', opts: opts || {} };
  const o = _uiNav.opts;
  const nav = document.getElementById('uNav');
  const btn = (k, t, i, extra) => `<button type="button" data-k="${esc(k)}" ${extra||''}><span class="ic">${svg(i,'w-5 h-5')}</span>${esc(t)}</button>`;
  nav.innerHTML = _uiNav.items.map(x => btn(x.k, x.t, x.i, `onclick="uiNavSelect(${jsArg(x.k)})"`)).join('')
    + btn('__more', o.moreLabel || 'المزيد', o.moreIcon || 'cog', 'onclick="openMoreSheet()"');
  nav.style.display = '';
  // الشريط الجانبي (سطح المكتب)
  const side = document.getElementById('mainNav');
  if(side){
    side.innerHTML = _uiNav.items.map(x => `<button type="button" data-tab="${esc(x.k)}" onclick="uiNavSelect(${jsArg(x.k)})" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all-fast text-gray-600 hover:bg-gray-50">${svg(x.i,'w-5 h-5')} ${esc(x.t)}</button>`).join('')
      + (o.moreItems||[]).map((m, idx) => `<button type="button" onclick="_uiMoreRun(${idx})" class="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all-fast text-gray-600 hover:bg-gray-50">${svg(m.i,'w-5 h-5')} ${esc(m.t)}</button>`).join('');
  }
  uiNavActive(_uiNav.active);
}

function uiNavSelect(k){
  const it = _uiNav.items.find(x => x.k === k);
  closeMoreSheet();
  uiNavActive(k);
  try{ document.getElementById('portal')?.scrollTo({ top: 0 }); }catch(e){}
  if(it && typeof it.onSelect === 'function') it.onSelect(k);
}

function uiNavActive(k){
  _uiNav.active = k;
  const inNav = _uiNav.items.some(x => x.k === k);
  // صفحة من قائمة «المزيد» (الأخبار/الإعدادات) → نميّز زر المزيد
  document.querySelectorAll('#uNav > button').forEach(b => b.classList.toggle('on', inNav ? b.dataset.k === k : b.dataset.k === '__more'));
  document.querySelectorAll('#mainNav .nav-item').forEach(b => {
    const on = b.dataset.tab === k;
    b.classList.toggle('bg-brand-50', on); b.classList.toggle('text-brand-900', on); b.classList.toggle('text-gray-600', !on);
  });
  const it = _uiNav.items.find(x => x.k === k);
  const tt = document.getElementById('topbar-title'); if(tt && it) tt.textContent = it.t;
}

function uiHeader(title, sub){
  const n = document.getElementById('uHeadName'); if(n) n.textContent = title || '';
  const s = document.getElementById('uHeadSub'); if(s) s.textContent = sub || '';
}

function _uiMoreRun(idx){
  const m = (_uiNav.opts.moreItems || [])[idx];
  closeMoreSheet();
  if(m && typeof m.fn === 'function') setTimeout(() => m.fn(), 60);
}

function openMoreSheet(){
  _uiEnsureShell();
  const o = _uiNav.opts;
  const isDark = document.documentElement.classList.contains('dark');
  const extra = (o.moreItems || []).map((m, idx) =>
    `<button type="button" onclick="_uiMoreRun(${idx})" class="${m.danger?'danger':''}"><span class="ic">${svg(m.i,'w-5 h-5')}</span><span class="u-grow">${esc(m.t)}</span></button>`).join('');
  const user = currentUser || {};
  document.getElementById('uSheet').innerHTML = `<div class="grab"></div>
    <div class="u-row" style="padding:4px 6px 12px">
      <div class="u-avatar lg">${esc((user.Name||'?').trim().charAt(0))}</div>
      <div class="u-grow"><div class="u-name" style="font-size:16px">${esc(user.Name||'')}</div><div class="u-muted">${esc((typeof ROLE_AR!=='undefined'&&ROLE_AR[user.Role])||'')} · <span dir="ltr">${esc(user.ID||'')}</span></div></div>
    </div>
    <div class="u-menu">
      ${extra}
      <button type="button" onclick="closeMoreSheet();setTimeout(()=>openNotifications(),60)"><span class="ic">${svg('bell','w-5 h-5')}</span><span class="u-grow">الإشعارات</span></button>
      <button type="button" onclick="closeMoreSheet();setTimeout(()=>togglePush(),60)"><span class="ic">${svg('bolt','w-5 h-5')}</span><span class="u-grow">تنبيهات الجوال</span></button>
      <button type="button" onclick="toggleDark();openMoreSheet()"><span class="ic">${svg('leaf','w-5 h-5')}</span><span class="u-grow">${isDark?'الوضع النهاري':'الوضع الليلي'}</span></button>
      <button type="button" onclick="closeMoreSheet();setTimeout(()=>openChangePassword(),60)"><span class="ic">${svg('lock','w-5 h-5')}</span><span class="u-grow">تغيير كلمة المرور</span></button>
      <button type="button" class="danger" onclick="logout()"><span class="ic">${svg('arrowup','w-5 h-5')}</span><span class="u-grow">تسجيل الخروج</span></button>
    </div>`;
  document.getElementById('uSheetBg').classList.add('show');
  requestAnimationFrame(() => document.getElementById('uSheet').classList.add('show'));
}
function closeMoreSheet(){
  document.getElementById('uSheet')?.classList.remove('show');
  document.getElementById('uSheetBg')?.classList.remove('show');
}

/* توافق مع الاستدعاءات القديمة: الشريط العلوي القديم أُلغي لصالح الشريط السفلي */
function buildMobTabs(){ const w = document.getElementById('mobTabsWrap'); if(w) w.style.display = 'none'; }
function highlightMobTab(k){ uiNavActive(k); try{ document.getElementById('portal')?.scrollTo({ top: 0 }); }catch(e){} }
