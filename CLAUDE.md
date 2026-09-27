# حلقة ابن كثير — منصة رصد

مشروع منشور على Vercel. أي تعديل هنا يُنشر بأمر واحد.

## 🌐 روابط الإنتاج
- **التطبيق الحي**: https://ibn-kathir-halaqa.vercel.app
- **لوحة Vercel**: https://vercel.com/sfsr19-3170s-projects/ibn-kathir-halaqa
- **قاعدة البيانات**: Neon Postgres في `eu-central-1`
- **مالك المشروع**: sfsr19@gmail.com (Vercel: `sfsr19-3170`)

## 🧱 المكدس

- **Frontend**: HTML/JS ثابت في `public/index.html` (سطر واحد كبير — يتم تعديله بـ Edit tool)
- **Backend**: Next.js 14 App Router — `app/api/*/route.ts`
- **DB**: Neon Postgres عبر `@neondatabase/serverless` + `drizzle-orm`
- **Auth**: JWT cookie httpOnly (`jose`) + bcrypt للكلمات
- **Nazem**: proxy مع كوكيز مشفرة AES-256-GCM

## 📁 بنية المجلدات

```
app/api/           — مسارات API
db/schema.ts       — تعريف الجداول
lib/db.ts          — عميل Neon (Lazy Proxy — لا تعدّله)
lib/auth.ts        — JWT + bcrypt
lib/nazem.ts       — تكامل ناظم
lib/badges.ts      — منح الشارات
lib/triggers.ts    — النقاط التلقائية
lib/utils.ts       — SURAHS + الأدوات
scripts/migrate.ts — إنشاء الجداول
scripts/seed.ts    — البيانات الافتراضية
public/index.html  — الواجهة الكاملة (~1500 سطر)
```

## ⚠️ قيود مهمة على هذا الجهاز (Windows/سحاب-pc)

اسم الجهاز عربي (`سحاب`) → يكسر Vercel CLI بخطأ ByteString.
**الحل الجاهز**: ملف `shim-hostname.js` في الجذر.

**قبل أي أمر vercel، استخدم**:
```powershell
$env:NODE_OPTIONS="--require ./shim-hostname.js"
```

كذلك: **مسار المشروع يجب أن يكون ASCII** — لذلك المشروع في `C:\Users\sfsr1\Desktop\ibn-kathir-halaqa` وليس داخل مجلد عربي.

## 🚀 دورة النشر

بعد أي تعديل على الكود:

```powershell
cd C:\Users\sfsr1\Desktop\ibn-kathir-halaqa
$env:NODE_OPTIONS="--require ./shim-hostname.js"
vercel deploy --prod --yes
```

النشر يأخذ ~40 ثانية. الرابط `ibn-kathir-halaqa.vercel.app` يتحدّث تلقائياً.

## 🗄️ تعديل قاعدة البيانات

1. عدّل `db/schema.ts`
2. عدّل `scripts/migrate.ts` (أضف `ALTER TABLE` بدل CREATE)
3. شغّل: `npm run db:migrate` (يستخدم `.env.local`)
4. `vercel deploy --prod --yes`

## 🔐 المتغيرات السرية

- **محلياً**: `.env.local` فيه `DATABASE_URL` + `SESSION_SECRET`
- **إنتاجاً**: مضبوطة في Vercel (Secret) لثلاث بيئات: production/preview/development
- **لا تضع كلمات المرور** في الكود مباشرة — استخدم `process.env.*`

## 🩹 مشاكل معروفة سابقاً (لا تحاول إصلاحها من جديد)

1. **BOM في DATABASE_URL**: PowerShell pipe يضيف U+FEFF → `lib/db.ts` يزيله دفاعياً بـ `.replace(/^﻿/, '').trim()`
2. **`lib/db.ts` Lazy Proxy**: مصمم لتأخير الاتصال حتى وقت التشغيل، وإلا يفشل البناء عند "Collecting page data". لا تعده sync.
3. **`typescript.ignoreBuildErrors: true`** في `next.config.mjs`: مقصود، لأن Drizzle strict types يعترض على `.set({ note: '' })` في `attendance`.

## 🧭 بيانات الدخول الافتراضية

- معلم: `U_001` / `1234`
- طالب: `U_002` / `1111`
- ولي أمر: `U_003` / `2222`

⚠️ يجب تغييرها قبل الاستخدام الفعلي.

## 📞 كيف تطلب تعديلاً في جلسة جديدة

1. افتح Claude Code
2. اذكر مسار المشروع: `C:\Users\sfsr1\Desktop\ibn-kathir-halaqa`
3. اطلب التعديل مباشرة — الملف هذا يوضح كل الباقي
4. بعد التعديل قل "انشر" وسينفّذ `vercel deploy --prod --yes`

## 🧩 أوامر مفيدة

```powershell
# فحص السجلات الحية
vercel logs https://ibn-kathir-halaqa.vercel.app --follow

# إعادة تشغيل السيرفر المحلي للتجربة قبل النشر
npm run dev

# فحص متغيرات البيئة على Vercel
vercel env ls

# سحب متغيرات الإنتاج للتطوير
vercel env pull

# جدول قاعدة البيانات مباشرة
npm run db:studio
```
