# 🗑️ أداة حذف تغريدات X

أداة لحذف جميع تغريداتك من حسابك في منصة X (تويتر سابقاً).
توجد **ثلاث طرق** — اختر الأنسب لك.

## 📱 الطريقة الأسرع للجوال

افتح من جوالك: **https://ibn-kathir-halaqa.vercel.app/x-delete.html**

> يتطلب تفعيل متغير `X_DELETE_ENABLED=1` في Vercel env أولاً (معطّل افتراضياً لحمايتك).
> بعد التفعيل: Vercel → Settings → Environment Variables → أضف `X_DELETE_ENABLED` = `1` ثم أعد النشر.

ثم أدخل مفاتيح X API الأربعة (من [developer.x.com](https://developer.x.com)) → اضغط "اجلب القائمة" → "ابدأ الحذف". تعمل من جوالك بالكامل. تفاصيل أكثر بالأسفل.

---

---

## 🅰️ الطريقة الأولى — عبر المتصفح (بدون API)

**الأبسط. لا تحتاج مفاتيح مطوّر.** تعمل داخل متصفحك مباشرة.

### الخطوات:

1. افتح الملف محلياً: `tools/x-delete/browser/bookmarklet.html` في متصفحك
   (مثلاً اسحبه إلى Chrome أو افتحه بـ `file:///...`).
2. اضبط الخيارات (تاريخ، حد أقصى، استثناء الإعجابات).
3. اسحب الزر الأحمر إلى **شريط المفضّلة** في متصفحك.
4. افتح `https://x.com/<اسم‌المستخدم>` واضغط البوكماركلت.
5. ستظهر لوحة تحكم — اضغط "ابدأ".

### المميزات:
- ✅ لا تحتاج تسجيل كمطوّر ولا مفاتيح API
- ✅ تحذف من أي عدد (لا سقف يومي)
- ✅ تستثني المثبّتة والإعجابات العالية تلقائياً
- ✅ أزرار بدء/إيقاف أثناء التشغيل

### العيوب:
- ⚠️ يجب أن يبقى تبويب X مفتوحاً
- ⚠️ قد يتعطّل إذا غيّرت X واجهتها (الـ selectors)
- ⚠️ أبطأ (ثانيتان بين كل عملية)

---

## 🅱️ الطريقة الثانية — عبر X API (موثوقة أكثر)

**تتطلب تسجيل كمطوّر مجاناً** في [developer.x.com](https://developer.x.com/en/portal/dashboard).

### 1. سجّل تطبيقاً جديداً:

- اذهب إلى [developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard)
- أنشئ Project ثم App بداخله
- في **User authentication settings**:
  - **Type of App**: `Web App, Automated App or Bot`
  - **App permissions**: `Read and write`
  - **Callback URL**: `http://localhost` (أي شيء)
- من **Keys and tokens** انسخ:
  - `API Key` + `API Key Secret`
  - اضغط **Generate** لـ `Access Token` + `Access Token Secret`

> ⚠️ تأكّد أن **Access Token** يحمل صلاحية **Read and Write** (لو كان Read فقط، احذفه وأعد إنشاءه بعد تغيير الصلاحيات).

### 2. نزّل أرشيف تغريداتك:

- X → **Settings and privacy** → **Your account** → **Download an archive of your data**
- انتظر 24-48 ساعة حتى يصل الرابط لإيميلك
- فك الضغط — ستجد `data/tweets.js`

### 3. ثبّت الأداة:

```bash
cd tools/x-delete
npm install
cp .env.example .env
```

افتح `.env` واملأ المفاتيح الأربعة.

### 4. استخرج معرفات التغريدات:

```bash
npm run parse ./archive/data/tweets.js
```

سيُنشأ `tweet-ids.json` فيه كل المعرفات بعد تطبيق الفلترة من `.env`.

### 5. ابدأ الحذف:

```bash
# معاينة فقط (لن يحذف شيء)
node delete-tweets.mjs

# التنفيذ الفعلي
node delete-tweets.mjs --yes
```

### 6. متابعة التقدم:

```bash
npm run stats
```

### المميزات:
- ✅ موثوق (لا يعتمد على DOM)
- ✅ قابل للاستئناف (تنقطع الجلسة؟ شغّلها مرة أخرى)
- ✅ سجلّ كامل في `delete.log`
- ✅ فلترة بالتاريخ والإعجابات والتثبيت

### العيوب:
- ⚠️ **الحد المجاني (Free tier)** = **17 حذف / 24 ساعة** تقريباً — ضيّق جداً
- ⚠️ **Basic tier** = 100$/شهر، يسمح بآلاف العمليات
- ⚠️ تحتاج أرشيف X أولاً

### حدود المعدل (Rate limits):
| المستوى | DELETE /2/tweets/:id |
|---------|---------------------|
| Free | 17 / 24 ساعة |
| Basic ($100/شهر) | 100 / 15 دقيقة |
| Pro ($5000/شهر) | 100 / 15 دقيقة |

إذا بلغت الحد، السكريبت يتوقّف تلقائياً ويحفظ الحالة. أعد التشغيل بعد انتهاء النافذة.

---

## 🔒 الأمان

- `.env` و `state.json` و `tweet-ids.json` **محمية بـ `.gitignore`** — لن تُرفع لـ GitHub.
- لا ترسل مفاتيحك لأي أحد — تعمل محلياً فقط.
- بعد انتهاء الحذف: احذف `Access Token` من [developer.x.com](https://developer.x.com) أو عطّل التطبيق.

---

## 🩹 الأخطاء الشائعة

| الخطأ | الحل |
|-------|------|
| `HTTP 401: Unauthorized` | المفاتيح خطأ، أو Access Token صلاحيته Read فقط — أعد إنشاءه بـ Read+Write |
| `HTTP 403: Forbidden` | التطبيق في Free tier بدون "Elevated access" — ارفعه، أو انتقل للطريقة A |
| `HTTP 429: Too Many Requests` | بلغت rate limit — السكريبت يتوقف تلقائياً |
| `HTTP 404` | التغريدة محذوفة مسبقاً — تُسجّل في `notFound` ويُتجاوزها |

---

## 📁 بنية المشروع

```
tools/x-delete/
├── README.md                       ← أنت هنا
├── package.json
├── .env.example                    ← انسخه إلى .env واملأه
├── .gitignore
├── parse-archive.mjs               ← يستخرج المعرفات من tweets.js
├── delete-tweets.mjs               ← سكريبت الحذف الرئيسي
├── stats.mjs                       ← عرض الإحصائيات
├── lib/
│   ├── env.mjs                     ← تحميل .env
│   └── oauth.mjs                   ← توقيع OAuth 1.0a
└── browser/
    └── bookmarklet.html            ← الطريقة A (بدون API)
```

---

**تنبيه نهائي:** الحذف نهائي ولا يمكن استرجاع التغريدات. تأكّد من تصدير أرشيفك قبل البدء.
