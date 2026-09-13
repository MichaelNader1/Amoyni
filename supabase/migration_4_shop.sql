-- =====================================================================
-- AMOYNI — Migration 4: Points Shop (rewards shop) V1
-- -----------------------------------------------------------------
-- Adds a points-based rewards shop on top of the EXISTING points system:
--   - shop_products   : items youth can buy with their current_balance
--   - shop_purchases  : permanent snapshot of every purchase
--   - purchase_shop_product(): ONE atomic RPC that verifies everything
--     (availability, stock, balance, purchase limit) and commits the
--     purchase, stock decrement, balance deduction and point_transactions
--     debit inside a single database transaction.
--
-- NO tables/functions/policies are destroyed or rewritten in a breaking
-- way. Only additive changes are made to existing objects:
--   1) point_transactions.type CHECK gains one new allowed value
--      ('shop_purchase') — existing rows are untouched.
--   2) sync_wallet_totals() counts shop purchases in total_spent.
--   3) get_my_transactions() gains a 'shop' filter group.
--
-- The legacy custom-auth model is preserved: functions receive the
-- user_id / admin_id the client authenticated with (localStorage-based
-- session), exactly like the rest of the live system. Migration 3's
-- abandoned token-session architecture is NOT used or required here.
--
-- Idempotent: safe to run more than once. Run in the Supabase SQL Editor
-- after amoyni_supabase_setup.sql (and optionally migration_2).
-- =====================================================================

-- =====================================================================
-- 1. EXTEND point_transactions.type to allow shop purchases (additive)
-- =====================================================================
alter table point_transactions
  drop constraint if exists point_transactions_type_check;

alter table point_transactions
  add constraint point_transactions_type_check
  check (type in (
    'attendance','voucher','referral_inviter','referral_invitee',
    'donation_sent','donation_received','admin_addition',
    'admin_deduction','reversal','correction','shop_purchase'
  ));

-- =====================================================================
-- 2. TABLES
-- =====================================================================

-- ---------------------------------------------------------------
-- shop_products
-- ---------------------------------------------------------------
create table if not exists shop_products (
  id                   uuid primary key default gen_random_uuid(),
  name                 varchar not null
                         check (length(trim(name)) > 0),
  description          text,
  image_url            text,
  price_points         integer not null default 0 check (price_points >= 0),
  stock_quantity       integer not null default 0 check (stock_quantity >= 0),
  is_available         boolean not null default true,
  max_per_user         integer check (max_per_user is null or max_per_user > 0),
  created_by_admin_id  uuid references admin_users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- shop_purchases
-- ---------------------------------------------------------------
-- Permanent snapshot of each purchase. Snapshots (not live references)
-- keep history accurate when the product is later renamed, re-priced or
-- hidden. product_id keeps a link to the current product row; the FK uses
-- default NO ACTION so a product with purchases can never be hard-deleted
-- underneath its history.
create table if not exists shop_purchases (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references profiles(id),
  product_id              uuid not null references shop_products(id),
  product_name_snapshot   varchar not null,
  product_image_snapshot  text,
  price_points            integer not null default 0 check (price_points >= 0),
  purchased_at            timestamptz not null default now(),
  is_delivered            boolean not null default false,
  delivered_at            timestamptz
);

-- =====================================================================
-- 3. INDEXES
-- =====================================================================
create index if not exists idx_shop_products_available on shop_products (is_available);
create index if not exists idx_shop_purchases_user on shop_purchases (user_id, purchased_at desc);
create index if not exists idx_shop_purchases_product on shop_purchases (product_id);
create index if not exists idx_shop_purchases_created on shop_purchases (purchased_at desc);

-- =====================================================================
-- 4. ROW LEVEL SECURITY
-- All shop reads/writes go through SECURITY DEFINER functions below,
-- matching the rest of the (RLS-locked-down) schema. No direct policies.
-- =====================================================================
alter table shop_products enable row level security;
alter table shop_purchases enable row level security;

-- =====================================================================
-- 5. TRIGGERS
-- =====================================================================
drop trigger if exists trg_shop_products_updated_at on shop_products;
create trigger trg_shop_products_updated_at before update on shop_products
  for each row execute function set_updated_at();

-- =====================================================================
-- 6. FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------
-- get_shop_products_public — youth browsing list (all products;
-- includes is_available/stock so the UI can reflect honest states)
-- ---------------------------------------------------------------
create or replace function get_shop_products_public()
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.is_available desc, t.created_at desc), '[]'::jsonb)
  from (
    select id, name, description, image_url, price_points, stock_quantity,
           is_available, max_per_user, created_at
    from shop_products
  ) t;
