# Amoyni — قاعدة البيانات (Database Reference)

الملف الكامل: `supabase/amoyni_supabase_setup.sql` (ملف واحد، يُشغَّل من `SQL Editor` في Supabase).

## الجداول (17 جدول)
`profiles` · `admin_users` · `avatars` · `meetings` · `meeting_point_rules` ·
`attendance_records` · `point_transactions` · `vouchers` · `voucher_redemptions` ·
`referral_settings` · `referrals` · `donation_campaigns` · `donation_transactions` ·
`app_settings` · `audit_logs` · `shop_products` · `shop_purchases`

كل جدول موثّق بالتفصيل (الأعمدة والقيود) داخل ملف الـSQL نفسه في قسم "TABLES".
جدولا `shop_products` و `shop_purchases` مضافة في `supabase/migration_4_shop.sql`.

## نموذج الصلاحيات (Authentication & RLS) — مهم جدًا
المشروع يستخدم **مصادقة مخصّصة (Custom Auth)** برقم الهاتف/كلمة المرور، وليس Supabase Auth
(لأن المطلوب تسجيل بدون بريد إلكتروني أو OTP). ولأن `auth.uid()` غير متاح في هذا النموذج،
تم اعتماد التصميم التالي:

- **RLS مفعّل على كل الجداول.**
- الجداول الحساسة (profiles, point_transactions, vouchers, audit_logs, ...) **لا تملك أي Policy
  للقراءة/الكتابة المباشرة** من `anon`/`authenticated` — أي محاولة `select`/`insert` مباشرة عليها من الواجهة سترفض.
- كل قراءة أو تعديل يتم فقط عبر **Functions بصلاحية `SECURITY DEFINER`** (تتجاوز RLS داخليًا وتقوم
  بالتحقق من الصلاحيات بنفسها باستخدام الـ id الذي يرسله الطرف الآخر).
- جداول القراءة العامة الآمنة فقط (`avatars`, `meetings` النشطة/المغلقة, `donation_campaigns` النشطة/المغلقة)
  لها Policy مباشرة للقراءة لأنها لا تحتوي على بيانات حساسة.

هذا يعني: أي عملية جديدة تحتاجها الواجهة **يجب** أن تمر عبر function جديدة بدلاً من محاولة قراءة
الجدول مباشرة، حفاظًا على نفس مستوى الحماية.

## الدوال (Functions) — 40+ function
مقسّمة إلى:
1. **دوال الشباب الأساسية** (من التصميم الأصلي): `register_youth_user`, `youth_login`,
   `register_attendance`, `redeem_voucher`, `create_donation`, `close_meeting`,
   `activate_referral_reward`, `recalculate_user_streak`, `sync_wallet_totals`, `generate_referral_code`,
   `get_leaderboard`, `create_point_adjustment`, `reverse_point_transaction`.
2. **دوال قراءة/تعديل ذاتية للشاب** (أُضيفت أثناء بناء الواجهة — راجع قسم "ADDENDUM" داخل ملف الـSQL):
   `get_my_profile`, `update_own_profile`, `get_my_wallet`, `get_my_transactions`,
   `get_my_attendance_history`, `get_active_meeting`, `get_public_settings`,
   `get_donation_campaigns_public`.
3. **دوال الأدمن الكاملة** (أُضيفت لنفس السبب): `get_admin_dashboard`, `get_admin_meetings`,
   `create_meeting`, `add_point_rule`, `delete_point_rule`, `get_meeting_details`, `start_meeting`,
   `get_admin_users`, `get_user_details`, `admin_update_user`, `admin_set_password`,
   `admin_set_user_status`, `get_admin_vouchers`, `create_voucher`, `set_voucher_status`,
   `get_admin_referrals`, `update_referral_settings`, `get_admin_donation_campaigns`,
   `create_donation_campaign`, `close_donation_campaign`, `get_donation_transactions_admin`,
   `get_admin_audit_log`, `get_report_points_breakdown`, `update_app_setting`.
4. **دوال المتجر** (نقاط المكافآت — `supabase/migration_4_shop.sql`):
   `get_shop_products_public` (صفحة المتجر للشباب)، `get_my_shop_purchases` (سجل مشتريات الشاب)،
   `purchase_shop_product` (الشراء الذرّي)، `get_admin_shop_products`, `create_shop_product`,
   `update_shop_product`, `get_admin_shop_purchases` (سجل المشتريات للأدمن)،
   `admin_set_purchase_delivered` (تبديل حالة التسليم).

