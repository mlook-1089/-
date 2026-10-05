# حلقة ابن كثير — منصة رصد

منصة لرصد حفظ القرآن (معلم / طالب / ولي أمر). منشورة إنتاجاً على Vercel مع **نشر تلقائي عند الـ push**.

## 🌐 روابط الإنتاج
- **التطبيق الحي**: https://ibn-kathir-halaqa.vercel.app
- **لوحة Vercel**: https://vercel.com/sfsr19-3170s-projects/ibn-kathir-halaqa
- **GitHub**: https://github.com/mlook-1089/-  (الفرع الإنتاجي: `main`)
- **قاعدة البيانات**: Neon Postgres
- **المالك**: sfsr19@gmail.com

## 🧱 المكدس
- **Backend**: Next.js 14 App Router — `app/api/*/route.ts`
- **DB**: Neon Postgres عبر `@neondatabase/serverless` + `drizzle-orm`
- **Auth**: JWT cookie httpOnly (`jose`) + bcrypt
- **Nazem**: proxy مع كوكيز مشفّرة AES-256-GCM
- **Push**: web-push + VAPID
- **Frontend**: SPA في `public/` (تفاصيل أدناه — ليس ملفاً واحداً!)

## 🏗️ بنية الواجهة — مهم جداً

الواجهة ليست ملفاً واحداً. هي قاعدة في `public/index.html` + ملفات **تستبدل** دوالّها:

| الملف | المحتوى | يستبدل في index.html |
|---|---|---|
| `public/index.html` (~4100 سطر) | DS API adapter، helpers، شاشات: Overview، Nazem، News، Calendar، Items، Manage، Accounts، Appearance، PushAdmin، Reset، PlanDays، Audit، AllPlans، Modal | — |
| `public/ui/portal.js` | `renderStudent`، `renderParent`، `_pt*` | ✅ (الدوال القديمة بـ index.html ميتة) |
| `public/ui/followup.js` | `renderFollowUpHub`، `renderManualPlanTab`، `openCreateManualPlan`، `openEditFullPlan`، `openEditManualPlan` | ✅ |
| `public/ui/attendance-students.js` | `renderStudentsTab`، `renderAttendanceTab` | ✅ |
| `public/ui/shell.js` | `uiNav`، `uiHeader`، bottom nav، "المزيد" sheet | ✅ |
| `public/ui/login-qr.js` | `openLoginQR`، `_consumeLoginToken` | ✅ |
| `public/ui/app.css` | نظام v6 (tokens `u-*`) + remap لـ Tailwind القديم للتوكنات | — |
| `public/tw.css` (مُولَّد) | Tailwind utilities | — |
| `public/sw.js` | Service worker + PWA + web-push | — |

**القاعدة الذهبية**: قبل تعديل أي شاشة في `index.html`، تأكّد أن دالّة التصيير **ليست مُستبدَلة** في `public/ui/*.js`. اعتمد على نسخة `ui/*.js` دائماً عند وجودها.

## 🚀 دورة النشر — تلقائي الآن

**Vercel مربوط مع GitHub**. `git push` على `main` = نشر Production خلال ~٢ دقيقة. لا تحتاج أمر `vercel deploy`.

```bash
git add <files>
git commit -m "…"
git push origin main
```

لمراقبة النشر: https://vercel.com/sfsr19-3170s-projects/ibn-kathir-halaqa/deployments

**البديل اليدوي** (لو احتجت preview من غير commit):
```powershell
$env:NODE_OPTIONS="--require ./shim-hostname.js"
vercel deploy --prod --yes
```

## ⚠️ Service Worker + Cache Busting

كل تعديل على `public/ui/*.js` أو `public/ui/app.css` يحتاج:

1. **رفع رقم** في `<script src="/ui/X.js?v=N">` أو `<link ... app.css?v=N">` داخل `index.html`
2. **رفع `CACHE_NAME`** في `public/sw.js` (مثال: `ibk-shell-v8` → `v9`)

وإلا: المستخدم يبقى على كاش قديم.

## 🪟 قيود هذا الجهاز (Windows / سحاب-pc)

- اسم الجهاز عربي (`سحاب`) → يكسر Vercel CLI بخطأ ByteString. **الحل الجاهز**: `shim-hostname.js` في الجذر.
- قبل أي أمر vercel يدوي:
  ```powershell
  $env:NODE_OPTIONS="--require ./shim-hostname.js"
  ```
