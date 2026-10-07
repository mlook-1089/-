/* =====================================================================
   مجتمع المجموعة — محادثة علنية خاصة بكل مجموعة
   يُحمَّل بعد portal.js فيوسّع تنقّل الطالب بتبويب "المجتمع"،
   ويُضيف قسم إعدادات للمعلم (community.js يصدِّر دوال render).

   يعتمد على:
     - DS.communityList / communityPost / communityDelete / communityReact
     - uiNav (shell.js) · _pt (portal.js) · tMaps / toast / confirmModal
   ===================================================================== */

/* -------------------- حالة -------------------- */
window._cm = window._cm || {
  groupId: '',       // المجموعة المعروضة حالياً
  messages: [],      // آخر مجموعة من الرسائل
  lastRefresh: 0,    // Date.now() لآخر fetch
  pollTimer: null,
  composing: '',     // نصّ محفوظ في مربّع الكتابة (لا يُفقَد عند إعادة render)
  posting: false,
  initialLoad: false
};

/* -------------------- أدوات نصّية -------------------- */

/* URL regex محافظ: يلتقط http(s)://... حتى أول مسافة أو حرف فاصل. */
const _CM_URL_RE = /https?:\/\/[^\s<>"]+/gi;

/* linkify: نهرب HTML أولاً، ثم نحوّل الروابط إلى <a> آمنة.
   target="_blank" + rel="noopener noreferrer nofollow" يمنع اختطاف window.opener
   و"nofollow" يحمي SEO ويقلّل الحافز للـ spam. */
function _cmLinkify(text){
  const safe = esc(String(text || ''));
  return safe.replace(_CM_URL_RE, u => {
    // قد يحمل عنوان URL علامات ترقيم في النهاية (، . !) — نقتطعها
    const trail = u.match(/[.,!?؛،)\]]+$/)?.[0] || '';
    const url = trail ? u.slice(0, -trail.length) : u;
    const display = url.length > 60 ? url.slice(0, 57) + '…' : url;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow" style="color:var(--brand-ink);text-decoration:underline;word-break:break-all">${display}</a>${trail}`;
  });
}

/* وقت نسبي قصير (منذ ٥ د، ساعتان…) — مطابق لما يستخدمه المستخدم في WhatsApp. */
function _cmRelTime(iso){
  try{
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const sec = Math.max(0, Math.floor(diffMs / 1000));
    if(sec < 60) return 'الآن';
    const min = Math.floor(sec / 60);
    if(min < 60) return `منذ ${min} د`;
    const hr = Math.floor(min / 60);
    if(hr < 24) return `منذ ${hr} س`;
    const day = Math.floor(hr / 24);
    if(day < 7) return `منذ ${day} يوم`;
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day:'numeric', month:'short' }).format(d);
  }catch(e){ return ''; }
}

/* -------------------- دوال العرض -------------------- */

/* صف رسالة واحدة */
function _cmRenderMessage(m){
  const isMine = String(m.authorId) === String(currentUser?.ID);
  const isTeacher = m.authorRole === 'Teacher';
  const canDelete = isMine || (currentUser?.Role === 'Teacher');
  const initial = esc(String(m.authorName || '؟').trim().charAt(0));
  const bodyHtml = m.deleted
    ? `<span class="u-muted" style="font-style:italic">— رسالة محذوفة —</span>`
    : _cmLinkify(m.body);
  const roleBadge = isTeacher ? '<span class="u-pill gold" style="font-size:10px;padding:2px 7px;margin-right:4px">معلم</span>' : '';
  const hearts = Number(m.hearts) || 0;
  const heartBtn = m.deleted ? '' : `<button type="button" aria-label="قلب" onclick="_cmToggleHeart(${jsArg(m.id)})" style="border:0;background:${m.iHearted?'var(--bad-soft)':'transparent'};border-radius:99px;padding:3px 10px;cursor:pointer;font-size:12px;color:${m.iHearted?'var(--bad)':'var(--ink3)'};display:inline-flex;align-items:center;gap:4px;font-family:inherit"><span style="font-size:14px">${m.iHearted?'♥':'♡'}</span>${hearts?`<span class="u-num" style="font-size:11px">${hearts}</span>`:''}</button>`;
  const delBtn = (!m.deleted && canDelete)
    ? `<button type="button" aria-label="حذف" title="حذف" onclick="_cmConfirmDelete(${jsArg(m.id)})" style="border:0;background:transparent;color:var(--ink3);cursor:pointer;padding:3px 6px;font-family:inherit">${svg('trash','w-4 h-4')}</button>`
    : '';

  return `<div class="u-plan" data-cm-id="${esc(m.id)}" style="padding:10px 12px;margin-bottom:8px;${isMine?'background:var(--brand-soft);border-color:transparent':''}">
    <div class="u-row" style="gap:8px;margin-bottom:6px;align-items:center">
      <div class="u-avatar" style="width:30px;height:30px;font-size:12px">${initial}</div>
      <div class="u-grow" style="min-width:0">
        <div style="font-weight:700;font-size:13px;color:var(--ink)">${esc(m.authorName||'')} ${roleBadge}</div>
        <div class="u-muted" style="font-size:11px">${esc(_cmRelTime(m.createdAt))}</div>
      </div>
      ${delBtn}
    </div>
    <div style="font-size:14px;line-height:1.65;color:${m.deleted?'var(--ink3)':'var(--ink)'};white-space:pre-wrap;word-break:break-word">${bodyHtml}</div>
    <div style="margin-top:6px">${heartBtn}</div>
  </div>`;
}