### لماذا الإضافات؟
التصميم الأصلي عرّف الجداول والقيود والدوال الأساسية لتسجيل الحضور/النقاط، لكنه لم يُعرّف
مسارات القراءة التي تحتاجها أي واجهة فعلية (مثال: كيف يقرأ الشاب محفظته أو سجل حضوره، وكيف يدير
الأدمن الاجتماعات والمستخدمين). هذه الإضافات **جميعها إضافية فقط** (Additive) — لم يتم حذف أو
تعديل أي جدول أو دالة أو قيد من التصميم الأصلي، فقط تمت الإضافة عليه.

## Views
`leaderboard_top_10` · `user_wallet_summary` · `meeting_attendance_summary` ·
`voucher_usage_summary` · `donation_campaign_summary` · `admin_dashboard_summary` · `referral_summary`

## القيود الرئيسية (Constraints)
- رقم الهاتف فريد، اسم مستخدم الأدمن فريد، كود الـVoucher فريد.
- رقم الحضور/الطمبولة فريد داخل نفس الاجتماع.
- الرصيد لا يقل عن صفر أبدًا (CHECK constraint + منطق الدوال).
- شرائح نقاط الاجتماع لا تتداخل زمنيًا (Exclusion Constraint عبر `btree_gist`).
- لا تبرع للنفس، لا استخدام مكرر لنفس الـVoucher، لا مراجعة (Reversal) مزدوجة لنفس الحركة.
- سعر منتج المتجر والكمية لا يقلان عن صفر، والحد الأقصى للشراء إن وُجد لا يقل عن 1، واسم المنتج
  لا يكون فارغًا، والكمية لا تنزل تحت الصفر أبدًا (الشراء الذرّي يقلّل `stock_quantity` بشرط
  `stock_quantity > 0`).
- تاريخ مشتريات المتجر لا يُحذف أبدًا (Snapshots + FK بـ NO ACTION).

## متجر النقاط (Shop)
ملف `supabase/migration_4_shop.sql` يضيف متجر المكافآت الذي يشتري به الشباب من رصيد النقاط عبر
**دالة شراء واحدة ذرّية** `purchase_shop_product(p_user_id, p_product_id)`:

- **Single transaction**: تأخذ `SELECT ... FOR UPDATE` على ملف الشاب ثم على المنتج، فتتسلسل
  محاولات الشراء المتزامنة على نفس المنتج (منتج بكمية 1 لا يشتريه إلا شاب واحد).
- تتحقق بالترتيب من: وجود الشاب، حالة الحساب، وجود المنتج، توافره، الكمية (`OUT_OF_STOCK`)،
  الرصيد (`INSUFFICIENT_POINTS`)، والحد الأقصى لكل شاب (`PURCHASE_LIMIT_REACHED`) ثم تنفّذ
  الخصم وتنقص الكمية وتُدرج سجل الشراء. أي خطأ يرجع بـ `raise exception` فلا يتطبّق أي جزء.
- **Snapshots**: سجل الشراء يحفظ اسم/صورة/سعر المنتج لحظة الشراء، فلا تتغيّر التاريخ القديم لو
  عُدّل المنتج أو أُخفِي لاحقًا.
- **النقاط**: نوع `shop_purchase` أُضيف إلى `point_transactions` (نوع `debit`)، و
  `sync_wallet_totals` يحتسبه ضمن "المنصرف"، وحساب `current_balance` ما زال مصدره الوحيد
  `point_transactions` — لا يوجد نظام نقاط ثانٍ.
- التعديلات على الدوال القائمة (`point_transactions` check، `sync_wallet_totals`,
  `get_my_transactions` مع فلاتر `shop`) **إضافية فقط** ولا تُعيد كتابة أي صفوف موجودة.

## بيانات أولية (Seed Data)
16 Avatar افتراضي، إعدادات تطبيق افتراضية (`app_settings`)، إعدادات دعوة معطّلة افتراضيًا
(`referral_settings.is_enabled = false` — يُفعّلها الأدمن من صفحة "الدعوات")، وحساب Super Admin واحد.
