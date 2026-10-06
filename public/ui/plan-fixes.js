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


/* =====================================================================
   المرحلة ٢ — المقدار اليومي بوحدة الوجه (صفحة مصحف المدينة) الحقيقية
   ===================================================================== */

/* ---------- وحدات المقدار اليومي: الوجه = صفحة مصحف المدينة ---------- */
/* نُفرِغ المحتوى القديم (كان يحمل تقديرات ثابتة بالآيات ممّا يسبب أخطاء)
   ونضع تعريفاً دقيقاً بالصفحات. الخادم يستخدم الصفحة الفعلية لحساب
   مدى الآيات لكل يوم، فيختلف بين البقرة (وجه ≈ ٥ آيات) وجزء عمّ (وجه ≈ ٢٠ آية). */
Object.keys(MP_UNITS).forEach(k => delete MP_UNITS[k]);
Object.assign(MP_UNITS, {
  quarter:   { label: 'ربع وجه',  pages: 0.25 },
  half:      { label: 'نصف وجه',  pages: 0.5  },
  full:      { label: 'وجه',       pages: 1    },
  wajh_half: { label: 'وجه ونصف', pages: 1.5  },
  page:      { label: 'وجهان',    pages: 2    }
});

/* ---------- مساعد API لجلب تعريف خطة الطالب ---------- */
DS.getPlanDefinition = function(studentId, type){
  const url = '/api/plans/definitions?studentId=' + encodeURIComponent(studentId) + '&type=' + encodeURIComponent(type || '');
  return fetch(url, { credentials: 'include' }).then(r => r.json()).catch(() => null);
};

/* تاريخ بدء افتراضي للخطة الجديدة: اليوم، أو بداية الفصل إن كانت مستقبلاً */
function _fuSuggestStart(cfg){
  const today = ymd(new Date());
  const start = cfg?.termStart || '';
  const end   = cfg?.termEnd   || '';
  // لو اليوم بعد نهاية الفصل، استخدم بداية الفصل كمحاولة أخيرة
  if(end && today > end) return start || today;
  // لو اليوم قبل بداية الفصل (الفصل مستقبلي)، ابدأ من بداية الفصل
  if(start && today < start) return start;
  return today;
}