/* قائمة الرسائل (أقدم فأحدث — الأحدث في الأسفل) */
function _cmRenderList(messages){
  if(!messages || !messages.length){
    return `<div class="u-empty">${svg('chat','w-8 h-8')}<div style="margin-top:8px">لا رسائل بعد. اكتب أوّل رسالة.</div></div>`;
  }
  return messages.map(_cmRenderMessage).join('');
}

/* الحاوية الكاملة (header + list + composer) */
function _cmRenderShell(groupName){
  const label = groupName ? 'مجتمع ' + groupName : 'مجتمع المجموعة';
  return `<div class="u-page fade-in" id="cmPage" style="display:flex;flex-direction:column;max-width:720px;margin:0 auto">
    <div class="u-top" style="margin-bottom:10px">
      <div class="u-grow"><div class="u-sub">محادثة علنية داخل المجموعة</div><h1>${esc(label)}</h1></div>
      <button type="button" class="u-icon-btn" title="تحديث" aria-label="تحديث" onclick="_cmRefresh(true)">${svg('repeat','w-5 h-5')}</button>
    </div>

    <div id="cm_list" class="u-card" style="padding:10px;max-height:60vh;overflow-y:auto;margin-bottom:10px">
      <div class="u-empty">${svg('chat','w-7 h-7')}<div style="margin-top:6px">جارٍ تحميل الرسائل…</div></div>
    </div>

    <div class="u-card" style="padding:10px;margin:0">
      <textarea id="cm_input" rows="2" maxlength="500" placeholder="اكتب رسالتك… (حتى ٥٠٠ حرف)"
        oninput="_cmOnInput(this.value)"
        onkeydown="if(event.key==='Enter' && (event.ctrlKey||event.metaKey)) _cmSend()"
        style="width:100%;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-family:inherit;font-size:15px;resize:none;background:var(--card);color:var(--ink);outline:none">${esc(_cm.composing||'')}</textarea>
      <div class="u-between" style="margin-top:8px;align-items:center">
        <span class="u-muted" style="font-size:11.5px"><span class="u-num" id="cm_charCount">${(_cm.composing||'').length}</span>/500</span>
        <button type="button" class="u-btn u-btn-p sm" id="cm_sendBtn" onclick="_cmSend()">${svg('plus','w-4 h-4')} إرسال</button>
      </div>
    </div>
  </div>`;
}

/* -------------------- التحديث والتفاعل -------------------- */

async function _cmLoad(groupId){
  _cm.groupId = groupId || '';
  if(!groupId) return;
  const r = await DS.communityList(groupId);
  if(!r || !r.success){
    const box = $('cm_list'); if(box) box.innerHTML = `<div class="u-empty" style="color:var(--bad)">فشل تحميل الرسائل</div>`;
    return;
  }
  _cm.messages = r.messages || [];
  _cm.lastRefresh = Date.now();
  _cm.initialLoad = true;
  _cmRedrawList(true);
}