$$;

-- ---------------------------------------------------------------
-- get_my_shop_purchases — youth purchase history
-- ---------------------------------------------------------------
create or replace function get_my_shop_purchases(p_user_id uuid)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.purchased_at desc), '[]'::jsonb)
  from (
    select id, product_id, product_name_snapshot, product_image_snapshot,
           price_points, purchased_at, is_delivered, delivered_at
    from shop_purchases
    where user_id = p_user_id
  ) t;
$$;

-- ---------------------------------------------------------------
-- purchase_shop_product — THE atomic purchase RPC
-- Single transaction: every step shares one implicit plpgsql
-- transaction. Any raised exception aborts the whole function, so
-- NO balance is deducted, NO stock is reduced and NO purchase/tx rows
-- are created when any check fails.
-- Concurrency: the profile row and product row are locked (SELECT FOR
-- UPDATE). Two youths racing for the last item serialize on the product
-- lock; the second sees stock_quantity = 0 -> OUT_OF_STOCK. The stock
-- decrement uses an extra guarded conditional update so stock can never
-- go negative even if a re-check ever slipped past.
-- ---------------------------------------------------------------
create or replace function purchase_shop_product(p_user_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_product       shop_products%rowtype;
  v_profile       profiles%rowtype;
  v_new_balance   integer;
  v_stock_after   integer;
  v_purchase_count integer;
  v_purchase_id   uuid;
begin
  select * into v_profile from profiles where id = p_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_profile.status <> 'active' then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  select * into v_product from shop_products where id = p_product_id for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if v_product.is_available = false then
    raise exception 'PRODUCT_UNAVAILABLE';
  end if;
  if v_product.stock_quantity <= 0 then
    raise exception 'OUT_OF_STOCK';
  end if;
  if v_profile.current_balance < v_product.price_points then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  if v_product.max_per_user is not null then
    select count(*) into v_purchase_count
    from shop_purchases
    where user_id = p_user_id and product_id = p_product_id;
    if v_purchase_count >= v_product.max_per_user then
      raise exception 'PURCHASE_LIMIT_REACHED';
    end if;
  end if;

  v_new_balance := v_profile.current_balance - v_product.price_points;

  insert into shop_purchases (
    user_id, product_id, product_name_snapshot, product_image_snapshot, price_points
  ) values (
    p_user_id, v_product.id, v_product.name, v_product.image_url, v_product.price_points
  ) returning id into v_purchase_id;

  update shop_products
    set stock_quantity = stock_quantity - 1
    where id = v_product.id and stock_quantity > 0
    returning stock_quantity into v_stock_after;
  if v_stock_after is null then
    raise exception 'OUT_OF_STOCK';
  end if;

  update profiles
    set current_balance = v_new_balance,
        total_spent = total_spent + v_product.price_points
    where id = p_user_id;

  if v_product.price_points > 0 then
    insert into point_transactions (
      user_id, type, direction, amount, balance_before, balance_after,
      related_entity_type, related_entity_id, reason
    ) values (
      p_user_id, 'shop_purchase', 'debit', v_product.price_points,
      v_profile.current_balance, v_new_balance,
      'shop_purchases', v_purchase_id,
      'شراء من المتجر: ' || v_product.name
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'balance_after', v_new_balance,
    'stock_after', v_stock_after,
    'product_name', v_product.name
  );
end;
$$;

-- =====================================================================
-- 7. ADMIN FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------
-- get_admin_shop_products — all products + lifetime purchase count
-- ---------------------------------------------------------------
create or replace function get_admin_shop_products()
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select sp.id, sp.name, sp.description, sp.image_url, sp.price_points,
           sp.stock_quantity, sp.is_available, sp.max_per_user,
           sp.created_at, sp.updated_at,
           (select count(*) from shop_purchases pu where pu.product_id = sp.id) as purchased_count
    from shop_products sp
  ) t;
