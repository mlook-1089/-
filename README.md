# حلقة ابن كثير — منصة رصد (Next.js + Neon)

نسخة v3.5 — مهاجرة من Google Apps Script إلى Next.js 14 + Neon Postgres، جاهزة للنشر على Vercel.

## المكدس التقني

- **Frontend**: HTML/JS ثابت في `public/index.html` (نفس الواجهة السابقة)
- **Backend**: Next.js 14 App Router — API Routes
- **DB**: Neon Postgres عبر `@neondatabase/serverless` + `drizzle-orm`
- **Auth**: JWT عبر Cookie httpOnly (`jose`) + bcrypt للكلمات المرور
- **Nazem**: Proxy على السيرفر يحفظ الكوكيز مشفرة (AES-256-GCM) في `nazem_session`

---

## 🚀 خطوات النشر على Vercel (كاملة)

### 1) أنشئ قاعدة بيانات Neon (مجاني)

1. اذهب إلى https://console.neon.tech وسجّل بحسابك (يمكنك استخدام GitHub).
2. اضغط **Create Project**، اختر المنطقة الأقرب (مثلاً `AWS eu-central-1` لأوروبا/الشرق الأوسط).
3. من صفحة المشروع، انسخ **Connection String** — سيبدأ بـ `postgres://...`. احفظه.

### 2) هيّئ المستودع

```bash
cd "C:\Users\sfsr1\Desktop\(منصة ابن كثير)\nextjs"

# نسخة من ملف البيئة
cp .env.example .env.local

# افتح .env.local وضع:
#   DATABASE_URL=postgres://... (من Neon)
#   SESSION_SECRET=... (سلسلة عشوائية 32 حرف+)

# ثبّت المكتبات
npm install

# أنشئ الجداول
npm run db:migrate

# املأ البيانات الافتراضية (معلم/طالب/ولي أمر تجريبيون)
npm run db:seed

# تأكد محلياً
npm run dev
# افتح http://localhost:3000 — ادخل بـ U_001 / 1234
```

### 3) ارفع إلى GitHub

```bash
git init
git add .
git commit -m "Initial commit - Next.js migration v3.5"
git branch -M main
# أنشئ repo على github.com ثم:
git remote add origin https://github.com/USERNAME/ibn-kathir-halaqa.git
git push -u origin main
```

### 4) اربط بـ Vercel

1. اذهب إلى https://vercel.com/new
2. اختر المستودع من GitHub
3. في **Environment Variables** أضف:
   - `DATABASE_URL` = نفس القيمة من Neon
   - `SESSION_SECRET` = نفس القيمة السرية
4. اضغط **Deploy** — سيستغرق 1-2 دقيقة
5. افتح الرابط الذي ستعطيك إياه Vercel (مثل `https://ibn-kathir-halaqa.vercel.app`)

### 5) شغّل migrations على Neon الإنتاجي (مرة واحدة فقط)

من جهازك بعد ضبط `.env.local` على DATABASE_URL الإنتاجي:

```bash
npm run db:migrate
npm run db:seed
```

**بيانات الدخول الافتراضية:**
- معلم: `U_001` / `1234`
- طالب: `U_002` / `1111`
- ولي أمر: `U_003` / `2222`

⚠️ **مهم**: غيّر كلمات المرور فوراً من واجهة "الإعدادات > إدارة الطلاب".

---

## 🗂️ بنية المشروع

```
nextjs/
├── app/
│   ├── layout.tsx              # Root layout
│   └── api/
│       ├── auth/               # login, logout, me
│       ├── teacher-data/       # كل بيانات المعلم
│       ├── students/           # CRUD + dashboard + progress
│       ├── groups/             # CRUD + أعضاء + نقاط
│       ├── plans/              # CRUD الخطط + Triggers
│       ├── point-items/        # بنود النقاط
│       ├── logs/               # تسجيل نقاط
│       ├── news/ events/       # الإعلانات والفعاليات
│       ├── attendance/         # الحضور
│       ├── settings/           # مفاتيح/قيم
│       ├── db-health/          # فحص وإصلاح
│       ├── children/ feed/     # ولي الأمر والطالب
│       ├── reports/            # تقارير
│       └── nazem/              # تكامل ناظم كامل
├── db/schema.ts                # Drizzle schema
├── lib/
│   ├── db.ts                   # Neon client
│   ├── auth.ts                 # JWT sessions + bcrypt
│   ├── utils.ts                # SURAHS, buildPlanTarget, ...
│   ├── badges.ts               # منح الشارات
│   ├── triggers.ts             # نقاط تلقائية
│   └── nazem.ts                # Nazem client (AES-encrypted cookies)
├── scripts/
│   ├── migrate.ts              # إنشاء الجداول
│   └── seed.ts                 # البيانات الافتراضية
├── public/index.html           # الواجهة الكاملة (نفس v3.4)
├── package.json                # المكتبات
├── next.config.mjs             # rewrite / → /index.html
├── drizzle.config.ts
├── tsconfig.json
└── .env.example
```

---

## 🔐 الأمان

- كلمات المرور مُخزّنة بـ **bcrypt** (10 rounds) بدل نص صريح
- الجلسات = **JWT في cookie httpOnly + secure + SameSite=Lax**
- كلمة مرور ناظم مشفّرة **AES-256-GCM** قبل حفظها
- `SESSION_SECRET` يجب أن يكون قوياً (32 حرف+)
- كل مسار API يتحقق من الدور (`requireRole('Teacher')`)

---

## 🛠️ إصلاح مشاكل شائعة

**البناء يفشل على Vercel**: تأكد أن `DATABASE_URL` و `SESSION_SECRET` مضبوطتان في Environment Variables.

**لا يستطيع الدخول**: أعد تشغيل `npm run db:seed` على القاعدة الإنتاجية.

**ناظم لا يعمل**: افتح إعدادات المتابعة داخل التطبيق، أدخل بيانات ناظم مرة أخرى، ثم اضغط "اختبار".

**الطلاب لا يظهرون**: افتح `الإعدادات > المظهر > صحة قاعدة البيانات` واضغط "إصلاح تلقائي".

---

## 📈 ميزات مستقبلية

- [ ] تصدير التقارير كـ PDF (`@react-pdf/renderer`)
- [ ] إشعارات واتساب للأولياء (webhook)
- [ ] Rate limiting على API
- [ ] Row-Level Security في Postgres
- [ ] نسخ احتياطي تلقائي يومي
