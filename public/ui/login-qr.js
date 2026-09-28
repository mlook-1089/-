/* =====================================================================
   باركودات دخول للطلاب: توليد QR لكل طالب برابط دخول لمرة واحدة.
   الطالب يمسحه بجواله → يُنشأ له جلسة تلقائياً → يُطلب منه تعيين كلمة مرور.
   ===================================================================== */

const _QR_LIB = '/vendor/qrcode.min.js';
let _qrP = null;
function _ensureQR(){
  if(typeof qrcode === 'function') return Promise.resolve();
  return _qrP ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = _QR_LIB;
    s.onload = () => res(); s.onerror = () => { _qrP = null; rej(new Error('تعذّر تحميل مكتبة الباركود')); };
    document.head.appendChild(s);
  });
}
function _qrOrigin(){ return location.origin.replace(/\/$/, ''); }
function _qrURL(token){ return `${_qrOrigin()}/?t=${encodeURIComponent(token)}`; }

/** توليد باركود طالب واحد أو أكثر */
async function openLoginQR(ids){
  const list = (ids || []).map(String).filter(Boolean);
  if(!list.length) return toast('لم يُحدَّد أي طالب', 'warn');
  loader(true, 'توليد الباركودات…');
  let tokens;
  try{
    await _ensureQR();
    const res = await fetch('/api/auth/login-token', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: list })
    });
    const j = await res.json();
    if(!j.success){ loader(false); return toast(j.message || 'فشل التوليد', 'error'); }
    tokens = j.tokens || [];
  } catch(e){ loader(false); return toast(e.message || 'خطأ', 'error'); }
  loader(false);
  if(!tokens.length) return toast('لا يوجد طلاب صالحون في التحديد', 'warn');

  const cards = tokens.map((t, i) => `<div class="qr-card" data-qr-idx="${i}">
    <div class="qr-name">${esc(t.name)}</div>
    <div class="qr-id" dir="ltr">${esc(t.id)}</div>
    <div class="qr-img" id="qr_${i}"></div>
    <div class="qr-hint">امسح الباركود للدخول وتعيين كلمة مرور</div>
  </div>`).join('');

  openModal(tokens.length === 1 ? 'باركود دخول الطالب' : `باركودات دخول · ${tokens.length}`, `
    <style id="qr-print-styles">
      .qr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
      .qr-card{border:1px solid var(--line);border-radius:14px;padding:14px 10px;background:var(--card);text-align:center}
      .qr-name{font-weight:800;font-size:15px;color:var(--ink);margin-bottom:2px}
      .qr-id{font-size:11px;color:var(--ink3);font-family:monospace;margin-bottom:10px}
      .qr-img{background:#fff;padding:8px;border-radius:10px;display:inline-block;line-height:0}
      .qr-img canvas, .qr-img img, .qr-img svg{width:150px !important;height:150px !important;display:block}
      .qr-hint{font-size:10.5px;color:var(--ink3);margin-top:8px;font-weight:600}
      @media print{
        body *{visibility:hidden}
        #qr-print-area, #qr-print-area *{visibility:visible}
        #qr-print-area{position:absolute;inset:0;background:#fff !important;padding:16px;overflow:visible !important;max-height:none !important}
        .qr-card{page-break-inside:avoid;border-color:#ddd !important;background:#fff !important}
        .qr-name,.qr-id,.qr-hint{color:#000 !important}
      }
    </style>
    <div class="u-plan" style="background:var(--info-soft);border-color:transparent;font-size:12.5px;color:var(--info);margin-bottom:12px">
      كل باركود يعمل مرة واحدة فقط: عند دخول الطالب لأول مرة يُطلب منه تعيين كلمة مرور جديدة، ويصبح الباركود مستهلَكاً.
    </div>
    <div id="qr-print-area" class="qr-grid" style="max-height:60vh;overflow:auto">${cards}</div>
    <div class="u-grid2" style="margin-top:14px">
      <button type="button" class="u-btn u-btn-g" onclick="closeModal()">إغلاق</button>
      <button type="button" class="u-btn u-btn-p" onclick="window.print()">${svg('print','w-4 h-4')} طباعة</button>
    </div>`);

  // ارسم الباركودات بعد ظهور الـ DOM
  await new Promise(r => setTimeout(r, 50));
  for(let i = 0; i < tokens.length; i++){
    const el = document.getElementById('qr_' + i);
    if(!el) continue;
    try{
      // eslint-disable-next-line no-undef
      const qr = qrcode(0, 'M');
      qr.addData(_qrURL(tokens[i].token));
      qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
      const svg = el.querySelector('svg'); if(svg){ svg.setAttribute('width','150'); svg.setAttribute('height','150'); }
    } catch(e){
      el.innerHTML = `<div style="font-size:10px;color:#c00;word-break:break-all">${esc(_qrURL(tokens[i].token))}</div>`;
    }
  }
}

/** طباعة باركودات كل الطلاب المعروضين حالياً */
async function openLoginQRAll(){
  const ids = (_tData?.students || []).map(s => String(s.Student_ID)).filter(Boolean);
  if(!ids.length) return toast('لا يوجد طلاب', 'warn');
  if(ids.length > 60){
    const ok = await confirmModal({ title: 'عدد كبير', message: `سيتم توليد ${ids.length} باركود. متابعة؟`, confirmText: 'نعم' });
    if(!ok) return;
  }
  openLoginQR(ids);
}

/** إذا كان الرابط يحمل ?t=<token> نستهلكه ونحوّل الطالب لتغيير كلمة المرور */
async function _consumeLoginToken(){
  const q = new URLSearchParams(location.search);
  const token = q.get('t');
  if(!token) return false;
  // نظّف الرابط لتفادي إعادة الاستهلاك عند التحديث
  try{ history.replaceState(null, '', location.pathname); }catch(e){}
  loader(true, 'جارٍ الدخول…');
  try{
    const res = await fetch('/api/auth/login-token', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const j = await res.json();
    loader(false);
    if(!j.success || !j.user){ toast(j.message || 'الباركود منتهي', 'error'); return true; }
    // امسح أي جلسة قديمة على الجهاز، ثم ادخل مباشرةً وسيُطلب تغيير كلمة المرور تلقائياً
    try{ clearSession(); }catch(e){}
    enterApp(j.user);
    return true;
  } catch(e){
    loader(false);
    toast(e.message || 'خطأ', 'error');
    return true;
  }
}

// اربط استهلاك التوكن على تحميل الصفحة قبل استعادة الجلسة العادية
window.addEventListener('DOMContentLoaded', () => {
  if(new URLSearchParams(location.search).has('t')){
    // شغّل بعد تحميل الوحدات (loadBrandingOnce + الجلسة المُخزَّنة)
    setTimeout(() => _consumeLoginToken(), 100);
  }
});