/* ---------- نافذة إنشاء خطة فصلية — بلا "مخصّص بالآيات" ---------- */
function openCreateManualPlan(sid, edit){
  const targetId = sid || _mp.studentId;
  if(!targetId) return toast('اختر طالباً','warn');
  _mp.studentId = targetId;
  _cpRangeCount = 0;
  const {nameMap} = tMaps();
  const name = nameMap[targetId] || targetId;
  const surs = _tData?.surahs || [];
  const surOpts = surs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const unitOpts = Object.entries(MP_UNITS).map(([k,v]) =>
    `<option value="${k}" ${k==='full'?'selected':''}>${v.label}</option>`).join('');
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
      <div><label ${_FU_LBL}>المقدار اليومي</label><select id="cp_unit" class="u-input">${unitOpts}</select></div>
    </div>
    ${edit ? '' : `<div class="u-field"><label>تاريخ بداية الخطة</label>
      <input type="date" id="cp_start_date" class="u-input u-num"
        value="${esc(_fuSuggestStart(cfg))}"
        min="${esc(cfg.termStart||'')}" max="${esc(cfg.termEnd||'')}">
      <div class="u-muted" style="margin-top:4px;font-size:11.5px">افتراضياً: اليوم (أو بداية الفصل إن كان مستقبلاً). غيّره لبدء خطة جديدة من يوم محدَّد ضمن الفصل.</div>
    </div>`}
    <div class="u-note brand" style="margin-bottom:12px;font-size:11.5px">الوجه = صفحة مصحف المدينة. تختلف الآيات لكل يوم حسب كثافة الآيات في موضع الطالب.</div>
    <div class="u-plan" style="background:var(--card2);margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px">المدى القرآني</div>
      ${_fuRangeHTML('', surOpts)}
      <div id="cp_extra_ranges"></div>
      <button type="button" class="u-btn sm u-btn-s w" style="margin-top:10px" onclick="_cpAddRange()">${svg('plus','w-4 h-4')} نطاق تالٍ</button>
    </div>
    ${edit ? '' : `<label class="u-row" style="gap:8px;font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:14px;cursor:pointer">
      <input type="checkbox" id="cp_replace" style="width:18px;height:18px;accent-color:var(--brand)"> استبدال أي خطة قائمة من النوع نفسه في هذا المدى
    </label>`}
    ${edit ? `<button type="button" class="u-btn u-btn-bad w" style="margin-bottom:10px" onclick="confirmDeleteStudentPlan(${jsArg(targetId)},${jsArg(edit.type)})">
      ${svg('trash','w-4 h-4')} حذف هذه الخطة بالكامل
    </button>` : ''}
    <div class="u-grid2" style="margin:0">
      <button type="button" class="u-btn u-btn-g" onclick="closeModal()">إلغاء</button>
      ${edit
        ? `<button type="button" class="u-btn u-btn-p" onclick="doSaveFullPlan(${jsArg(targetId)},${jsArg(edit.type)})">حفظ وإعادة التوليد</button>`
        : `<button type="button" class="u-btn u-btn-p" onclick="doCreateManualPlan()">إنشاء الخطة</button>`}
    </div>`);
  if(edit) _fuPrefillPlan(edit);
}

/* ---------- قراءة النموذج: المقدار الآن بالصفحات ---------- */
function _fuReadPlanForm(){
  const val = id => $(id)?.value;
  const ranges = [];
  const add = sfx => {
    const fS = val('cp_fromS' + sfx), tS = val('cp_toS' + sfx);
    if(fS && tS) ranges.push({ fromSurah:fS, fromAyah:Number(val('cp_fromA' + sfx))||1, toSurah:tS, toAyah:Number(val('cp_toA' + sfx))||1 });
  };
  add('');
  document.querySelectorAll('[id^="cp_range_"]').forEach(div => add('_' + div.id.replace('cp_range_', '')));
  const unit = val('cp_unit') || 'full';
  const dailyPages = (MP_UNITS[unit] && Number(MP_UNITS[unit].pages)) || 1;
  return { type: val('cp_type') === 'revision' ? 'revision' : 'conserve', ranges, dailyPages, unit };
}

/* ---------- إنشاء الخطة: نرسل dailyPages بدل dailyAmount ---------- */
async function doCreateManualPlan(){
  const type = $('cp_type').value;
  const unit = $('cp_unit').value;
  const planCfg = _tData?.planConfig || {};
  // تاريخ البدء المختار (قد يكون "اليوم" للخطط اللاحقة ضمن نفس الفصل) — أو بداية الفصل كـ fallback
  const chosenStart = $('cp_start_date')?.value || '';
  const startDate = chosenStart || planCfg.termStart || '';
  const endDate   = planCfg.termEnd   || '';
  const workDays  = planCfg.workDays?.length ? planCfg.workDays : [];
  if(!startDate || !endDate) return toast('عيّن بداية ونهاية الفصل في الإعدادات → أيام الحلقة','warn');
  if(startDate < (planCfg.termStart || '')) return toast('تاريخ البداية قبل بداية الفصل','warn');
  if(startDate > endDate) return toast('تاريخ البداية بعد نهاية الفصل','warn');
  if(!workDays.length)       return toast('عيّن أيام الحلقة في الإعدادات → أيام الحلقة','warn');

  const ranges = [];
  const fromSurah0 = $('cp_fromS').value, toSurah0 = $('cp_toS').value;
  const fromAyah0  = Number($('cp_fromA').value) || 1, toAyah0 = Number($('cp_toA').value) || 1;
  if(!fromSurah0 || !toSurah0) return toast('اختر نطاق القرآن','warn');
  ranges.push({ fromSurah:fromSurah0, fromAyah:fromAyah0, toSurah:toSurah0, toAyah:toAyah0 });
  document.querySelectorAll('[id^="cp_range_"]').forEach(div => {
    const n = div.id.replace('cp_range_','');
    const fS = $(`cp_fromS_${n}`)?.value;
    const fA = Number($(`cp_fromA_${n}`)?.value) || 1;
    const tS = $(`cp_toS_${n}`)?.value;
    const tA = Number($(`cp_toA_${n}`)?.value) || 1;
    if(fS && tS) ranges.push({ fromSurah:fS, fromAyah:fA, toSurah:tS, toAyah:tA });
  });

  const dailyPages = (MP_UNITS[unit] && Number(MP_UNITS[unit].pages)) || 1;
  const replaceExisting = $('cp_replace')?.checked || false;

  const payload = { studentId:_mp.studentId, type, startDate, endDate, ranges, workDays, dailyPages, replaceExisting };
  const r = await guard(DS.planGenerate(payload), 'توليد الخطة…');
  if(!r || !r.success) return toast((r && r.message) || 'فشل التوليد','error');
  closeModal();
  const warn = r.warning ? ' · ' + r.warning : '';
  toast(`تم توليد ${r.created} يوم${r.replaced ? ` (استُبدل ${r.replaced})` : ''}${warn}`, r.warning ? 'warn' : 'success');
  await refreshTeacherStudents();
  if($('fuSubBody')) renderManualPlanTab($('fuSubBody'));
  else if($('settingsSubBody') && _settingsSub === 'allplans') renderAllPlansTab($('settingsSubBody'));
}

/* ---------- حفظ تعديل الخطة الكاملة ---------- */
async function doSaveFullPlan(sid, origType){
  const cfg = _tData?.planConfig || {};
  if(!cfg.termStart || !cfg.termEnd) return toast('عيّن بداية ونهاية الفصل من الإعدادات ← أيام الحلقة','warn');
  const f = _fuReadPlanForm();
  if(!f.ranges.length) return toast('اختر المدى القرآني','warn');
  if(!f.dailyPages || f.dailyPages < 0.1) return toast('اختر مقداراً يومياً صحيحاً','warn');
  const typeChanged = f.type !== origType;
  if(typeChanged && (_tData.plans||[]).some(p => String(p.Student_ID) === String(sid) && p.Type === f.type && p.Source === 'Manual'))
    return toast('لدى الطالب خطة ' + (f.type === 'revision' ? 'مراجعة' : 'حفظ') + ' قائمة — عدّلها هي بدلاً من تغيير النوع','warn');
  const payload = {
    studentId:sid, type:f.type,
    startDate:cfg.termStart, endDate:cfg.termEnd, ranges:f.ranges,
    workDays: cfg.workDays?.length ? cfg.workDays : [0,1,2,3,4],
    dailyPages: f.dailyPages,
    replaceExisting: true
  };
  const r = await guard(DS.planGenerate(payload), 'حفظ الخطة وإعادة توليدها…');
  if(!r || !r.success) return toast((r && r.message) || 'فشل حفظ الخطة','error');
  if(typeChanged) await guard(DS.deleteManualPlans(sid, origType), 'حذف الخطة السابقة…');
  closeModal();
  const warn = r.warning ? ' · ' + r.warning : '';
  toast('تم حفظ الخطة' + (r.created != null ? ' — ' + r.created + ' ورد' : '') + warn, r.warning ? 'warn' : 'success');
  await refreshTeacherStudents();
  if($('fuSubBody')) renderManualPlanTab($('fuSubBody'));
  else if($('settingsSubBody') && _settingsSub === 'allplans') renderAllPlansTab($('settingsSubBody'));
}

/* ---------- فتح نافذة التعديل: نجلب التعريف الحقيقي من plan_definitions ---------- */
async function openEditFullPlan(sid, type){
  sid = String(sid || _mp.studentId || '');
  type = type === 'revision' ? 'revision' : 'conserve';
  if(!sid) return toast('اختر طالباً','warn');
  const cfg = _tData?.planConfig || {};
  if(!cfg.termStart || !cfg.termEnd) return toast('عيّن بداية ونهاية الفصل من الإعدادات ← أيام الحلقة','warn');

  // جلب التعريف الحقيقي من plan_definitions (المصدر الدقيق للمقدار بالصفحات)
  let def = null;
  try{ const r = await DS.getPlanDefinition(sid, type); if(r && r.success && r.definition) def = r.definition; }catch(e){}

  const items = await _fuLoadPlanItems(sid, type);
  if(!items.length && !def) return toast('لا توجد خطة ' + (type === 'revision' ? 'مراجعة' : 'حفظ') + ' لهذا الطالب — أنشئ خطة جديدة','warn');

  let ranges, dailyPages;
  if(def){
    ranges = Array.isArray(def.ranges) ? def.ranges : (typeof def.ranges === 'string' ? (JSON.parse(def.ranges||'[]')) : []);
    dailyPages = Number(def.dailyPages) || 1;
  } else {
    ranges = _fuPlanRanges(items);
    dailyPages = 1;
  }
  const recorded = items.filter(p => (p.Accomplishment_Status || 'Pending') !== 'Pending').length;
  if(!ranges.length) return toast('تعذّر قراءة مدى الخطة','error');
  openCreateManualPlan(sid, { type, ranges, dailyPages, recorded });
}

/* ---------- تعبئة النموذج: نختار الوحدة التي تطابق dailyPages ---------- */
function _fuPrefillPlan(edit){
  if($('cp_type')) $('cp_type').value = edit.type;
  edit.ranges.forEach((rg, i) => {
    if(i > 0) _cpAddRange();
    const sfx = i > 0 ? '_' + _cpRangeCount : '';
    const id = k => `cp_${k}${sfx}`;
    const desc = _fuOrd(rg.fromSurah, rg.fromAyah) > _fuOrd(rg.toSurah, rg.toAyah);
    $(id('dirAsc'))?.classList.toggle('on', !desc);
    $(id('dirDesc'))?.classList.toggle('on', desc);
    if($(id('fromS'))){ $(id('fromS')).value = rg.fromSurah; if(typeof _cpUpdateAyahMax==='function') _cpUpdateAyahMax(id('fromA'), id('fromS')); }
    if($(id('fromA'))) $(id('fromA')).value = rg.fromAyah;
    if($(id('toS'))){ $(id('toS')).value = rg.toSurah; if(typeof _cpUpdateAyahMax==='function') _cpUpdateAyahMax(id('toA'), id('toS')); }
    if($(id('toA'))) $(id('toA')).value = rg.toAyah;
  });
  // اختر الوحدة الأقرب للـ dailyPages المحفوظ
  const pages = Number(edit.dailyPages) || 1;
  let bestKey = 'full', bestDiff = Infinity;
  Object.entries(MP_UNITS).forEach(([k, v]) => {
    const d = Math.abs(Number(v.pages) - pages);
    if(d < bestDiff){ bestDiff = d; bestKey = k; }
  });
  if($('cp_unit')) $('cp_unit').value = bestKey;
}


/* =====================================================================
   المرحلة ٣ — عرض كل المقادير بالوجه (صفحة مصحف المدينة ١٥ سطر)
   بدل عرض عدد الآيات في كل مكان
   ===================================================================== */

/* عدد الصفحات (الأوجه) التي يُغطّيها مدى آيات معيّن.
   يرجع عدد عشري دقيق (0.25، 0.5، 1، 1.5، 2…) بناءً على PAGE_FIRST/PAGE_LAST
   المستمدّة من مصحف المدينة طبعة مجمع الملك فهد. */
function _fuPagesSpanned(fromSurah, fromAyah, toSurah, toAyah){
  const sOrd = qAyahOrdinal(String(fromSurah||''), Number(fromAyah)||1);
  const eOrd = qAyahOrdinal(String(toSurah||''),   Number(toAyah)||1);
  if(!sOrd || !eOrd) return null;
  const lo = Math.min(sOrd, eOrd);
  const hi = Math.max(sOrd, eOrd);
  const loPage = qPageOf(lo);
  const hiPage = qPageOf(hi);

  if(loPage === hiPage){
    const sz = qAyahsOnPage(loPage) || 1;
    return (hi - lo + 1) / sz;
  }

  // جزء الصفحة الأولى
  const loFirst = QP_FIRST[loPage - 1], loLast = QP_LAST[loPage - 1];
  const loSize = (loLast - loFirst + 1) || 1;
  const firstFrac = (loLast - lo + 1) / loSize;

  // صفحات كاملة في المنتصف
  const fullPages = Math.max(0, hiPage - loPage - 1);

  // جزء الصفحة الأخيرة
  const hiFirst = QP_FIRST[hiPage - 1], hiLast = QP_LAST[hiPage - 1];
  const hiSize = (hiLast - hiFirst + 1) || 1;
  const lastFrac = (hi - hiFirst + 1) / hiSize;

  return firstFrac + fullPages + lastFrac;
}

/* صياغة بالعربية الفصيحة. للأرباع المألوفة نُسمّيها، وإلا رقم مع كلمة "وجه". */
function _fuFormatWajh(pages){
  if(pages == null || !Number.isFinite(pages) || pages <= 0) return '';
  // تقريب لأقرب ربع
  const q = Math.round(pages * 4) / 4;
  const named = {
    0.25: 'ربع وجه',
    0.5:  'نصف وجه',
    0.75: 'ثلاثة أرباع وجه',
    1:    'وجه',
    1.25: 'وجه وربع',
    1.5:  'وجه ونصف',
    1.75: 'وجه وثلاثة أرباع',
    2:    'وجهان',
    2.5:  'وجهان ونصف',
    3:    'ثلاثة أوجه',
    4:    'أربعة أوجه'
  };
  if(named[q]) return named[q];
  // قيم أخرى: اعرض بـ عدد أوجه عشري قصير
  const whole = Math.floor(q);
  const frac  = q - whole;
  if(frac === 0) return `${whole} وجه`;
  // كسر غريب — رقم عشري موجز
  return `${q.toFixed(2).replace(/\.?0+$/,'')} وجه`;
}

/* ---------- بطاقة ورد اليوم: المقدار يُعرض بالوجه ---------- */
/* نسخة من renderMpPlanItem في followup.js مع سطر واحد مُغيَّر:
   "المقدار: N آية" → "المقدار: <ربع وجه | نصف وجه | وجه ... >"               */
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

  // 🔄 المقدار بالوجه بدل الآيات
  const pages = _fuPagesSpanned(p.From_Surah, p.From_Ayah, p.To_Surah, p.To_Ayah);
  const wajhStr = _fuFormatWajh(pages);

  const smallBtn = 'style="width:34px;height:34px;border-radius:10px"';
  const head = `<div class="u-row" style="gap:6px;margin-bottom:8px">
      ${typeTag}${statusPill}
      <span class="u-grow"></span>
      <button type="button" class="u-icon-btn" ${smallBtn} title="خيارات" aria-label="خيارات" onclick="openMpPlanMenu(${jsArg(pid)},${jsArg(p.Student_ID)})">${svg('edit','w-4 h-4')}</button>
      <button type="button" class="u-icon-btn" ${smallBtn} title="حذف الورد" aria-label="حذف الورد" onclick="doMpDeleteItem(${jsArg(pid)})">${svg('trash','w-4 h-4')}</button>
    </div>
    <div class="u-name" style="font-size:15px">${_fuAyahRange(p)}</div>
    ${wajhStr?`<div class="u-muted" style="margin-top:2px">المقدار: <b>${esc(wajhStr)}</b></div>`:''}`;

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

/* ---------- بطاقة "خطط جميع الطلاب": المقدار اليومي بالوجه ---------- */
function _apCard(r){
  const pct = r.total ? Math.round(r.done / r.total * 100) : 0;
  const ranges = r.ranges.map(g => `<div class="u-name" style="font-size:14.5px">من ${esc(g.fromSurah)} <span class="u-num">${esc(g.fromAyah)}</span> ← إلى ${esc(g.toSurah)} <span class="u-num">${esc(g.toAyah)}</span></div>`).join('');
  // r.daily = متوسط آيات/يوم (موروث). نحوّله لوجه بقسمته على حجم صفحة متوسط عند أول آية في المدى.
  // لعرض أوضح: نحسب "إجمالي الوجه ÷ أيام الخطة" بناءً على نطاقات r.ranges.
  let totalPages = 0;
  r.ranges.forEach(g => {
    const p = _fuPagesSpanned(g.fromSurah, g.fromAyah, g.toSurah, g.toAyah);
    if(p && isFinite(p)) totalPages += Math.abs(p);
  });
  const dailyWajh = r.total > 0 ? _fuFormatWajh(totalPages / r.total) : '';
  return `<div class="u-card" style="padding:12px 14px">
    <div class="u-row" style="align-items:flex-start">
      <div class="u-avatar">${esc(String(r.name).trim().charAt(0))}</div>
      <div class="u-grow">
        <div class="u-name">${esc(r.name)}</div>
        <div class="u-row" style="gap:6px;flex-wrap:wrap;margin-top:6px">
          ${r.type === 'revision' ? '<span class="u-tag rev">مراجعة</span>' : '<span class="u-tag">حفظ</span>'}
          ${dailyWajh ? `<span class="u-pill info"><b>${esc(dailyWajh)}</b> يومياً</span>` : ''}
          ${r.groupName ? `<span class="u-muted">${esc(r.groupName)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button type="button" class="u-btn sm u-btn-p" onclick="openEditFullPlan(${jsArg(r.sid)},${jsArg(r.type)})">${svg('edit','w-4 h-4')} تعديل</button>
        <button type="button" class="u-icon-btn" style="width:36px;height:36px;color:var(--bad);background:var(--bad-soft);border-color:transparent" title="حذف الخطة" aria-label="حذف الخطة" onclick="confirmDeleteStudentPlan(${jsArg(r.sid)},${jsArg(r.type)})">${svg('trash','w-4 h-4')}</button>
      </div>
    </div>
    <div class="u-plan" style="margin-top:10px;display:grid;gap:4px">${ranges}</div>
    <div class="u-between" style="margin-top:8px"><span class="u-muted">أُنجز <span class="u-num">${r.done}</span> من <span class="u-num">${r.total}</span> ورد</span><span class="u-muted u-num">${pct}%</span></div>
    <div class="u-bar light" style="margin-top:4px"><i style="width:${pct}%"></i></div>
  </div>`;
}

/* ---------- Toast حين إنشاء خطة: يذكر الوجه بدل عدد الأوراد ---------- */
/* (نترك الأوراد للمعلومات، لكن نضيف تفصيل الوجه إن توفّر) — إخلاء دالّة doCreateManualPlan
   سبق أن أنشأناها في المرحلة ٢. */


/* =====================================================================
   حذف خطة طالب معيّن — من "خطط الطلاب" أو من نافذة التعديل
   ===================================================================== */

async function confirmDeleteStudentPlan(sid, type){
  if(!sid) return;
  const { nameMap } = tMaps();
  const name = nameMap[sid] || sid;
  const typeLabel = type === 'revision' ? 'المراجعة' : (type === 'conserve' ? 'الحفظ' : '');
  const typeAr = typeLabel ? `خطة ${typeLabel}` : 'جميع الخطط';

  // عدّ ما سيُحذف لعرضه في التأكيد
  const plans = (_tData.plans || []).filter(p =>
    String(p.Student_ID) === String(sid) &&
    p.Source === 'Manual' &&
    (type ? p.Type === type : true)
  );
  const total = plans.length;
  const done  = plans.filter(p => p.Accomplishment_Status === 'Done').length;
  const upcoming = plans.filter(p => (p.Accomplishment_Status || 'Pending') === 'Pending').length;

  if(!total){
    return toast('لا توجد أوراد لحذفها','warn');
  }

  const warnHtml = done > 0
    ? `<div class="u-note bad" style="margin-top:10px;margin-bottom:0;text-align:right">
        <b>تنبيه:</b> ${done} ورد منها مُنجَزة — <b>ستُسحب نقاطها</b> من مجموع الطالب تلقائياً.
       </div>`
    : '';

  const ok = await confirmModal({
    title: `حذف ${typeAr}`,
    message: `
      <div style="text-align:right;line-height:1.75">
        الطالب: <b>${esc(name)}</b><br>
        سيُحذف <b class="u-num">${total}</b> ورد
        <span class="u-muted" style="font-size:12.5px">
          (<span class="u-num">${upcoming}</span> لم يُسمَّع · <span class="u-num">${done}</span> مُنجَز)
        </span>.
        ${warnHtml}
        <div class="u-muted" style="margin-top:10px;font-size:12px">هذا الإجراء لا يمكن التراجع عنه.</div>
      </div>`,
    confirmText: `نعم، احذف`,
    danger: true
  });
  if(!ok) return;

  const r = await guard(DS.deleteManualPlans(sid, type || undefined), 'حذف الخطة…');
  if(!r || !r.success) return toast((r && r.message) || 'فشل الحذف','error');

  // حدّث الحالة المحلّية — نحذف ما طابق المعايير نفسها
  _tData.plans = (_tData.plans || []).filter(p =>
    !(String(p.Student_ID) === String(sid) &&
      p.Source === 'Manual' &&
      (type ? p.Type === type : true))
  );

  toast(`حُذف ${r.deleted || total} ورد${done ? ` · سُحبت نقاط ${done} ورد مُنجَز` : ''}`);

  // أغلق نافذة التعديل إن كانت مفتوحة
  const modal = $('modal');
  if(modal && !modal.classList.contains('hidden')) closeModal();

  // تحديث البيانات من الخادم (لجلب مجاميع نقاط صحيحة بعد السحب) + إعادة تصيير الشاشة الحالية
  await refreshTeacherStudents();
  if($('fuSubBody')) renderManualPlanTab($('fuSubBody'));
  else if($('settingsSubBody') && _settingsSub === 'allplans') renderAllPlansTab($('settingsSubBody'));
}
