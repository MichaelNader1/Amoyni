# Amoyni

منصة Web شبابية كنسية لإدارة الحضور والنقاط والطمبولة والتبرعات والمسابقات — HTML5 + CSS3 +
Vanilla JavaScript + Supabase (PostgreSQL + PostgREST RPC)، بدون أي Framework.

## البدء السريع
```bash
cd amoyni
cp config.example.js config.js   # ثم عدّل القيم بمشروع Supabase الحقيقي
python3 -m http.server 8080
```
افتح `http://localhost:8080/login.html` (شباب) أو `http://localhost:8080/admin/login.html` (أدمن).

راجع `docs/setup.md` للتفاصيل الكاملة.

## اللوجو (Logo)
مكان اللوجو ثابت وجاهز، لسه صورة placeholder بسيطة. علشان تحط لوجو حقيقي:
1. جهّز صورتك بصيغة PNG (مربعة، خلفية شفافة يفضّل، حجم كويس زي 512×512).
2. سمّيها **بالظبط** `amoyni-logo.png`.
3. استبدل بيها الملف الموجود في: `assets/images/logo/amoyni-logo.png`

اللوجو هيشتغل تلقائيًا في كل الأماكن دي من غير أي تعديل كود: صفحة دخول الشباب، صفحة
التسجيل، صفحة دخول الأدمن، هيدر الصفحة الرئيسية، وSidebar لوحة الأدمن.
(الـ favicon بيتولّد من نفس الصورة؛ لو عايز تحدّثه، بدّل ملف `favicon.png` في جذر المشروع.)

## تحديثات قاعدة البيانات (Migrations)
لو سبق وشغّلت `supabase/amoyni_supabase_setup.sql` قبل كده على مشروع Supabase شغّال،
مش محتاج تعيد تشغيله تاني. أي تعديلات جديدة بعد كده هتيجي في ملفات migration منفصلة صغيرة
تحت `supabase/`، شغّلها هي بس:
- `supabase/migration_2_dashboard_spotlight.sql` — يضيف كارت "آية/إعلان اليوم + رقم
  الطمبولة" في الصفحة الرئيسية، ويصلّح مسارات صور الـAvatars. آمن يتشغّل أكتر من مرة.
- `supabase/migration_3_secure_qr_attendance.sql` — يؤمّن جلسات الحضور والأدمن الخاصة
  بالاجتماعات، يفرض نافذة الحضور واجتماعًا نشطًا واحدًا، ويحجب QR عن القراءة العامة.

## بيانات تجريبية (Demo)
| النوع | القيمة |
|---|---|
| شاب | `01001112222` / `Demo@1234` |
| أدمن | `admin` / `ChangeMe123!` |

## هيكل المشروع
```
amoyni/
├── index.html, login.html, register.html, dashboard.html, wallet.html,
│   leaderboard.html, scanner.html, voucher.html, donations.html,
│   profile.html, attendance-history.html          ← صفحات الشباب
├── admin/                                          ← لوحة تحكم الأدمن (15 صفحة)
├── assets/
│   ├── css/        ← Design System كامل (tokens, components, responsive, RTL)
│   ├── js/         ← منطق الصفحات + admin/ للوحة التحكم
│   ├── vendor/     ← Supabase JS, html5-qrcode, canvas-confetti, QR generator (محليًا، بدون CDN)
│   └── avatars/    ← 16 Avatar افتراضي
├── supabase/amoyni_supabase_setup.sql              ← ملف قاعدة البيانات الكامل (تشغيل مرة واحدة)
├── docs/           ← setup / database / deployment / testing
├── config.example.js, config.js
└── vercel.json
```

## التقنيات
HTML5 · CSS3 (Custom Properties, RTL كامل) · Vanilla JavaScript (ES2017+) ·
Supabase JS SDK v2 (مُحمّل محليًا) · Supabase PostgreSQL + PostgREST RPC · html5-qrcode ·
canvas-confetti · qrcode-generator (MIT) — **بدون** React/Vue/Next.js/Build Tools.

## آخر التحديثات
- ✅ صلّحنا قائمة الأدمن على الموبايل (كانت الـDrawer ناقصة تنسيقها بالكامل).
- ✅ ظهور الآية/الإعلان ورقم الطمبولة بشكل بارز في الصفحة الرئيسية لكل شاب (كارت "Spotlight").
- ✅ شيلنا خيار "رفع صورة" من صفحة المسح — الكاميرا بقت الطريقة الوحيدة، مع زرار "إعادة المحاولة".
- ✅ المسح يعتمد على وقت السيرفر ونافذة الاجتماع، مع جلسة موثوقة ومنع الطلبات المتكررة.
- ✅ صلّحنا مسارات صور الـAvatar (كانت مطلقة) + أضفنا صورة بديلة تلقائية لو أي صورة فشلت تحميلها.
- ✅ مكان جاهز للّوجو — راجع قسم "اللوجو" تحت.

## الحالة
✅ فلو الشباب كامل ومُختبر بالكامل (تسجيل، دخول، مسح QR، محفظة، Leaderboard، Voucher، تبرعات،
ملف شخصي) — صفر أخطاء Console.
✅ لوحة تحكم الأدمن كاملة ومُختبرة بالكامل (اجتماعات، شباب، نقاط، Vouchers، دعوات، تبرعات،
تقارير + CSV، سجل عمليات، إعدادات) — صفر أخطاء Console.

راجع `docs/testing.md` لتفاصيل كل حالة تم اختبارها.