$$;

-- ---------------------------------------------------------------
-- create_shop_product
-- ---------------------------------------------------------------
create or replace function create_shop_product(
  p_admin_id uuid, p_name varchar, p_description text, p_image_url text,
  p_price_points integer, p_stock_quantity integer, p_is_available boolean,
  p_max_per_user integer
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'PRODUCT_NAME_REQUIRED';
  end if;
  if p_price_points is null or p_price_points < 0 then
    raise exception 'INVALID_PRICE';
  end if;
  if p_stock_quantity is null or p_stock_quantity < 0 then
    raise exception 'INVALID_STOCK';
  end if;
  if p_max_per_user is not null and p_max_per_user < 1 then
    raise exception 'INVALID_LIMIT';
  end if;

  insert into shop_products (
    name, description, image_url, price_points, stock_quantity,
    is_available, max_per_user, created_by_admin_id
  ) values (
    trim(p_name), p_description, p_image_url, p_price_points, p_stock_quantity,
    coalesce(p_is_available, true), p_max_per_user, p_admin_id
  ) returning id into v_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, new_data)
  values (p_admin_id, 'create_shop_product', 'shop_products', v_id,
    'إنشاء منتج: ' || trim(p_name),
    jsonb_build_object('name', trim(p_name), 'price_points', p_price_points,
      'stock_quantity', p_stock_quantity));

  return jsonb_build_object('success', true, 'product_id', v_id);
end;
$$;

-- ---------------------------------------------------------------
-- update_shop_product — edits current product only; historical purchase
-- snapshots are never modified
-- ---------------------------------------------------------------
create or replace function update_shop_product(
  p_admin_id uuid, p_product_id uuid, p_name varchar, p_description text,
  p_image_url text, p_price_points integer, p_stock_quantity integer,
  p_is_available boolean, p_max_per_user integer
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_old shop_products%rowtype;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'PRODUCT_NAME_REQUIRED';
  end if;
  if p_price_points is null or p_price_points < 0 then
    raise exception 'INVALID_PRICE';
  end if;
  if p_stock_quantity is null or p_stock_quantity < 0 then
    raise exception 'INVALID_STOCK';
  end if;
  if p_max_per_user is not null and p_max_per_user < 1 then
    raise exception 'INVALID_LIMIT';
  end if;

  select * into v_old from shop_products where id = p_product_id;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  update shop_products set
    name = trim(p_name),
    description = p_description,
    image_url = p_image_url,
    price_points = p_price_points,
    stock_quantity = p_stock_quantity,
    is_available = coalesce(p_is_available, true),
    max_per_user = p_max_per_user
  where id = p_product_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, old_data, new_data)
  values (p_admin_id, 'update_shop_product', 'shop_products', p_product_id,
    'تعديل منتج: ' || trim(p_name),
    to_jsonb(v_old),
    jsonb_build_object('name', trim(p_name), 'price_points', p_price_points,
      'stock_quantity', p_stock_quantity, 'is_available', coalesce(p_is_available, true)));

  return jsonb_build_object('success', true, 'product_id', p_product_id);
end;
$$;

-- ---------------------------------------------------------------
-- get_admin_shop_purchases — admin purchase log (youth identity + snapshot)
-- ---------------------------------------------------------------
create or replace function get_admin_shop_purchases()
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.purchased_at desc), '[]'::jsonb)
  from (
    select pu.id, pu.product_id, pu.product_name_snapshot, pu.product_image_snapshot,
           pu.price_points, pu.purchased_at, pu.is_delivered, pu.delivered_at,
           p.full_name as youth_name, p.phone as youth_phone, p.id as youth_id,
           sp.name as current_product_name,
           sp.is_available as product_available,
           sp.stock_quantity as current_stock,
           sp.price_points as current_price
    from shop_purchases pu
    join profiles p on p.id = pu.user_id
    left join shop_products sp on sp.id = pu.product_id
  ) t;
$$;

