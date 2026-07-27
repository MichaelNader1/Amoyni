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

## الحالة
✅ فلو الشباب كامل ومُختبر بالكامل (تسجيل، دخول، مسح QR، محفظة، Leaderboard، Voucher، تبرعات،
ملف شخصي) — صفر أخطاء Console.
✅ لوحة تحكم الأدمن كاملة ومُختبرة بالكامل (اجتماعات، شباب، نقاط، Vouchers، دعوات، تبرعات،
تقارير + CSV، سجل عمليات، إعدادات) — صفر أخطاء Console.

راجع `docs/testing.md` لتفاصيل كل حالة تم اختبارها.
