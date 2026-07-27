# Amoyni — دليل التشغيل (Setup Guide)

## 1. إنشاء مشروع Supabase
1. سجّل / سجّل دخول على https://supabase.com وأنشئ مشروعًا جديدًا.
2. من **Project Settings → API** انسخ:
   - `Project URL`
   - `anon public key`

## 2. تجهيز قاعدة البيانات
1. افتح **SQL Editor** داخل مشروع Supabase.
2. افتح ملف `supabase/amoyni_supabase_setup.sql` من هذا المشروع، انسخ محتواه بالكامل، وشغّله دفعة واحدة.
3. الملف يقوم تلقائيًا بـ:
   - إنشاء كل الجداول والدوال (Functions) والـ Views والـ RLS Policies.
   - إضافة بيانات أولية (16 Avatar افتراضي، إعدادات التطبيق، إعدادات الدعوة).
   - إنشاء حساب Super Admin افتراضي:
     - **Username:** `admin`
     - **Password:** `ChangeMe123!`
     - ⚠️ **غيّر كلمة المرور دي فورًا** من صفحة تسجيل دخول الأدمن أو مباشرة من قاعدة البيانات.
4. للتأكد من نجاح التنفيذ، آخر أسطر الملف عبارة عن استعلامات تحقق (Verification Queries) بتوضح عدد الجداول/الدوال/الـViews التي تم إنشاؤها.

## 3. ربط الواجهة بالمشروع
1. انسخ `config.example.js` باسم `config.js` في نفس المجلد.
2. افتح `config.js` وحدّث القيم:
   ```js
   window.AMOYNI_CONFIG = {
     SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
     SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",
     ...
   };
   ```
   **مهم:** استخدم فقط الـ `anon public key`. لا تضع `service_role key` في أي ملف داخل هذا المجلد أبدًا.

## 4. تشغيل المشروع محليًا
المشروع HTML/CSS/JS خام بدون أي Build خطوة، فقط يحتاج سيرفر ثابت بسيط (Static Server) بسبب قيود CORS على `fetch`:

```bash
cd amoyni
python3 -m http.server 8080
# أو
npx serve .
```

ثم افتح:
- الشباب: `http://localhost:8080/login.html`
- الأدمن: `http://localhost:8080/admin/login.html`

## 5. حسابات تجريبية (Demo)
| النوع | القيمة |
|---|---|
| شاب — الهاتف | `01001112222` |
| شاب — كلمة المرور | `Demo@1234` |
| أدمن — Username | `admin` |
| أدمن — Password | `ChangeMe123!` |

بيانات تجريبية إضافية (شباب آخرين، كود Voucher باسم `WELCOME50`، حملة تبرع، اجتماع نشط بشرائح نقاط) موجودة كأمثلة يمكن حذفها من لوحة الأدمن في أي وقت.

## 6. رفع المشروع (Deployment)
راجع `docs/deployment.md` لخيارات الاستضافة (Vercel / Netlify / أي Static Hosting).