-- ---------------------------------------------------------------
-- admin_set_purchase_delivered — minimal delivery toggle (no refunds /
-- cancellations / order lifecycle in V1)
-- ---------------------------------------------------------------
create or replace function admin_set_purchase_delivered(
  p_admin_id uuid, p_purchase_id uuid, p_delivered boolean
)
returns jsonb
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from shop_purchases where id = p_purchase_id) then
    raise exception 'PURCHASE_NOT_FOUND';
  end if;

  update shop_purchases
    set is_delivered = p_delivered,
        delivered_at = case when p_delivered then now() else null end
    where id = p_purchase_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, new_data)
  values (p_admin_id, 'admin_set_purchase_delivered', 'shop_purchases', p_purchase_id,
    case when p_delivered then 'تسليم مكافأة' else 'إلغاء حالة التسليم' end,
    jsonb_build_object('is_delivered', p_delivered));

  return jsonb_build_object('success', true);
end;
$$;

-- =====================================================================
-- 8. ADDITIVE CHANGES TO EXISTING FUNCTIONS
-- -----------------------------------------------------------------
-- Only additions (new allowed transaction type + a new wallet filter).
-- No existing behavior or rows are rewritten.
-- =====================================================================

-- sync_wallet_totals: count shop purchases among "spent" points.
create or replace function sync_wallet_totals(p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_earned integer;
  v_spent integer;
  v_donated integer;
  v_received integer;
  v_balance integer;
begin
  select coalesce(sum(amount) filter (
      where direction = 'credit' and type in
        ('attendance','voucher','referral_inviter','referral_invitee','admin_addition','correction')
    ), 0)
  into v_earned from point_transactions where user_id = p_user_id;

  select coalesce(sum(amount) filter (where type in ('admin_deduction','shop_purchase')), 0)
  into v_spent from point_transactions where user_id = p_user_id;

  select coalesce(sum(amount) filter (where type = 'donation_sent'), 0)
  into v_donated from point_transactions where user_id = p_user_id;

  select coalesce(sum(amount) filter (where type = 'donation_received'), 0)
  into v_received from point_transactions where user_id = p_user_id;

  select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
  into v_balance from point_transactions where user_id = p_user_id;

  update profiles
    set total_earned = v_earned,
        total_spent = v_spent,
        total_donated = v_donated,
        total_received = v_received,
        current_balance = greatest(v_balance, 0),
        updated_at = now()
    where id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id, 'total_earned', v_earned, 'total_spent', v_spent,
    'total_donated', v_donated, 'total_received', v_received, 'current_balance', greatest(v_balance, 0)
  );
end;
$$;

-- get_my_transactions: add the 'shop' filter group.
create or replace function get_my_transactions(p_user_id uuid, p_group varchar default 'all')
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select id, type, direction, amount, balance_before, balance_after, reason, created_at
    from point_transactions
    where user_id = p_user_id
      and (
        p_group = 'all'
        or (p_group = 'attendance' and type = 'attendance')
        or (p_group = 'voucher' and type = 'voucher')
        or (p_group = 'referral' and type in ('referral_inviter','referral_invitee'))
        or (p_group = 'donations' and type in ('donation_sent','donation_received'))
        or (p_group = 'additions' and type = 'admin_addition')
        or (p_group = 'deductions' and type = 'admin_deduction')
        or (p_group = 'shop' and type = 'shop_purchase')
      )
  ) t;
$$;

-- =====================================================================
-- 9. GRANTS
-- =====================================================================
grant execute on function
  get_shop_products_public, get_my_shop_purchases, purchase_shop_product,
  get_admin_shop_products, create_shop_product, update_shop_product,
  get_admin_shop_purchases, admin_set_purchase_delivered
to anon, authenticated;

-- =====================================================================
-- 10. VERIFICATION QUERIES
-- =====================================================================
select 'shop_tables' as check_type, count(*) as count from information_schema.tables
  where table_schema = 'public' and table_name in ('shop_products','shop_purchases');

select 'shop_functions' as check_type, count(*) as count from information_schema.routines
  where routine_schema = 'public' and routine_name in (
    'get_shop_products_public','get_my_shop_purchases','purchase_shop_product',
    'get_admin_shop_products','create_shop_product','update_shop_product',
    'get_admin_shop_purchases','admin_set_purchase_delivered'
  );

select 'shop_type_allowed' as check_type, count(*) as count
  from information_schema.check_constraints
  where constraint_name = 'point_transactions_type_check'
    and check_clause like '%shop_purchase%';

-- =====================================================================
-- END OF MIGRATION 4
-- =====================================================================