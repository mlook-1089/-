/* =====================================================================
   إصلاحات الخطط والمتابعة — المرحلة ١ (الواجهة فقط، لا تعديل خادم/schema)
   يُحمَّل بعد كل ملفات الواجهة. يُعيد تعريف الدوال التالية بنسخ مصحَّحة:

     [E] doSavePlanDays       — فحص فعلي لنتيجة الحفظ (كان يُعلن النجاح بلا فحص)
     [J] renderPlanDaysTab    — أزرار أيام الحلقة تظهر محدَّدة بصرياً (كانت لا تظهر)
     [N] _mpShiftDay          — تخطّي أيام العطلة في زرَّي السابق/التالي
     [L] _fuSetRangeDir       — افتراضي "من الناس إلى الفاتحة" يبدأ من الناس ٦ (كان ١)
     [D] doMpSaveItem         — auto-partial بحسبة اتجاهية بدل Math.abs (كان يقبل وصولاً خلفياً كمكتمل)

   المهام الخادميّة (A/B/C/F/G/H/I/K) تُنفَّذ في محادثة أخرى.
   ===================================================================== */


/* ===================================================================== */
/*       [J + E]  أيام الحلقة — تظهر محدَّدة + حفظ موثوق                     */
/* ===================================================================== */
async function renderPlanDaysTab(body){
  body = body || $('settingsSubBody') || $('portal'); if(!body) return;
  body.innerHTML = `<div class="u-empty">${svg('calendar','w-8 h-8')}<div style="margin-top:8px">تحميل إعدادات الفصل…</div></div>`;
  const r = await DS.getSettings(['plan_work_days','plan_term_start','plan_term_end']);
  if(!r || !r.success){
    body.innerHTML = `<div class="u-card"><div class="u-empty" style="color:var(--bad)">فشل تحميل الإعدادات</div></div>`;
    return;
  }
  const vals = r.values || {};
  const savedDays = vals.plan_work_days ? vals.plan_work_days.split(',').map(Number).filter(n=>n>=0&&n<=6) : [0,1,2,3,4];
  const savedStart = vals.plan_term_start || '';
  const savedEnd   = vals.plan_term_end   || '';
  const dayLabels = ['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];

  const dayCell = (lbl, i) => {
    const on = savedDays.includes(i);
    return `<button type="button" data-day="${i}" aria-pressed="${on}" onclick="pdToggleDay(this)"
      style="padding:10px 0;border-radius:10px;border:1px solid ${on?'var(--brand)':'var(--line)'};background:${on?'var(--brand)':'var(--card)'};color:${on?'var(--on-brand)':'var(--ink2)'};font-size:12px;font-weight:800;text-align:center;cursor:pointer;font-family:inherit;transition:background .15s,color .15s,border-color .15s">${lbl}</button>`;
  };

  body.innerHTML = `<div class="fade-in" style="max-width:520px;margin:0 auto">
    <div class="u-card">
      <h3 style="font-size:16px;font-weight:800;color:var(--ink);margin-bottom:4px">إعدادات الفصل الدراسي</h3>
      <p class="u-muted" style="line-height:1.65;margin-bottom:14px">تُطبّق هذه الإعدادات على جميع الخطط التي تنشئها. يمكنك تغييرها في بداية كل فصل.</p>
      <div class="u-grid2">
        <div class="u-field" style="margin-bottom:0"><label for="pd_start">بداية الفصل</label>
          <input type="date" id="pd_start" value="${esc(savedStart)}" class="u-input num">
        </div>
        <div class="u-field" style="margin-bottom:0"><label for="pd_end">نهاية الفصل</label>
          <input type="date" id="pd_end" value="${esc(savedEnd)}" class="u-input num">
        </div>
      </div>
      <div class="u-field">
        <label>أيام الحلقة في الأسبوع</label>
        <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px" id="pd_days">
          ${dayLabels.map((d,i)=>dayCell(d,i)).join('')}
        </div>
        <div class="u-muted" style="margin-top:6px;font-size:11.5px"><span id="pd_days_count">${savedDays.length}</span> أيام مختارة</div>
      </div>
      <button onclick="doSavePlanDays()" class="u-btn u-btn-p w">${svg('cloud','w-4 h-4')} حفظ إعدادات الفصل</button>
    </div>
  </div>`;
}

/* تبديل حالة يوم بـ JS inline (بدل peer-checked:*) — تظهر فورياً */
function pdToggleDay(btn){
  const on = btn.getAttribute('aria-pressed') !== 'true';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.style.background   = on ? 'var(--brand)'      : 'var(--card)';
  btn.style.color        = on ? 'var(--on-brand)'   : 'var(--ink2)';
  btn.style.borderColor  = on ? 'var(--brand)'      : 'var(--line)';
  const sel = Array.from(document.querySelectorAll('#pd_days button[aria-pressed="true"]')).length;
  const c = $('pd_days_count'); if(c) c.textContent = sel;
}

/* حفظ بفحص فعلي لنتائج الطلبات الثلاثة — بدون فحص كان يُعلن النجاح حتى عند فشل الخادم */
async function doSavePlanDays(){
  const start = $('pd_start')?.value.trim() || '';
  const end   = $('pd_end')?.value.trim()   || '';
  const days  = Array.from(document.querySelectorAll('#pd_days button[aria-pressed="true"]')).map(b => Number(b.dataset.day));

  if(!start || !end)  return toast('أدخل تاريخي البداية والنهاية','warn');
  if(start > end)     return toast('البداية يجب أن تسبق النهاية','warn');
  if(!days.length)    return toast('اختر يوماً واحداً على الأقل','warn');

  const prev = _tData?.planConfig || {};
  const termChanged = String(prev.termStart||'') !== start
                   || String(prev.termEnd||'')   !== end
                   || String((prev.workDays||[]).join(',')) !== days.join(',');

  const r1 = await guard(DS.setSetting('plan_term_start', start), 'حفظ…');
  const r2 = await guard(DS.setSetting('plan_term_end',   end),   'حفظ…');
  const r3 = await guard(DS.setSetting('plan_work_days',  days.join(',')), 'حفظ…');

  // فحص فعلي: ثلاثتها يجب أن تنجح — وإلا نُلغي التحديث المحلي ونُظهر خطأ
  if(!r1 || !r1.success || !r2 || !r2.success || !r3 || !r3.success){
    const which = [];
    if(!r1 || !r1.success) which.push('بداية الفصل');
    if(!r2 || !r2.success) which.push('نهاية الفصل');
    if(!r3 || !r3.success) which.push('أيام الحلقة');
    return toast('فشل حفظ: ' + which.join('، ') + ' — راجع الاتصال وأعِد المحاولة','error');
  }

  if(_tData) _tData.planConfig = { workDays: days, termStart: start, termEnd: end };
  toast('تم حفظ إعدادات الفصل');

  const manualPlans = (_tData?.plans||[]).filter(p => p.Source==='Manual' && p.Type==='conserve');
  if(termChanged && manualPlans.length){
    const count = new Set(manualPlans.map(p => p.Student_ID)).size;
    setTimeout(() => (typeof openRegenerateAllPlans==='function') && openRegenerateAllPlans(count), 400);
  } else {
    renderPlanDaysTab($('settingsSubBody'));
  }
}


/* ===================================================================== */
/*       [N]  انتقال السابق/التالي يحترم أيام الحلقة                        */
/* ===================================================================== */
function _mpShiftDay(n){
  const wd = (_tData?.planConfig?.workDays || []).slice();
  const todayStr = (typeof ymd === 'function') ? ymd(new Date()) : '';
  const step = n > 0 ? 1 : -1;
  const limit = Math.abs(n) || 1;

  const d = new Date(_mp.date + 'T12:00:00');
  let found = null;

  if(wd.length){
    // تخطّي الأيام غير العاملة حتى نجد عدد خطوات مساوي للطلب
    let hops = 0;
    for(let safe = 0; safe < 120 && hops < limit; safe++){
      d.setDate(d.getDate() + step);
      if(wd.includes(d.getDay())){
        hops++;
        found = ymd(d);
      }
    }
    if(!found) return; // لم نجد يوم حلقة ضمن ١٢٠ يوم (شيء غير متوقع)
  } else {
    // لا توجد أيام محددة → السلوك القديم (يوم تقويمي كامل)
    d.setDate(d.getDate() + n);
    found = ymd(d);
  }

  if(found > todayStr) return; // لا نسمح بتجاوز اليوم الحالي
  _mp.date = found;
  renderManualPlanTab($('fuSubBody'));
}


/* ===================================================================== */
/*       [L]  افتراضي "من الناس إلى الفاتحة" يبدأ من آخر آية                 */
/* ===================================================================== */
function _fuSetRangeDir(sfx, dir){
  const id = k => `cp_${k}${sfx}`;
  const surs   = _tData?.surahs       || [];
  const counts = _tData?.surahCounts  || [];
  if(!surs.length) return;

  const first = surs[0] || '';
  const last  = surs[surs.length - 1] || '';
  const lastAyat = counts[surs.length - 1] || 1;

  $(id('dirAsc'))?.classList.toggle('on', dir === 'asc');
  $(id('dirDesc'))?.classList.toggle('on', dir === 'desc');

  if(dir === 'desc'){
    // من الناس (كاملة) إلى الفاتحة ١
    if($(id('fromS'))) $(id('fromS')).value = last;
    if($(id('fromA'))) $(id('fromA')).value = String(lastAyat); // ← كان 1، فيُسقط الناس ٢-٦
    if($(id('toS')))   $(id('toS')).value   = first;
    if($(id('toA')))   $(id('toA')).value   = '1';
  } else {
    // من الفاتحة ١ إلى الناس (كاملة)
    if($(id('fromS'))) $(id('fromS')).value = first;
    if($(id('fromA'))) $(id('fromA')).value = '1';
    if($(id('toS')))   $(id('toS')).value   = last;
    if($(id('toA')))   $(id('toA')).value   = String(lastAyat); // ← كان 1، فيُسقط آخر آيات الناس
  }

  if(typeof _cpUpdateAyahMax === 'function'){
    _cpUpdateAyahMax(id('fromA'), id('fromS'));
    _cpUpdateAyahMax(id('toA'),   id('toS'));
  }
}


/* ===================================================================== */
/*       [D]  doMpSaveItem — auto-partial بحسبة اتجاهية (لا Math.abs)      */
/* ===================================================================== */
async function doMpSaveItem(planId, status){
  const form = document.querySelector(`[data-mp-form="${planId}"]`);

  // auto-partial: إذا الوصول المرصود < المطلوب → حدّد كـ Partial. الحسبة اتجاهية صارمة.
  if(status === 'Done' && form){
    const p = (_tData.plans || []).find(x => String(x.Plan_ID) === String(planId));
    const req = Number(p?.Amount) || 0;
    if(p && req > 0){
      const toSurahEl = form.querySelector('[data-k="toSurah"]');
      const toAyahEl  = form.querySelector('[data-k="toAyah"]');
      if(toSurahEl && toAyahEl){
        const fromOrd = qAyahOrdinal(String(p.From_Surah), Number(p.From_Ayah) || 1);
        const toOrd   = qAyahOrdinal(String(toSurahEl.value), Number(toAyahEl.value) || 1);

        // رفض الوصول العكسي (المعلم أدخل آية قبل بداية الورد)
        if(toOrd < fromOrd){
          return toast('آية الوصول قبل آية البداية — راجع القيمة','warn');
        }

        const actual = toOrd - fromOrd + 1; // ← كان Math.abs(toOrd - fromOrd) + 1 (يقبل عكسياً)
        if(actual > 0 && actual < req) status = 'Partial';
      }
    }
  }

  const upd = { Accomplishment_Status: status };
  let attStatus = null;
  if(form){
    form.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k, v = el.value;
      if(k === 'toSurah')     upd.To_Surah   = v;
      else if(k === 'toAyah') upd.To_Ayah    = v;
      else if(k === 'attendance') attStatus  = v;
      else if(k === 'mistakes')   upd.Mistakes   = Number(v) || 0;
      else if(k === 'hearing')    upd.Hearing    = Number(v) || 0;
      else if(k === 'repetition') upd.Repetition = Number(v) || 0;
    });
  }

  const r = await guard(DS.updatePlan(planId, upd), 'حفظ التقييم…');
  if(!r || !r.success) return toast((r && r.message) || 'فشل','error');

  const p = (_tData.plans || []).find(x => String(x.Plan_ID) === String(planId));
  if(p){
    Object.assign(p, {
      Accomplishment_Status: status,
      To_Surah: upd.To_Surah || p.To_Surah,
      To_Ayah:  upd.To_Ayah  || p.To_Ayah,
      Mistakes:   upd.Mistakes,
      Hearing:    upd.Hearing,
      Repetition: upd.Repetition
    });
  }
  if(p && attStatus){
    try{
      await DS.saveAttendance(p.Student_ID, _mp.date, attStatus, 'مع الرصد', currentUser.ID);
      _tData.attendance = (_tData.attendance || []).filter(a => !(String(a.Student_ID) === String(p.Student_ID) && String(a.Date) === String(_mp.date)));
      _tData.attendance.push({ Att_ID:'A_'+p.Student_ID+'_'+_mp.date, Student_ID:p.Student_ID, Date:_mp.date, Status:attStatus, Note:'مع الرصد' });
    }catch(e){}
  }
  await refreshTeacherStudents();
  toast('تم الحفظ' + (r.awarded?.length ? ` · +${r.awarded.length} بند نقاط` : ''));
  renderManualPlanTab($('fuSubBody'));
}