- مسار المشروع **لازم ASCII** → لذلك هو في `C:\Users\sfsr1\Desktop\ibn-kathir-halaqa` وليس في مجلد عربي.

## 🗄️ تعديل قاعدة البيانات

1. عدّل `db/schema.ts`
2. أنشئ سكريبت في `scripts/` (ALTER TABLE، بدل CREATE)
3. شغّل: `npx tsx scripts/<file>.ts` (يستخدم `.env.local`)
4. ادفع التغييرات: `git push origin main`

## 🔐 المتغيرات السرية

- **محلياً**: `.env.local` فيه `DATABASE_URL` + `SESSION_SECRET` + `VAPID_*` + `NAZEM_ENC_KEY`
- **إنتاجاً**: Vercel Secrets لثلاث بيئات (production/preview/development)
- **لا تضع كلمات مرور** في الكود — استخدم `process.env.*`
- **لا تكوميت `.env.local`** (محمي بـ `.gitignore`)

## 🩹 مشاكل معروفة (لا تحاول إصلاحها)

1. **BOM في DATABASE_URL**: PowerShell pipe يضيف U+FEFF → `lib/db.ts` يزيله دفاعياً بـ `.replace(/^﻿/, '').trim()`
2. **`lib/db.ts` Lazy Proxy**: مُصمَّم لتأخير الاتصال حتى وقت التشغيل، وإلا يفشل البناء عند "Collecting page data". **لا تجعله sync**.
3. **`typescript.ignoreBuildErrors: true`** في `next.config.mjs`: مقصود — Drizzle overloads يعترض على بعض الـ insert values.
4. **`stale-while-revalidate`** في Service Worker: المستخدم يرى الكاش القديم مرة واحدة قبل التحديث → لذلك قاعدة Cache Busting أعلاه.
5. **IDs/classes محمية**: 60+ ID يُقرأ من JS (مثل `#modal`، `#fuSubBody`، `[data-mp-student]`، `cp_fromS` إلخ). ممنوع تغيير أسماؤها.

## ✨ الميزات الرئيسية

- **بوابات 3**: معلم (رصد كامل)، طالب (أورادي + نقاطي)، ولي أمر (أبنائي)
- **الخطط اليدوية**: مولّد خطط فصلية (نطاق قرآني + مقدار يومي + أيام أسبوعية) → يولّد ورداً لكل يوم
- **المتابعة**: رصد ورد اليوم (مكتمل/جزئي/فائت) + حضور + أخطاء/استماع/تكرار → نقاط تلقائية
- **ناظم**: استيراد الطلاب + مزامنة الأوراد + حفظ تقييم جماعي
- **المشاركات**: الطلاب يعلّقون على مقاطع الفيديو → المعلم يراها (الطلاب لا) ويمنح نقاطاً مخصّصة + تنبيه push للمعلمين
- **التقويم**: فعاليات (طلعة/بكور/يوم سرد/…) بتواريخ أم القرى
- **الإشعارات**: web-push للغياب + الإعلانات + مشاركات الطلاب
- **PWA**: قابل للتثبيت + offline shell + web-push
- **تصدير/استيراد**: Excel للطلاب + تقارير PDF

## 🧭 بيانات الدخول الافتراضية

في جداول seed (بيئة التطوير فقط). غُيّرت في الإنتاج — لا تذكرها هنا.

## 📞 كيف تطلب تعديلاً في جلسة جديدة

1. افتح Claude Code في `C:\Users\sfsr1\Desktop\ibn-kathir-halaqa`
2. اطلب التعديل مباشرة — هذا الملف يوضّح الباقي
3. بعد الكوميت والـ push، Vercel ينشر تلقائياً

## 🧩 أوامر مفيدة

```powershell
# فحص السجلات الحية (production)
$env:NODE_OPTIONS="--require ./shim-hostname.js"
vercel logs https://ibn-kathir-halaqa.vercel.app --follow

# سيرفر محلي للتجربة قبل الـ commit
npm run dev

# فحص متغيرات البيئة على Vercel
vercel env ls

# سحب متغيرات الإنتاج للتطوير
vercel env pull

# قاعدة البيانات مباشرة
npm run db:studio

# محاكاة الواجهة بدون DB (mock)
# افتح http://localhost:4173/__dev.html?role=Teacher&tab=plan
python -m http.server 4173 --directory public
```