function _cmRedrawList(scrollToBottom){
  const box = $('cm_list'); if(!box) return;
  box.innerHTML = _cmRenderList(_cm.messages);
  if(scrollToBottom) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

async function _cmRefresh(scrollToBottom){
  if(!_cm.groupId) return;
  const r = await DS.communityList(_cm.groupId);
  if(!r || !r.success) return;
  _cm.messages = r.messages || [];
  _cm.lastRefresh = Date.now();
  _cmRedrawList(scrollToBottom);
}

function _cmOnInput(v){
  _cm.composing = v;
  const c = $('cm_charCount'); if(c) c.textContent = v.length;
}

async function _cmSend(){
  if(_cm.posting) return;
  const txt = (_cm.composing||'').trim();
  if(!txt) return;
  if(txt.length > 500) return toast('الرسالة أطول من ٥٠٠ حرف','warn');
  if(!_cm.groupId) return toast('المجموعة غير محددة','warn');
  _cm.posting = true;
  const btn = $('cm_sendBtn'); if(btn) btn.disabled = true;
  const r = await guard(DS.communityPost(txt, _cm.groupId), 'إرسال…');
  _cm.posting = false; if(btn) btn.disabled = false;
  if(!r || !r.success) return toast((r&&r.message)||'فشل الإرسال','error');
  // تحديث الحالة محلياً وإعادة الرسم
  _cm.messages.push(Object.assign({ authorName: currentUser?.Name || 'أنت', authorRole: currentUser?.Role || 'Student' }, r.message));
  _cm.composing = '';
  const inp = $('cm_input'); if(inp) inp.value = '';
  const cc = $('cm_charCount'); if(cc) cc.textContent = '0';
  _cmRedrawList(true);
}

async function _cmToggleHeart(messageId){
  const m = _cm.messages.find(x => String(x.id) === String(messageId)); if(!m) return;
  // تحديث متفائل
  const wasOn = m.iHearted;
  m.iHearted = !wasOn;
  m.hearts = Math.max(0, (Number(m.hearts)||0) + (wasOn ? -1 : 1));
  _cmRedrawList(false);
  const r = await DS.communityReact(messageId, 'heart');
  if(!r || !r.success){
    // تراجع
    m.iHearted = wasOn;
    m.hearts = Math.max(0, (Number(m.hearts)||0) + (wasOn ? 1 : -1));
    _cmRedrawList(false);
    toast('فشل التفاعل','error');
  }
}

async function _cmConfirmDelete(messageId){
  const m = _cm.messages.find(x => String(x.id) === String(messageId)); if(!m) return;
  const ok = await confirmModal({ title:'حذف الرسالة', message:'ستظهر "— رسالة محذوفة —" للجميع. متابعة؟', confirmText:'نعم، احذف', danger:true });
  if(!ok) return;
  const r = await guard(DS.communityDelete(messageId), 'حذف…');
  if(!r || !r.success) return toast((r&&r.message)||'فشل الحذف','error');
  m.deleted = true; m.body = '';
  _cmRedrawList(false);
}

/* polling: كل ٣٠ ثانية حين التبويب نشط ومرئي */
function _cmStartPolling(){
  _cmStopPolling();
  _cm.pollTimer = setInterval(() => {
    if(document.visibilityState !== 'visible') return;
    if(!_cm.groupId) return;
    if(Date.now() - _cm.lastRefresh < 25000) return;
    _cmRefresh(false);
  }, 30000);
}
function _cmStopPolling(){
  if(_cm.pollTimer){ clearInterval(_cm.pollTimer); _cm.pollTimer = null; }
}


/* =====================================================================
   دمج مع تنقّل بوابة الطالب
   ===================================================================== */

/* نكمّل _ptNav الأصلية بإضافة "المجتمع" للطلاب الأعضاء في مجموعة */
if(typeof _ptNav === 'function'){
  const _origPtNav = _ptNav;
  _ptNav = function(){
    const par = _pt.role === 'Parent';
    const myGroupId = _pt.dash?.myGroupId;
    if(par || !myGroupId){ return _origPtNav(); }
    const go = k => { _pt.sec = k; _ptRender(); };
    uiNav([
      { k: 'today',     t: 'اليوم',    i: 'home',  onSelect: go },
      { k: 'community', t: 'المجتمع',  i: 'chat',  onSelect: go },
      { k: 'progress',  t: 'تقدّمي',   i: 'chart', onSelect: go },
      { k: 'news',      t: 'الأخبار',  i: 'news',  onSelect: go }
    ], _pt.sec, { moreLabel: 'حسابي', moreIcon: 'lock' });
  };
}

/* نلفّ _ptRender لتوجيه sec='community' إلى شاشة المجتمع.
   مهم: نُعيد رسم الـ nav في كل مرة — renderStudent() ينادي _ptNav() مرة قبل
   تحميل dash، فيُفقَد تبويب "المجتمع" (لأن myGroupId لم يصل بعد). إعادة الرسم
   هنا تضمن ظهور التبويب فور وصول البيانات. */
if(typeof _ptRender === 'function'){
  const _origPtRender = _ptRender;
  _ptRender = function(){
    try { if(typeof _ptNav === 'function') _ptNav(); } catch(e) {}
    if(_pt.sec === 'community' && _pt.role === 'Student'){
      const P = $('portal'); if(!P) return;
      const groupId = _pt.dash?.myGroupId;
      if(!groupId){
        P.innerHTML = `<div class="u-page"><div class="u-card"><div class="u-empty">${svg('users','w-8 h-8')}<div style="margin-top:8px">لست عضواً في مجموعة بعد — راجع المعلم</div></div></div></div>`;
        return;
      }
      const groupName = _ptGroupName(_pt.dash) || '';
      P.innerHTML = _cmRenderShell(groupName);
      if(_cm.groupId !== groupId || !_cm.initialLoad){
        _cmLoad(groupId);
      } else {
        _cmRedrawList(true);
        _cmRefresh(false);
      }
      _cmStartPolling();
      return;
    }
    _cmStopPolling();
    _origPtRender();
  };
}


/* =====================================================================
   شاشة المعلم: قائمة مجموعات + خيط لكل منها
   تُستدعى من قسم الإعدادات (settings.js يضيف route 'communities')
   ===================================================================== */

window._tcm = window._tcm || { selectedGroupId: '' };

async function renderTeacherCommunities(body){
  body = body || $('settingsSubBody'); if(!body) return;
  const groups = (_tData?.groups || []);
  if(!groups.length){
    body.innerHTML = `<div class="u-card"><div class="u-empty">${svg('users','w-8 h-8')}<div style="margin-top:8px">لا توجد مجموعات بعد — أنشئ مجموعة من قسم المجموعات</div></div></div>`;
    return;
  }
  if(!_tcm.selectedGroupId || !groups.some(g => String(g.Group_ID) === String(_tcm.selectedGroupId))){
    _tcm.selectedGroupId = String(groups[0].Group_ID);
  }
  const students = (_tData?.students || []);
  const chip = (g) => {
    const count = students.filter(s => String(s.Group_ID) === String(g.Group_ID)).length;
    return `<button type="button" class="u-chip ${_tcm.selectedGroupId===String(g.Group_ID)?'on':''}" onclick="_tcmSelectGroup(${jsArg(g.Group_ID)})">${esc(g.Group_Name)} <span class="u-num">${count}</span></button>`;
  };

  body.innerHTML = `<div class="fade-in" style="max-width:720px;margin:0 auto">
    <div class="u-chips" style="margin-bottom:14px">${groups.map(chip).join('')}</div>
    <div id="tcm_chat"></div>
  </div>`;
  _tcmRenderChat();
}

function _tcmSelectGroup(gid){
  _tcm.selectedGroupId = String(gid);
  const groups = (_tData?.groups || []);
  // تحديث chips
  document.querySelectorAll('#settingsSubBody .u-chip').forEach(b => {
    const expected = groups.find(g => b.textContent.trim().startsWith(g.Group_Name));
    b.classList.toggle('on', expected && String(expected.Group_ID) === String(gid));
  });
  _tcmRenderChat();
}

function _tcmRenderChat(){
  const box = $('tcm_chat'); if(!box) return;
  const groups = (_tData?.groups || []);
  const g = groups.find(x => String(x.Group_ID) === String(_tcm.selectedGroupId));
  if(!g){ box.innerHTML = `<div class="u-empty">اختر مجموعة</div>`; return; }
  box.innerHTML = _cmRenderShell(g.Group_Name);
  if(_cm.groupId !== String(g.Group_ID)){
    _cmLoad(String(g.Group_ID));
  } else {
    _cmRedrawList(true);
    _cmRefresh(false);
  }
  _cmStartPolling();
}

/* نظّف polling عند مغادرة الصفحة */
if(typeof window !== 'undefined'){
  window.addEventListener('beforeunload', _cmStopPolling);
}

/* إضافة قسم المجتمع لتبويبات إعدادات المعلم (settings.js) */
if(typeof _PAGES === 'object' && _PAGES && !_PAGES.communities){
  _PAGES.communities = { label:'مجتمعات المجموعات', icon:'chat', group:'data' };
  if(typeof _PAGE_DISPATCH === 'object' && _PAGE_DISPATCH){
    _PAGE_DISPATCH.communities = (b) => renderTeacherCommunities(b);
  }
}
