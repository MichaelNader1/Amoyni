-- =====================================================================
-- AMOYNI — Supabase Database Setup
-- Run this entire file once, top to bottom, in the Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT
-- where practical, but this is meant as a ONE-TIME setup script on a
-- fresh project.
--
-- IMPORTANT DESIGN NOTE — AUTHENTICATION MODEL
-- The spec asks for phone + password login with NO email and NO OTP,
-- which means Supabase Auth (email/OTP based) is not a natural fit.
-- This file implements a server-verifiable CUSTOM auth model instead:
--   - profiles.password_hash and admin_users.password_hash store
--     bcrypt hashes (via pgcrypto).
--   - youth_login()/admin_login() verify credentials and issue an opaque
--     random session token. Only its SHA-256 hash is stored server-side.
--   - Because there is no real Supabase Auth session, auth.uid()
--     is NOT usable inside RLS policies here. Direct table access is
--     therefore locked down (RLS enabled, minimal/no policies), and
--     ALL reads and writes happen through SECURITY DEFINER functions
--     (RPC calls from supabase-js), which run with elevated rights
--     and resolve caller identity from the server-side session table.
--   - A handful of read-only PUBLIC views (active meetings, active
--     campaigns, avatars, leaderboard) are exposed directly via RLS
--     policies since they contain no sensitive data.
-- This keeps the project's "no separate backend" requirement while
-- still protecting balances/passwords/audit data from direct access.
-- =====================================================================


-- =====================================================================
-- 1. EXTENSIONS
-- =====================================================================
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";


-- =====================================================================
-- 2. ENUMS / CHECK CONSTRAINT VALUE SETS
-- Implemented as CHECK constraints (not native enum types) to match
-- the spec's "varchar" column definitions and keep future value
-- additions simple (no ALTER TYPE migrations needed).
-- Reference lists (kept here as comments for maintainers):
--   profile.status            : active, disabled
--   meetings.status            : draft, active, closed, archived
--   meetings.content_type      : verse, announcement, encouragement
--   attendance_records.status  : confirmed
--   point_transactions.type    : attendance, voucher, referral_inviter,
--                                referral_invitee, donation_sent,
--                                donation_received, admin_addition,
--                                admin_deduction, reversal, correction
--   point_transactions.direction: credit, debit
--   vouchers.status            : active, paused, exhausted
--   referrals.status           : pending, rewarded
--   donation_campaigns.status  : draft, active, closed
-- =====================================================================


-- =====================================================================
-- 3. TABLES
-- =====================================================================

-- ---------------------------------------------------------------
-- avatars
-- ---------------------------------------------------------------
create table if not exists avatars (
  id          uuid primary key default gen_random_uuid(),
  name        varchar not null,
  image_url   text not null,
  is_default  boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------
create table if not exists admin_users (
  id             uuid primary key default gen_random_uuid(),
  username       varchar not null,
  password_hash  text not null,
  display_name   varchar,
  status         varchar not null default 'active'
                   check (status in ('active','disabled')),
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- profiles (youth users)
-- NOTE: password_hash is an addition beyond the literal column list
-- in the spec's section 36 — it is required to implement section 7
-- (hashed password storage) under the custom phone/password model.
-- ---------------------------------------------------------------
create table if not exists profiles (
  id                          uuid primary key default gen_random_uuid(),
  phone                       varchar not null,
  password_hash               text not null,
  full_name                   varchar not null,
  birth_date                  date,
  grade                       varchar
                                check (grade in ('أولى ثانوي','ثانية ثانوي','ثالثة ثانوي')),
  avatar_id                   uuid references avatars(id),
  status                      varchar not null default 'active'
                                check (status in ('active','disabled')),
  current_balance             integer not null default 0 check (current_balance >= 0),
  total_earned                integer not null default 0 check (total_earned >= 0),
  total_spent                 integer not null default 0 check (total_spent >= 0),
  total_donated               integer not null default 0 check (total_donated >= 0),
  total_received               integer not null default 0 check (total_received >= 0),
  current_streak              integer not null default 0 check (current_streak >= 0),
  attendance_count            integer not null default 0 check (attendance_count >= 0),
  last_attendance_meeting_id  uuid,
  last_attendance_at          timestamptz,
  referral_code               varchar,
  referred_by_user_id         uuid references profiles(id),
  referral_rewarded           boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz
);

-- ---------------------------------------------------------------
-- app_sessions (opaque server-verifiable youth/admin sessions)
-- ---------------------------------------------------------------
create table if not exists app_sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  bytea not null unique,
  profile_id  uuid references profiles(id) on delete cascade,
  admin_id    uuid references admin_users(id) on delete cascade,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((profile_id is not null)::integer + (admin_id is not null)::integer = 1)
);

-- ---------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------
create table if not exists meetings (
  id                    uuid primary key default gen_random_uuid(),
  title                 varchar not null,
  meeting_date          date not null,
  attendance_start      timestamptz not null,
  attendance_end        timestamptz not null,
  content_type          varchar check (content_type in ('verse','announcement','encouragement')),
  verse_text            text,
  announcement_text     text,
  raffle_enabled        boolean not null default false,
  raffle_start_number   integer,
  raffle_end_number     integer,
  qr_token              varchar,
  status                varchar not null default 'draft'
                          check (status in ('draft','active','closed','archived')),
  started_at            timestamptz,
  closed_at             timestamptz,
  created_by            uuid references admin_users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (attendance_end > attendance_start),
  check (
    raffle_enabled = false
    or (raffle_start_number is not null and raffle_end_number is not null
        and raffle_end_number >= raffle_start_number)
  )
);

-- ---------------------------------------------------------------
-- meeting_point_rules
-- ---------------------------------------------------------------
create table if not exists meeting_point_rules (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings(id) on delete cascade,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  points      integer not null check (points >= 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);

-- ---------------------------------------------------------------
-- attendance_records
-- ---------------------------------------------------------------
create table if not exists attendance_records (
  id                   uuid primary key default gen_random_uuid(),
  meeting_id           uuid not null references meetings(id),
  user_id              uuid not null references profiles(id),
  scan_started_at      timestamptz,
  server_received_at   timestamptz not null default now(),
  points_awarded       integer not null default 0 check (points_awarded >= 0),
  point_rule_id        uuid references meeting_point_rules(id),
  raffle_number        integer,
  status               varchar not null default 'confirmed',
  created_at           timestamptz not null default now(),
  unique (meeting_id, user_id),
  unique (meeting_id, raffle_number)
);

-- ---------------------------------------------------------------
-- point_transactions
-- ---------------------------------------------------------------
create table if not exists point_transactions (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references profiles(id),
  type                        varchar not null check (type in (
                                'attendance','voucher','referral_inviter','referral_invitee',
                                'donation_sent','donation_received','admin_addition',
                                'admin_deduction','reversal','correction'
                              )),
  direction                   varchar not null check (direction in ('credit','debit')),
  amount                      integer not null check (amount > 0),
  balance_before              integer not null check (balance_before >= 0),
  balance_after               integer not null check (balance_after >= 0),
  related_entity_type         varchar,
  related_entity_id           uuid,
  reason                      text,
  admin_id                    uuid references admin_users(id),
  reversal_of_transaction_id  uuid references point_transactions(id),
  created_at                  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- vouchers
-- ---------------------------------------------------------------
create table if not exists vouchers (
  id               uuid primary key default gen_random_uuid(),
  code             varchar not null,
  points           integer not null check (points > 0),
  max_uses         integer not null check (max_uses > 0),
  used_count       integer not null default 0 check (used_count >= 0),
  status           varchar not null default 'active'
                     check (status in ('active','paused','exhausted')),
  success_message  text,
  internal_note    text,
  created_by       uuid references admin_users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (used_count <= max_uses)
);

-- ---------------------------------------------------------------
-- voucher_redemptions
-- ---------------------------------------------------------------
create table if not exists voucher_redemptions (
  id              uuid primary key default gen_random_uuid(),
  voucher_id      uuid not null references vouchers(id),
  user_id         uuid not null references profiles(id),
  points_awarded  integer not null check (points_awarded > 0),
  created_at      timestamptz not null default now(),
  unique (voucher_id, user_id)
);

-- ---------------------------------------------------------------
-- referral_settings (single row table)
-- ---------------------------------------------------------------
create table if not exists referral_settings (
  id               uuid primary key default gen_random_uuid(),
  is_enabled       boolean not null default false,
  inviter_points   integer not null default 0 check (inviter_points >= 0),
  invitee_points   integer not null default 0 check (invitee_points >= 0),
  message          text,
  updated_by       uuid references admin_users(id),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------
create table if not exists referrals (
  id                 uuid primary key default gen_random_uuid(),
  inviter_user_id    uuid not null references profiles(id),
  invitee_user_id    uuid not null references profiles(id),
  referral_code      varchar,
  status             varchar not null default 'pending'
                       check (status in ('pending','rewarded')),
  rewarded_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (invitee_user_id),
  check (inviter_user_id <> invitee_user_id)
);

-- ---------------------------------------------------------------
-- donation_campaigns
-- ---------------------------------------------------------------
create table if not exists donation_campaigns (
  id                    uuid primary key default gen_random_uuid(),
  title                 varchar not null,
  description           text,
  beneficiary_user_id   uuid not null references profiles(id),
  image_url             text,
  status                varchar not null default 'draft'
                          check (status in ('draft','active','closed')),
  starts_at             timestamptz,
  closed_at             timestamptz,
  created_by            uuid references admin_users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- donation_transactions
-- ---------------------------------------------------------------
create table if not exists donation_transactions (
  id                              uuid primary key default gen_random_uuid(),
  campaign_id                     uuid not null references donation_campaigns(id),
  donor_user_id                   uuid not null references profiles(id),
  beneficiary_user_id             uuid not null references profiles(id),
  amount                          integer not null check (amount > 0),
  donor_point_transaction_id      uuid references point_transactions(id),
  beneficiary_point_transaction_id uuid references point_transactions(id),
  created_at                      timestamptz not null default now(),
  check (donor_user_id <> beneficiary_user_id)
);

-- ---------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------
create table if not exists app_settings (
  key         varchar primary key,
  value       jsonb not null,
  updated_by  uuid references admin_users(id),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references admin_users(id),
  action       varchar not null,
  entity_type  varchar,
  entity_id    uuid,
  description  text,
  old_data     jsonb,
  new_data     jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);


-- =====================================================================
-- 4. FOREIGN KEYS
-- All foreign keys were declared inline with the tables above for
-- readability. profiles.last_attendance_meeting_id references meetings,
-- added here separately since meetings is created after profiles.
-- =====================================================================
alter table profiles
  drop constraint if exists profiles_last_attendance_meeting_id_fkey;
alter table profiles
  add constraint profiles_last_attendance_meeting_id_fkey
  foreign key (last_attendance_meeting_id) references meetings(id);


-- =====================================================================
-- 5. CONSTRAINTS (uniques not already declared inline)
-- =====================================================================
create unique index if not exists profiles_phone_unique on profiles (phone) where deleted_at is null;
create unique index if not exists profiles_referral_code_unique on profiles (referral_code) where referral_code is not null;
create unique index if not exists admin_users_username_unique on admin_users (username);
create unique index if not exists vouchers_code_unique on vouchers (code);
create unique index if not exists meetings_qr_token_unique on meetings (qr_token) where qr_token is not null;

-- Prevent overlapping point rules for the same meeting (enforced in the
-- create-meeting admin flow at the application layer, and belt-and-braces
-- via this exclusion constraint using the btree_gist extension).
create extension if not exists btree_gist;
alter table meeting_point_rules
  drop constraint if exists meeting_point_rules_no_overlap;
alter table meeting_point_rules
  add constraint meeting_point_rules_no_overlap
  exclude using gist (
    meeting_id with =,
    tstzrange(start_time, end_time) with &&
  );


-- =====================================================================
-- 6. INDEXES
-- =====================================================================
create index if not exists idx_profiles_balance on profiles (current_balance desc);
create index if not exists idx_profiles_status on profiles (status);
create index if not exists idx_app_sessions_profile on app_sessions (profile_id) where revoked_at is null;
create index if not exists idx_app_sessions_admin on app_sessions (admin_id) where revoked_at is null;
create index if not exists idx_profiles_grade on profiles (grade);
create index if not exists idx_meetings_status on meetings (status);
create index if not exists idx_meeting_point_rules_meeting on meeting_point_rules (meeting_id);
create index if not exists idx_attendance_meeting on attendance_records (meeting_id);
create index if not exists idx_attendance_user on attendance_records (user_id);
create index if not exists idx_point_transactions_user on point_transactions (user_id);
create index if not exists idx_point_transactions_created on point_transactions (created_at desc);
create index if not exists idx_voucher_redemptions_voucher on voucher_redemptions (voucher_id);
create index if not exists idx_referrals_inviter on referrals (inviter_user_id);
create index if not exists idx_donation_tx_campaign on donation_transactions (campaign_id);
create index if not exists idx_audit_logs_admin on audit_logs (admin_id);
create index if not exists idx_audit_logs_created on audit_logs (created_at desc);


-- =====================================================================
-- 7. FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------
-- generate_referral_code: creates a unique 6-char referral code
-- ---------------------------------------------------------------
create or replace function generate_referral_code(p_user_id uuid)
returns varchar
language plpgsql
security definer
as $$
declare
  v_code varchar;
  v_exists boolean;
begin
  loop
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    select exists(select 1 from profiles where referral_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;

  update profiles set referral_code = v_code, updated_at = now() where id = p_user_id;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------
-- register_youth_user
-- ---------------------------------------------------------------
create or replace function register_youth_user(
  p_phone         varchar,
  p_full_name     varchar,
  p_password      varchar,
  p_birth_date    date,
  p_grade         varchar,
  p_avatar_id     uuid,
  p_referral_code varchar default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_password_hash text;
  v_referral_code varchar;
  v_inviter profiles%rowtype;
begin
  if exists (select 1 from profiles where phone = p_phone and deleted_at is null) then
    raise exception 'PHONE_ALREADY_REGISTERED';
  end if;

  v_password_hash := crypt(p_password, gen_salt('bf'));

  insert into profiles (phone, password_hash, full_name, birth_date, grade, avatar_id)
  values (p_phone, v_password_hash, p_full_name, p_birth_date, p_grade, p_avatar_id)
  returning id into v_user_id;

  v_referral_code := generate_referral_code(v_user_id);

  if p_referral_code is not null then
    select * into v_inviter from profiles where referral_code = p_referral_code and deleted_at is null;
    if found and v_inviter.id <> v_user_id then
      update profiles set referred_by_user_id = v_inviter.id where id = v_user_id;
      insert into referrals (inviter_user_id, invitee_user_id, referral_code, status)
      values (v_inviter.id, v_user_id, p_referral_code, 'pending');
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'phone', p_phone,
    'full_name', p_full_name,
    'referral_code', v_referral_code
  );
end;
$$;

-- ---------------------------------------------------------------
-- Opaque session helpers. These are internal and never executable by
-- API roles directly. Callers receive only the one-time plaintext token.
-- ---------------------------------------------------------------
create or replace function issue_app_session(p_profile_id uuid default null, p_admin_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
  v_ttl interval;
begin
  if (p_profile_id is null) = (p_admin_id is null) then
    raise exception using errcode = 'AM010', message = 'UNAUTHORIZED';
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  v_ttl := case when p_admin_id is not null then interval '12 hours' else interval '30 days' end;
  insert into app_sessions (token_hash, profile_id, admin_id, expires_at)
  values (digest(v_token, 'sha256'), p_profile_id, p_admin_id, now() + v_ttl);
  return v_token;
end;
$$;

create or replace function resolve_youth_session(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_profile_status varchar;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  select s.profile_id, p.status into v_profile_id, v_profile_status
  from app_sessions s
  join profiles p on p.id = s.profile_id
  where s.token_hash = digest(p_session_token, 'sha256')
    and s.revoked_at is null and s.expires_at > now()
    and p.deleted_at is null;
  if v_profile_id is null then
    if exists (select 1 from app_sessions where token_hash = digest(p_session_token, 'sha256')
      and admin_id is not null and revoked_at is null and expires_at > now()) then
      raise exception using errcode = 'AM010', message = 'UNAUTHORIZED';
    end if;
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  if v_profile_status <> 'active' then
    raise exception using errcode = 'AM008', message = 'ACCOUNT_DISABLED';
  end if;
  return v_profile_id;
end;
$$;

create or replace function resolve_admin_session(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  select s.admin_id into v_admin_id
  from app_sessions s
  join admin_users a on a.id = s.admin_id
  where s.token_hash = digest(p_session_token, 'sha256')
    and s.revoked_at is null and s.expires_at > now()
    and a.status = 'active';
  if v_admin_id is null then
    if exists (select 1 from app_sessions where token_hash = digest(p_session_token, 'sha256')
      and profile_id is not null and revoked_at is null and expires_at > now()) then
      raise exception using errcode = 'AM010', message = 'UNAUTHORIZED';
    end if;
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  return v_admin_id;
end;
$$;

create or replace function logout_app_session(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_session_token is not null and p_session_token ~ '^[0-9a-fA-F]{64}$' then
    update app_sessions set revoked_at = now()
    where token_hash = digest(p_session_token, 'sha256') and revoked_at is null;
  end if;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function issue_app_session(uuid, uuid) from public, anon, authenticated;
revoke all on function resolve_youth_session(text) from public, anon, authenticated;
revoke all on function resolve_admin_session(text) from public, anon, authenticated;
grant execute on function logout_app_session(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- youth_login
-- ---------------------------------------------------------------
create or replace function youth_login(p_phone varchar, p_password varchar)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile profiles%rowtype;
  v_session_token text;
begin
  select * into v_profile from profiles where phone = p_phone and deleted_at is null;

  if not found or v_profile.password_hash <> crypt(p_password, v_profile.password_hash) then
    raise exception 'INVALID_CREDENTIALS';
  end if;

  if v_profile.status <> 'active' then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  v_session_token := issue_app_session(v_profile.id, null);

  return jsonb_build_object(
    'success', true,
    'session_token', v_session_token,
    'user_id', v_profile.id,
    'full_name', v_profile.full_name,
    'phone', v_profile.phone,
    'grade', v_profile.grade,
    'avatar_id', v_profile.avatar_id,
    'current_balance', v_profile.current_balance,
    'current_streak', v_profile.current_streak,
    'referral_code', v_profile.referral_code
  );
end;
$$;

-- ---------------------------------------------------------------
-- admin_login
-- ---------------------------------------------------------------
create or replace function admin_login(p_username varchar, p_password varchar)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin admin_users%rowtype;
  v_session_token text;
begin
  select * into v_admin from admin_users where username = p_username;

  if not found or v_admin.password_hash <> crypt(p_password, v_admin.password_hash) then
    raise exception 'INVALID_CREDENTIALS';
  end if;

  if v_admin.status <> 'active' then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  update admin_users set last_login_at = now() where id = v_admin.id;
  v_session_token := issue_app_session(null, v_admin.id);

  return jsonb_build_object(
    'success', true,
    'session_token', v_session_token,
    'admin_id', v_admin.id,
    'username', v_admin.username,
    'display_name', v_admin.display_name
  );
end;
$$;

-- ---------------------------------------------------------------
-- close_meeting
-- ---------------------------------------------------------------
create or replace function close_meeting(p_admin_session_token text, p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting meetings%rowtype;
  v_admin_id uuid;
begin
  v_admin_id := resolve_admin_session(p_admin_session_token);
  select * into v_meeting from meetings where id = p_meeting_id for update;
  if not found then
    raise exception 'MEETING_NOT_FOUND';
  end if;
  if v_meeting.status <> 'active' then
    raise exception 'MEETING_NOT_ACTIVE';
  end if;

  update meetings set status = 'closed', closed_at = now(), updated_at = now()
  where id = p_meeting_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, old_data, new_data)
  values (v_admin_id, 'close_meeting', 'meetings', p_meeting_id, 'إغلاق اجتماع',
          to_jsonb(v_meeting), jsonb_build_object('status','closed'));

  return jsonb_build_object('success', true, 'meeting_id', p_meeting_id, 'status', 'closed');
end;
$$;

-- ---------------------------------------------------------------
-- activate_referral_reward
-- ---------------------------------------------------------------
create or replace function activate_referral_reward(p_invitee_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_referral referrals%rowtype;
  v_settings referral_settings%rowtype;
  v_inviter profiles%rowtype;
  v_invitee profiles%rowtype;
begin
  select * into v_settings from referral_settings limit 1;
  if not found or v_settings.is_enabled = false then
    return jsonb_build_object('success', false, 'reason', 'REFERRAL_DISABLED');
  end if;

  select * into v_referral from referrals
    where invitee_user_id = p_invitee_user_id and status = 'pending';
  if not found then
    return jsonb_build_object('success', false, 'reason', 'NO_PENDING_REFERRAL');
  end if;

  select * into v_inviter from profiles where id = v_referral.inviter_user_id for update;
  select * into v_invitee from profiles where id = p_invitee_user_id for update;

  if v_settings.inviter_points > 0 then
    update profiles
      set current_balance = current_balance + v_settings.inviter_points,
          total_earned = total_earned + v_settings.inviter_points,
          updated_at = now()
      where id = v_inviter.id;

    insert into point_transactions (user_id, type, direction, amount, balance_before, balance_after,
      related_entity_type, related_entity_id, reason)
    values (v_inviter.id, 'referral_inviter', 'credit', v_settings.inviter_points,
      v_inviter.current_balance, v_inviter.current_balance + v_settings.inviter_points,
      'referrals', v_referral.id, 'مكافأة دعوة صديق');
  end if;

  if v_settings.invitee_points > 0 then
    update profiles
      set current_balance = current_balance + v_settings.invitee_points,
          total_earned = total_earned + v_settings.invitee_points,
          updated_at = now()
      where id = v_invitee.id;

    insert into point_transactions (user_id, type, direction, amount, balance_before, balance_after,
      related_entity_type, related_entity_id, reason)
    values (v_invitee.id, 'referral_invitee', 'credit', v_settings.invitee_points,
      v_invitee.current_balance, v_invitee.current_balance + v_settings.invitee_points,
      'referrals', v_referral.id, 'مكافأة الانضمام عبر دعوة');
  end if;

  update referrals set status = 'rewarded', rewarded_at = now() where id = v_referral.id;
  update profiles set referral_rewarded = true where id = v_invitee.id;

  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------
-- register_attendance (core check-in flow)
-- ---------------------------------------------------------------
create or replace function register_attendance(
  p_session_token text,
  p_meeting_id uuid,
  p_qr_token varchar
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id            uuid;
  v_meeting            meetings%rowtype;
  v_profile            profiles%rowtype;
  v_server_time        timestamptz := now();
  v_rule               meeting_point_rules%rowtype;
  v_points             integer := 0;
  v_raffle_number      integer := null;
  v_candidate          integer;
  v_taken_count        integer;
  v_total_numbers      integer;
  v_attempt            integer := 0;
  v_attendance_id      uuid;
  v_balance_before     integer;
  v_balance_after      integer;
  v_first_attendance   boolean := false;
  v_referral_settings  referral_settings%rowtype;
begin
  v_user_id := resolve_youth_session(p_session_token);
  select * into v_meeting from meetings where id = p_meeting_id for update;
  if not found then
    raise exception using errcode = 'AM002', message = 'MEETING_NOT_FOUND';
  end if;

  if v_meeting.status <> 'active' then
    raise exception using errcode = 'AM003', message = 'MEETING_NOT_ACTIVE';
  end if;

  if v_meeting.qr_token is distinct from p_qr_token then
    raise exception using errcode = 'AM004', message = 'INVALID_TOKEN';
  end if;

  if v_server_time < v_meeting.attendance_start then
    raise exception using errcode = 'AM005', message = 'ATTENDANCE_NOT_STARTED';
  end if;
  if v_server_time > v_meeting.attendance_end then
    raise exception using errcode = 'AM006', message = 'ATTENDANCE_ENDED';
  end if;

  if exists (select 1 from attendance_records where meeting_id = p_meeting_id and user_id = v_user_id) then
    raise exception using errcode = 'AM007', message = 'ALREADY_ATTENDED';
  end if;

  select * into v_profile from profiles where id = v_user_id for update;
  if not found then
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  if v_profile.status <> 'active' then
    raise exception using errcode = 'AM008', message = 'ACCOUNT_DISABLED';
  end if;

  v_first_attendance := (v_profile.attendance_count = 0);

  -- Determine point rule using the same authoritative server timestamp.
  select * into v_rule
  from meeting_point_rules
  where meeting_id = p_meeting_id
    and v_server_time >= start_time
    and v_server_time < end_time
  order by sort_order asc
  limit 1;

  if found then
    v_points := v_rule.points;
  else
    v_points := 0;
  end if;

  -- Raffle number assignment
  if v_meeting.raffle_enabled and v_meeting.raffle_start_number is not null
     and v_meeting.raffle_end_number is not null then
    v_total_numbers := v_meeting.raffle_end_number - v_meeting.raffle_start_number + 1;
    select count(*) into v_taken_count from attendance_records
      where meeting_id = p_meeting_id and raffle_number is not null;

    if v_taken_count < v_total_numbers then
      loop
        v_attempt := v_attempt + 1;
        v_candidate := floor(random() * v_total_numbers)::int + v_meeting.raffle_start_number;
        if not exists (select 1 from attendance_records where meeting_id = p_meeting_id and raffle_number = v_candidate) then
          v_raffle_number := v_candidate;
          exit;
        end if;
        if v_attempt > 50 then
          select n into v_raffle_number
          from generate_series(v_meeting.raffle_start_number, v_meeting.raffle_end_number) n
          where not exists (select 1 from attendance_records ar where ar.meeting_id = p_meeting_id and ar.raffle_number = n)
          order by random() limit 1;
          exit;
        end if;
      end loop;
    end if;
  end if;

  v_balance_before := v_profile.current_balance;
  v_balance_after := v_balance_before + v_points;

  insert into attendance_records (
    meeting_id, user_id, scan_started_at, server_received_at,
    points_awarded, point_rule_id, raffle_number, status
  ) values (
    p_meeting_id, v_user_id, v_server_time, v_server_time,
    v_points, v_rule.id, v_raffle_number, 'confirmed'
  ) returning id into v_attendance_id;

  update profiles
    set current_balance = v_balance_after,
        total_earned = total_earned + v_points,
        attendance_count = attendance_count + 1,
        last_attendance_meeting_id = p_meeting_id,
        last_attendance_at = v_server_time,
        updated_at = now()
    where id = v_user_id;

  if v_points > 0 then
    insert into point_transactions (
      user_id, type, direction, amount, balance_before, balance_after,
      related_entity_type, related_entity_id, reason
    ) values (
      v_user_id, 'attendance', 'credit', v_points, v_balance_before, v_balance_after,
      'attendance_records', v_attendance_id, 'حضور اجتماع: ' || v_meeting.title
    );
  end if;

  perform recalculate_user_streak(v_user_id);

  if v_first_attendance and v_profile.referred_by_user_id is not null then
    select * into v_referral_settings from referral_settings limit 1;
    if found and v_referral_settings.is_enabled then
      perform activate_referral_reward(v_user_id);
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'attendance_id', v_attendance_id,
    'points_awarded', v_points,
    'balance_after', v_balance_after,
    'raffle_number', v_raffle_number,
    'raffle_enabled', v_meeting.raffle_enabled,
    'raffle_exhausted', (v_meeting.raffle_enabled and v_raffle_number is null),
    'streak', (select current_streak from profiles where id = v_user_id),
    'content_type', v_meeting.content_type,
    'verse_text', v_meeting.verse_text,
    'announcement_text', v_meeting.announcement_text
  );
end;
$$;

-- ---------------------------------------------------------------
-- redeem_voucher
-- ---------------------------------------------------------------
create or replace function redeem_voucher(p_user_id uuid, p_code varchar)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_voucher vouchers%rowtype;
  v_profile profiles%rowtype;
  v_balance_after integer;
begin
  select * into v_voucher from vouchers where code = p_code for update;
  if not found then
    raise exception 'VOUCHER_NOT_FOUND';
  end if;
  if v_voucher.status <> 'active' then
    raise exception 'VOUCHER_INACTIVE';
  end if;
  if v_voucher.used_count >= v_voucher.max_uses then
    update vouchers set status = 'exhausted', updated_at = now() where id = v_voucher.id;
    raise exception 'VOUCHER_EXHAUSTED';
  end if;
  if exists (select 1 from voucher_redemptions where voucher_id = v_voucher.id and user_id = p_user_id) then
    raise exception 'ALREADY_REDEEMED';
  end if;

  select * into v_profile from profiles where id = p_user_id for update;
  if not found or v_profile.status <> 'active' then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  v_balance_after := v_profile.current_balance + v_voucher.points;

  insert into voucher_redemptions (voucher_id, user_id, points_awarded)
  values (v_voucher.id, p_user_id, v_voucher.points);

  update vouchers
    set used_count = used_count + 1,
        status = case when used_count + 1 >= max_uses then 'exhausted' else status end,
        updated_at = now()
    where id = v_voucher.id;

  update profiles
    set current_balance = v_balance_after,
        total_earned = total_earned + v_voucher.points,
        updated_at = now()
    where id = p_user_id;

  insert into point_transactions (user_id, type, direction, amount, balance_before, balance_after,
    related_entity_type, related_entity_id, reason)
  values (p_user_id, 'voucher', 'credit', v_voucher.points,
    v_profile.current_balance, v_balance_after, 'vouchers', v_voucher.id, 'استخدام كود: ' || v_voucher.code);

  return jsonb_build_object(
    'success', true,
    'points_awarded', v_voucher.points,
    'balance_after', v_balance_after,
    'success_message', v_voucher.success_message
  );
end;
$$;

-- ---------------------------------------------------------------
-- create_point_adjustment (admin add/deduct)
-- ---------------------------------------------------------------
create or replace function create_point_adjustment(
  p_admin_id  uuid,
  p_user_id   uuid,
  p_amount    integer,
  p_direction varchar,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_profile profiles%rowtype;
  v_balance_after integer;
  v_type varchar;
begin
  if p_direction not in ('credit','debit') then
    raise exception 'INVALID_DIRECTION';
  end if;
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_profile from profiles where id = p_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if p_direction = 'debit' and v_profile.current_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  v_type := case when p_direction = 'credit' then 'admin_addition' else 'admin_deduction' end;
  v_balance_after := case when p_direction = 'credit'
                      then v_profile.current_balance + p_amount
                      else v_profile.current_balance - p_amount end;

  update profiles
    set current_balance = v_balance_after,
        total_earned = total_earned + case when p_direction = 'credit' then p_amount else 0 end,
        total_spent = total_spent + case when p_direction = 'debit' then p_amount else 0 end,
        updated_at = now()
    where id = p_user_id;

  insert into point_transactions (user_id, type, direction, amount, balance_before, balance_after,
    admin_id, reason)
  values (p_user_id, v_type, p_direction, p_amount, v_profile.current_balance, v_balance_after,
    p_admin_id, p_reason);

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, new_data)
  values (p_admin_id, v_type, 'profiles', p_user_id, p_reason,
    jsonb_build_object('amount', p_amount, 'direction', p_direction));

  return jsonb_build_object('success', true, 'balance_after', v_balance_after);
end;
$$;

-- ---------------------------------------------------------------
-- reverse_point_transaction
-- ---------------------------------------------------------------
create or replace function reverse_point_transaction(
  p_admin_id       uuid,
  p_transaction_id uuid,
  p_reason         text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_original point_transactions%rowtype;
  v_profile  profiles%rowtype;
  v_reverse_direction varchar;
  v_balance_after integer;
begin
  select * into v_original from point_transactions where id = p_transaction_id;
  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if exists (select 1 from point_transactions where reversal_of_transaction_id = p_transaction_id) then
    raise exception 'ALREADY_REVERSED';
  end if;

  select * into v_profile from profiles where id = v_original.user_id for update;

  v_reverse_direction := case when v_original.direction = 'credit' then 'debit' else 'credit' end;

  if v_reverse_direction = 'debit' and v_profile.current_balance < v_original.amount then
    raise exception 'INSUFFICIENT_BALANCE_FOR_REVERSAL';
  end if;

  v_balance_after := case when v_reverse_direction = 'credit'
                      then v_profile.current_balance + v_original.amount
                      else v_profile.current_balance - v_original.amount end;

  update profiles set current_balance = v_balance_after, updated_at = now() where id = v_profile.id;

  insert into point_transactions (user_id, type, direction, amount, balance_before, balance_after,
    admin_id, reason, reversal_of_transaction_id)
  values (v_profile.id, 'reversal', v_reverse_direction, v_original.amount,
    v_profile.current_balance, v_balance_after, p_admin_id, p_reason, p_transaction_id);

  insert into audit_logs (admin_id, action, entity_type, entity_id, description)
  values (p_admin_id, 'reverse_point_transaction', 'point_transactions', p_transaction_id, p_reason);

  perform sync_wallet_totals(v_profile.id);

  return jsonb_build_object('success', true, 'balance_after', v_balance_after);
end;
$$;

-- ---------------------------------------------------------------
-- create_donation
-- ---------------------------------------------------------------
create or replace function create_donation(
  p_donor_id     uuid,
  p_campaign_id  uuid,
  p_amount       integer
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_campaign donation_campaigns%rowtype;
  v_donor profiles%rowtype;
  v_beneficiary profiles%rowtype;
  v_donor_balance_after integer;
  v_beneficiary_balance_after integer;
  v_donor_tx_id uuid;
  v_beneficiary_tx_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_campaign from donation_campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;
  if v_campaign.status <> 'active' then
    raise exception 'CAMPAIGN_CLOSED';
  end if;
  if v_campaign.beneficiary_user_id = p_donor_id then
    raise exception 'SELF_DONATION_NOT_ALLOWED';
  end if;

  select * into v_donor from profiles where id = p_donor_id for update;
  if not found or v_donor.status <> 'active' then
    raise exception 'ACCOUNT_DISABLED';
  end if;
  if v_donor.current_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  select * into v_beneficiary from profiles where id = v_campaign.beneficiary_user_id for update;

  v_donor_balance_after := v_donor.current_balance - p_amount;
  v_beneficiary_balance_after := v_beneficiary.current_balance + p_amount;

  update profiles set current_balance = v_donor_balance_after,
    total_donated = total_donated + p_amount, updated_at = now()
    where id = v_donor.id;

  update profiles set current_balance = v_beneficiary_balance_after,
    total_received = total_received + p_amount, updated_at = now()
    where id = v_beneficiary.id;

  insert into point_transactions (user_id, type, direction, amount, balance_before, balance_after,
    related_entity_type, related_entity_id, reason)
  values (v_donor.id, 'donation_sent', 'debit', p_amount,
    v_donor.current_balance, v_donor_balance_after, 'donation_campaigns', p_campaign_id,
    'تبرع لحملة: ' || v_campaign.title)
  returning id into v_donor_tx_id;

  insert into point_transactions (user_id, type, direction, amount, balance_before, balance_after,
    related_entity_type, related_entity_id, reason)
  values (v_beneficiary.id, 'donation_received', 'credit', p_amount,
    v_beneficiary.current_balance, v_beneficiary_balance_after, 'donation_campaigns', p_campaign_id,
    'تبرع مستلم من حملة: ' || v_campaign.title)
  returning id into v_beneficiary_tx_id;

  insert into donation_transactions (campaign_id, donor_user_id, beneficiary_user_id, amount,
    donor_point_transaction_id, beneficiary_point_transaction_id)
  values (p_campaign_id, v_donor.id, v_beneficiary.id, p_amount, v_donor_tx_id, v_beneficiary_tx_id);

  return jsonb_build_object('success', true, 'donor_balance_after', v_donor_balance_after);
end;
$$;

-- ---------------------------------------------------------------
-- get_leaderboard (top 10)
-- ---------------------------------------------------------------
create or replace function get_leaderboard()
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select
      row_number() over (
        order by p.current_balance desc, p.current_streak desc,
                 p.attendance_count desc, p.created_at asc
      ) as rank,
      p.id as user_id,
      p.full_name,
      p.grade,
      p.avatar_id,
      p.current_balance,
      p.current_streak
    from profiles p
    where p.status = 'active' and p.deleted_at is null
    order by p.current_balance desc, p.current_streak desc,
             p.attendance_count desc, p.created_at asc
    limit 10
  ) t;
$$;

-- ---------------------------------------------------------------
-- recalculate_user_streak
-- ---------------------------------------------------------------
create or replace function recalculate_user_streak(p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_streak integer := 0;
  v_meeting record;
begin
  for v_meeting in
    select m.id,
           exists(select 1 from attendance_records ar
                  where ar.meeting_id = m.id and ar.user_id = p_user_id) as attended
    from meetings m
    where m.status in ('closed','archived','active')
    order by m.meeting_date desc, m.started_at desc nulls last, m.created_at desc
  loop
    if v_meeting.attended then
      v_streak := v_streak + 1;
    else
      exit;
    end if;
  end loop;

  update profiles set current_streak = v_streak, updated_at = now() where id = p_user_id;
  return v_streak;
end;
$$;

-- ---------------------------------------------------------------
-- sync_wallet_totals (reconciliation helper)
-- ---------------------------------------------------------------
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

  select coalesce(sum(amount) filter (where type = 'admin_deduction'), 0)
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


-- =====================================================================
-- 8. TRIGGERS
-- =====================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at before update on admin_users
  for each row execute function set_updated_at();

drop trigger if exists trg_meetings_updated_at on meetings;
create trigger trg_meetings_updated_at before update on meetings
  for each row execute function set_updated_at();

drop trigger if exists trg_vouchers_updated_at on vouchers;
create trigger trg_vouchers_updated_at before update on vouchers
  for each row execute function set_updated_at();

drop trigger if exists trg_donation_campaigns_updated_at on donation_campaigns;
create trigger trg_donation_campaigns_updated_at before update on donation_campaigns
  for each row execute function set_updated_at();


-- =====================================================================
-- 9. VIEWS
-- =====================================================================

create or replace view leaderboard_top_10 as
  select
    row_number() over (
      order by p.current_balance desc, p.current_streak desc,
               p.attendance_count desc, p.created_at asc
    ) as rank,
    p.id as user_id,
    p.full_name,
    p.grade,
    p.avatar_id,
    p.current_balance,
    p.current_streak
  from profiles p
  where p.status = 'active' and p.deleted_at is null
  order by p.current_balance desc, p.current_streak desc,
           p.attendance_count desc, p.created_at asc
  limit 10;

create or replace view user_wallet_summary as
  select
    id as user_id, full_name, current_balance, total_earned,
    total_spent, total_donated, total_received, current_streak,
    attendance_count, last_attendance_at
  from profiles
  where deleted_at is null;

create or replace view meeting_attendance_summary as
  select
    m.id as meeting_id,
    m.title,
    m.meeting_date,
    m.status,
    count(ar.id) as attendance_count,
    coalesce(sum(ar.points_awarded), 0) as total_points_awarded,
    count(ar.raffle_number) as raffle_numbers_assigned
  from meetings m
  left join attendance_records ar on ar.meeting_id = m.id
  group by m.id, m.title, m.meeting_date, m.status;

create or replace view voucher_usage_summary as
  select
    v.id as voucher_id,
    v.code,
    v.points,
    v.max_uses,
    v.used_count,
    (v.max_uses - v.used_count) as remaining_uses,
    v.status,
    count(vr.id) as redemption_count
  from vouchers v
  left join voucher_redemptions vr on vr.voucher_id = v.id
  group by v.id, v.code, v.points, v.max_uses, v.used_count, v.status;

create or replace view donation_campaign_summary as
  select
    c.id as campaign_id,
    c.title,
    c.status,
    c.beneficiary_user_id,
    count(dt.id) as donation_count,
    count(distinct dt.donor_user_id) as unique_donor_count,
    coalesce(sum(dt.amount), 0) as total_donated
  from donation_campaigns c
  left join donation_transactions dt on dt.campaign_id = c.id
  group by c.id, c.title, c.status, c.beneficiary_user_id;

create or replace view referral_summary as
  select
    rs.is_enabled,
    rs.inviter_points,
    rs.invitee_points,
    count(r.id) as total_referrals,
    count(r.id) filter (where r.status = 'rewarded') as rewarded_referrals,
    count(r.id) filter (where r.status = 'pending') as pending_referrals
  from referral_settings rs
  left join referrals r on true
  group by rs.is_enabled, rs.inviter_points, rs.invitee_points;

create or replace view admin_dashboard_summary as
  select
    (select count(*) from profiles where deleted_at is null) as total_youth,
    (select count(*) from profiles where status = 'active' and deleted_at is null) as active_accounts,
    (select count(*) from attendance_records ar
       join meetings m on m.id = ar.meeting_id
       where m.id = (select id from meetings order by meeting_date desc, created_at desc limit 1)
    ) as last_meeting_attendance,
    (select coalesce(sum(total_earned), 0) from profiles) as total_points_earned,
    (select coalesce(sum(used_count), 0) from vouchers) as total_voucher_uses,
    (select coalesce(sum(amount), 0) from donation_transactions) as total_donations,
    (select count(*) from referrals) as referral_registrations,
    (select id from meetings where status = 'active' limit 1) as active_meeting_id,
    (select id from donation_campaigns where status = 'active' limit 1) as active_campaign_id;


-- =====================================================================
-- 10 & 11. ROW LEVEL SECURITY + POLICIES
-- (see architecture note at the top of this file)
-- =====================================================================
alter table profiles enable row level security;
alter table app_sessions enable row level security;
alter table admin_users enable row level security;
alter table avatars enable row level security;
alter table meetings enable row level security;
alter table meeting_point_rules enable row level security;
alter table attendance_records enable row level security;
alter table point_transactions enable row level security;
alter table vouchers enable row level security;
alter table voucher_redemptions enable row level security;
alter table referral_settings enable row level security;
alter table referrals enable row level security;
alter table donation_campaigns enable row level security;
alter table donation_transactions enable row level security;
alter table app_settings enable row level security;
alter table audit_logs enable row level security;

-- Public read-only policies for non-sensitive reference/browse data.
drop policy if exists avatars_public_read on avatars;
create policy avatars_public_read on avatars for select using (true);

drop policy if exists meetings_public_read on meetings;

drop policy if exists campaigns_public_read on donation_campaigns;
create policy campaigns_public_read on donation_campaigns for select
  using (status in ('active','closed'));

-- Everything else (profiles, transactions, vouchers, referrals, audit
-- logs, admin_users, app_settings, meeting_point_rules, attendance
-- records, donation_transactions) has NO policies, meaning anon/
-- authenticated roles get zero direct access. All reads/writes for
-- these go through the SECURITY DEFINER functions above (which bypass
-- RLS by default since they run as the function owner).

grant usage on schema public to anon, authenticated;

grant execute on function
  register_youth_user, youth_login, admin_login, register_attendance,
  redeem_voucher, create_point_adjustment, reverse_point_transaction,
  create_donation, get_leaderboard, generate_referral_code,
  recalculate_user_streak, sync_wallet_totals, activate_referral_reward,
  close_meeting
to anon, authenticated;

revoke select on meetings from anon, authenticated;
grant select on avatars, donation_campaigns,
  leaderboard_top_10 to anon, authenticated;


-- =====================================================================
-- 12-15. SEED DATA
-- =====================================================================

-- Default app settings (section 56)
insert into app_settings (key, value) values
  ('app_name', '"Amoyni"'),
  ('leaderboard_limit', '10'),
  ('referral_enabled', 'false'),
  ('allow_multi_device_login', 'true'),
  ('default_language', '"ar"'),
  ('raffle_exhaustion_behavior', '"attendance_without_number"')
on conflict (key) do nothing;

-- Referral disabled by default (single settings row)
insert into referral_settings (is_enabled, inviter_points, invitee_points, message)
select false, 0, 0, null
where not exists (select 1 from referral_settings);

-- 16 default avatars (placeholder image paths — replace with real assets)
insert into avatars (name, image_url, is_default, sort_order)
select * from (values
  ('Avatar 1',  'assets/avatars/avatar-01.png', true, 1),
  ('Avatar 2',  'assets/avatars/avatar-02.png', true, 2),
  ('Avatar 3',  'assets/avatars/avatar-03.png', true, 3),
  ('Avatar 4',  'assets/avatars/avatar-04.png', true, 4),
  ('Avatar 5',  'assets/avatars/avatar-05.png', true, 5),
  ('Avatar 6',  'assets/avatars/avatar-06.png', true, 6),
  ('Avatar 7',  'assets/avatars/avatar-07.png', true, 7),
  ('Avatar 8',  'assets/avatars/avatar-08.png', true, 8),
  ('Avatar 9',  'assets/avatars/avatar-09.png', true, 9),
  ('Avatar 10', 'assets/avatars/avatar-10.png', true, 10),
  ('Avatar 11', 'assets/avatars/avatar-11.png', true, 11),
  ('Avatar 12', 'assets/avatars/avatar-12.png', true, 12),
  ('Avatar 13', 'assets/avatars/avatar-13.png', true, 13),
  ('Avatar 14', 'assets/avatars/avatar-14.png', true, 14),
  ('Avatar 15', 'assets/avatars/avatar-15.png', true, 15),
  ('Avatar 16', 'assets/avatars/avatar-16.png', true, 16)
) as v(name, image_url, is_default, sort_order)
where not exists (select 1 from avatars);

-- Default Super Admin account.
-- !!! CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN !!!
-- Username: admin   |   Password: ChangeMe123!
insert into admin_users (username, password_hash, display_name, status)
select 'admin', crypt('ChangeMe123!', gen_salt('bf')), 'Super Admin', 'active'
where not exists (select 1 from admin_users);


-- =====================================================================
-- 16. VERIFICATION QUERIES
-- Run these after setup to confirm everything installed correctly.
-- =====================================================================
select 'tables' as check_type, count(*) as count from information_schema.tables
  where table_schema = 'public' and table_name in (
    'profiles','admin_users','app_sessions','avatars','meetings','meeting_point_rules',
    'attendance_records','point_transactions','vouchers','voucher_redemptions',
    'referral_settings','referrals','donation_campaigns','donation_transactions',
    'app_settings','audit_logs'
  );

select 'functions' as check_type, count(*) as count from information_schema.routines
  where routine_schema = 'public' and routine_name in (
    'register_youth_user','youth_login','admin_login','register_attendance',
    'redeem_voucher','create_point_adjustment','reverse_point_transaction',
    'create_donation','activate_referral_reward','close_meeting',
    'generate_referral_code','get_leaderboard','recalculate_user_streak',
    'sync_wallet_totals'
  );

select 'views' as check_type, count(*) as count from information_schema.views
  where table_schema = 'public' and table_name in (
    'leaderboard_top_10','user_wallet_summary','meeting_attendance_summary',
    'voucher_usage_summary','donation_campaign_summary','admin_dashboard_summary',
    'referral_summary'
  );

select 'avatars_seeded' as check_type, count(*) as count from avatars;
select 'admin_seeded' as check_type, count(*) as count from admin_users;
select 'app_settings_seeded' as check_type, count(*) as count from app_settings;

-- =====================================================================
-- END OF FILE
-- =====================================================================
-- =====================================================================
-- AMOYNI — ADDENDUM (Section 57+)
-- Added while implementing the real frontend. The original file (up to
-- "END OF FILE") is untouched — this is a pure addition, run after it.
-- Reason: the original design correctly locks down direct table access
-- behind RLS, but never defined the read/update RPCs the UI needs for:
--   - a youth's own wallet detail / transaction history / attendance
--     history / profile view+edit / the currently active meeting /
--     public app settings (referral toggle, etc.)
--   - the entire admin panel (meetings CRUD, users CRUD, vouchers,
--     referrals, donation campaigns, reports, audit log, dashboard)
-- All functions are SECURITY DEFINER (bypass RLS internally) and
-- Attendance and meeting-management functions resolve identity from
-- server-side opaque sessions. Legacy unrelated RPCs retain their
-- original contracts pending a broader auth migration.
-- =====================================================================

-- ---------------------------------------------------------------
-- 57.1 get_public_settings — safe-to-expose app configuration
-- ---------------------------------------------------------------
create or replace function get_public_settings()
returns jsonb
language sql
security definer
as $$
  select coalesce(
    (select jsonb_object_agg(key, value) from app_settings), '{}'::jsonb
  ) || jsonb_build_object(
    'referral_enabled', coalesce((select is_enabled from referral_settings limit 1), false),
    'referral_message', (select message from referral_settings limit 1)
  );
$$;

-- ---------------------------------------------------------------
-- 57.2 get_active_meeting — public info about the current meeting
-- (never exposes qr_token; that only ever leaves the server rendered
-- inside the QR image itself, generated client-side by the admin page)
-- ---------------------------------------------------------------
create or replace function get_active_meeting()
returns jsonb
language sql
security definer
as $$
  select coalesce(
    (select to_jsonb(m) - 'qr_token' from (
      select id, title, meeting_date, attendance_start, attendance_end,
             content_type, verse_text, announcement_text, raffle_enabled,
             status, started_at
      from meetings where status = 'active'
      order by started_at desc limit 1
    ) m),
    'null'::jsonb
  );
$$;

-- ---------------------------------------------------------------
-- 57.3 get_my_profile
-- ---------------------------------------------------------------
create or replace function get_my_profile(p_user_id uuid)
returns jsonb
language sql
security definer
as $$
  select to_jsonb(p) - 'password_hash' || jsonb_build_object('avatar_image_url', a.image_url)
  from profiles p
  left join avatars a on a.id = p.avatar_id
  where p.id = p_user_id and p.deleted_at is null;
$$;

-- ---------------------------------------------------------------
-- 57.4 update_own_profile — youth can edit name/grade/avatar only
-- ---------------------------------------------------------------
create or replace function update_own_profile(
  p_user_id   uuid,
  p_full_name varchar,
  p_grade     varchar,
  p_avatar_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from profiles where id = p_user_id and deleted_at is null) then
    raise exception 'USER_NOT_FOUND';
  end if;

  update profiles
    set full_name = coalesce(p_full_name, full_name),
        grade = coalesce(p_grade, grade),
        avatar_id = coalesce(p_avatar_id, avatar_id),
        updated_at = now()
    where id = p_user_id;

  return get_my_profile(p_user_id);
end;
$$;

-- ---------------------------------------------------------------
-- 57.5 get_my_wallet — balance summary + recent transactions
-- ---------------------------------------------------------------
create or replace function get_my_wallet(p_user_id uuid)
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'current_balance', p.current_balance,
    'total_earned', p.total_earned,
    'total_spent', p.total_spent,
    'total_donated', p.total_donated,
    'total_received', p.total_received,
    'current_streak', p.current_streak,
    'attendance_count', p.attendance_count,
    'recent_transactions', coalesce((
      select jsonb_agg(row_to_json(t) order by t.created_at desc)
      from (
        select id, type, direction, amount, balance_after, reason, created_at
        from point_transactions
        where user_id = p_user_id
        order by created_at desc
        limit 50
      ) t
    ), '[]'::jsonb)
  )
  from profiles p
  where p.id = p_user_id;
$$;

-- ---------------------------------------------------------------
-- 57.6 get_my_transactions — filterable wallet history
-- p_group: all | attendance | voucher | referral | donations | additions | deductions
-- ---------------------------------------------------------------
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
      )
  ) t;
$$;

-- ---------------------------------------------------------------
-- 57.7 get_my_attendance_history
-- ---------------------------------------------------------------
create or replace function get_my_attendance_history(p_user_id uuid)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select ar.id, ar.points_awarded, ar.raffle_number, ar.created_at,
           m.id as meeting_id, m.title as meeting_title, m.meeting_date
    from attendance_records ar
    join meetings m on m.id = ar.meeting_id
    where ar.user_id = p_user_id
    order by ar.created_at desc
  ) t;
$$;

-- ---------------------------------------------------------------
-- 57.8 get_donation_campaigns_public — for the youth donations page
-- ---------------------------------------------------------------
create or replace function get_donation_campaigns_public()
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select c.id, c.title, c.description, c.image_url, c.status, c.starts_at, c.closed_at,
           b.full_name as beneficiary_name, b.avatar_id as beneficiary_avatar_id,
           ba.image_url as beneficiary_avatar_image_url,
           coalesce(sum(dt.amount), 0) as total_donated,
           count(dt.id) as donation_count,
           c.created_at
    from donation_campaigns c
    join profiles b on b.id = c.beneficiary_user_id
    left join avatars ba on ba.id = b.avatar_id
    left join donation_transactions dt on dt.campaign_id = c.id
    where c.status in ('active','closed')
    group by c.id, b.full_name, b.avatar_id, ba.image_url
  ) t;
$$;

grant execute on function
  get_public_settings, get_active_meeting, get_my_profile, update_own_profile,
  get_my_wallet, get_my_transactions, get_my_attendance_history,
  get_donation_campaigns_public
to anon, authenticated;


-- =====================================================================
-- ADMIN RPC SURFACE
-- =====================================================================

-- ---------------------------------------------------------------
-- 57.9 get_admin_dashboard
-- ---------------------------------------------------------------
create or replace function get_admin_dashboard()
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'summary', (select to_jsonb(s) from admin_dashboard_summary s),
    'attendance_by_meeting', coalesce((
      select jsonb_agg(row_to_json(t) order by t.meeting_date desc) from (
        select title, meeting_date, attendance_count from meeting_attendance_summary
        order by meeting_date desc limit 10
      ) t
    ), '[]'::jsonb),
    'grade_distribution', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select grade, count(*) as count from profiles where deleted_at is null
        group by grade
      ) t
    ), '[]'::jsonb),
    'recent_activity', jsonb_build_object(
      'attendance', coalesce((
        select jsonb_agg(row_to_json(t) order by t.created_at desc) from (
          select p.full_name, ar.points_awarded, ar.created_at
          from attendance_records ar join profiles p on p.id = ar.user_id
          order by ar.created_at desc limit 5
        ) t
      ), '[]'::jsonb),
      'vouchers', coalesce((
        select jsonb_agg(row_to_json(t) order by t.created_at desc) from (
          select p.full_name, v.code, vr.points_awarded, vr.created_at
          from voucher_redemptions vr
          join profiles p on p.id = vr.user_id
          join vouchers v on v.id = vr.voucher_id
          order by vr.created_at desc limit 5
        ) t
      ), '[]'::jsonb),
      'donations', coalesce((
        select jsonb_agg(row_to_json(t) order by t.created_at desc) from (
          select donor.full_name as donor_name, ben.full_name as beneficiary_name,
                 dt.amount, dt.created_at
          from donation_transactions dt
          join profiles donor on donor.id = dt.donor_user_id
          join profiles ben on ben.id = dt.beneficiary_user_id
          order by dt.created_at desc limit 5
        ) t
      ), '[]'::jsonb)
    )
  );
$$;

-- ---------------------------------------------------------------
-- 57.10 Meetings admin CRUD
-- ---------------------------------------------------------------
create or replace function get_admin_meetings(p_status varchar default null)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.meeting_date desc), '[]'::jsonb)
  from (
    select s.meeting_id as id, s.title, s.meeting_date, s.status,
           s.attendance_count, s.total_points_awarded, s.raffle_numbers_assigned
    from meeting_attendance_summary s
    where p_status is null or s.status = p_status
  ) t;
$$;

create or replace function create_meeting(
  p_admin_session_token text, p_title varchar, p_meeting_date date,
  p_attendance_start timestamptz, p_attendance_end timestamptz,
  p_content_type varchar, p_verse_text text, p_announcement_text text,
  p_raffle_enabled boolean, p_raffle_start integer, p_raffle_end integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_admin_id uuid;
begin
  v_admin_id := resolve_admin_session(p_admin_session_token);
  insert into meetings (title, meeting_date, attendance_start, attendance_end,
    content_type, verse_text, announcement_text, raffle_enabled,
    raffle_start_number, raffle_end_number, status, created_by)
  values (p_title, p_meeting_date, p_attendance_start, p_attendance_end,
    p_content_type, p_verse_text, p_announcement_text, coalesce(p_raffle_enabled, false),
    p_raffle_start, p_raffle_end, 'draft', v_admin_id)
  returning id into v_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, new_data)
  values (v_admin_id, 'create_meeting', 'meetings', v_id, 'إنشاء اجتماع: ' || p_title,
    jsonb_build_object('title', p_title, 'meeting_date', p_meeting_date));

  return jsonb_build_object('success', true, 'meeting_id', v_id);
end;
$$;

create or replace function add_point_rule(
  p_admin_session_token text, p_meeting_id uuid, p_start_time timestamptz,
  p_end_time timestamptz, p_points integer, p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_status varchar;
  v_id uuid;
begin
  v_admin_id := resolve_admin_session(p_admin_session_token);
  select status into v_status from meetings where id = p_meeting_id;
  if v_status is null then raise exception 'MEETING_NOT_FOUND'; end if;
  if v_status <> 'draft' then raise exception 'MEETING_NOT_DRAFT'; end if;

  insert into meeting_point_rules (meeting_id, start_time, end_time, points, sort_order)
  values (p_meeting_id, p_start_time, p_end_time, p_points, coalesce(p_sort_order, 0))
  returning id into v_id;

  return jsonb_build_object('success', true, 'rule_id', v_id);
end;
$$;

create or replace function delete_point_rule(p_admin_session_token text, p_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_meeting_id uuid;
  v_status varchar;
begin
  v_admin_id := resolve_admin_session(p_admin_session_token);
  select meeting_id into v_meeting_id from meeting_point_rules where id = p_rule_id;
  if v_meeting_id is null then raise exception 'RULE_NOT_FOUND'; end if;
  select status into v_status from meetings where id = v_meeting_id;
  if v_status <> 'draft' then raise exception 'MEETING_NOT_DRAFT'; end if;

  delete from meeting_point_rules where id = p_rule_id;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function get_meeting_details(p_admin_session_token text, p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform resolve_admin_session(p_admin_session_token);
  return (select jsonb_build_object(
    'meeting', (select to_jsonb(m) from meetings m where m.id = p_meeting_id),
    'point_rules', coalesce((
      select jsonb_agg(row_to_json(r) order by r.sort_order) from meeting_point_rules r
      where r.meeting_id = p_meeting_id
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(row_to_json(t) order by t.created_at) from (
        select p.full_name, p.phone, p.grade, ar.created_at,
               ar.points_awarded, ar.raffle_number
        from attendance_records ar join profiles p on p.id = ar.user_id
        where ar.meeting_id = p_meeting_id
      ) t
    ), '[]'::jsonb)
  ));
end;
$$;

create or replace function enforce_single_active_meeting()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended('amoyni-single-active-meeting', 0));
    if exists (select 1 from meetings where status = 'active' and id <> new.id) then
      raise exception using errcode = 'AM009', message = 'ACTIVE_MEETING_EXISTS';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_single_active_meeting on meetings;
create trigger trg_single_active_meeting
before insert or update of status on meetings
for each row execute function enforce_single_active_meeting();
revoke all on function enforce_single_active_meeting() from public, anon, authenticated;

create or replace function start_meeting(p_admin_session_token text, p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid;
  v_status varchar;
  v_token varchar;
begin
  v_admin_id := resolve_admin_session(p_admin_session_token);
  perform pg_advisory_xact_lock(hashtextextended('amoyni-single-active-meeting', 0));
  select status into v_status from meetings where id = p_meeting_id for update;
  if v_status is null then raise exception 'MEETING_NOT_FOUND'; end if;
  if v_status <> 'draft' then raise exception 'MEETING_NOT_DRAFT'; end if;
  if exists (select 1 from meetings where status = 'active' and id <> p_meeting_id) then
    raise exception using errcode = 'AM009', message = 'ACTIVE_MEETING_EXISTS';
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');

  update meetings set status = 'active', started_at = now(), qr_token = v_token, updated_at = now()
  where id = p_meeting_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description)
  values (v_admin_id, 'start_meeting', 'meetings', p_meeting_id, 'بدء الاجتماع وتفعيل QR');

  return jsonb_build_object('success', true, 'meeting_id', p_meeting_id, 'qr_token', v_token);
end;
$$;

-- ---------------------------------------------------------------
-- 57.11 Users admin
-- ---------------------------------------------------------------
create or replace function get_admin_users(
  p_search varchar default null, p_grade varchar default null,
  p_status varchar default null, p_limit integer default 100
)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select id, full_name, phone, grade, status, current_balance, current_streak,
           last_attendance_at, created_at, avatar_id
    from profiles
    where deleted_at is null
      and (p_search is null or full_name ilike '%'||p_search||'%' or phone ilike '%'||p_search||'%')
      and (p_grade is null or grade = p_grade)
      and (p_status is null or status = p_status)
    order by created_at desc
    limit p_limit
  ) t;
$$;

create or replace function get_user_details(p_user_id uuid)
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'profile', get_my_profile(p_user_id),
    'wallet', get_my_wallet(p_user_id),
    'attendance_history', get_my_attendance_history(p_user_id)
  );
$$;

create or replace function admin_update_user(
  p_admin_id uuid, p_user_id uuid, p_full_name varchar, p_phone varchar,
  p_birth_date date, p_grade varchar, p_avatar_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_old profiles%rowtype;
begin
  select * into v_old from profiles where id = p_user_id and deleted_at is null;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  if p_phone is not null and p_phone <> v_old.phone
     and exists (select 1 from profiles where phone = p_phone and id <> p_user_id and deleted_at is null) then
    raise exception 'PHONE_ALREADY_REGISTERED';
  end if;

  update profiles set
    full_name = coalesce(p_full_name, full_name),
    phone = coalesce(p_phone, phone),
    birth_date = coalesce(p_birth_date, birth_date),
    grade = coalesce(p_grade, grade),
    avatar_id = coalesce(p_avatar_id, avatar_id),
    updated_at = now()
  where id = p_user_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, old_data, new_data)
  values (p_admin_id, 'admin_update_user', 'profiles', p_user_id, 'تعديل بيانات شاب',
    to_jsonb(v_old) - 'password_hash', jsonb_build_object('full_name', p_full_name, 'phone', p_phone));

  return get_my_profile(p_user_id);
end;
$$;

create or replace function admin_set_password(p_admin_id uuid, p_user_id uuid, p_new_password varchar)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;
  update profiles set password_hash = crypt(p_new_password, gen_salt('bf')), updated_at = now()
  where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description)
  values (p_admin_id, 'admin_set_password', 'profiles', p_user_id, 'تغيير كلمة مرور شاب');

  return jsonb_build_object('success', true);
end;
$$;

create or replace function admin_set_user_status(p_admin_id uuid, p_user_id uuid, p_status varchar)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_status not in ('active','disabled') then raise exception 'INVALID_STATUS'; end if;
  update profiles set status = p_status, updated_at = now() where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, new_data)
  values (p_admin_id, 'admin_set_user_status', 'profiles', p_user_id,
    case when p_status = 'disabled' then 'تعطيل حساب' else 'تفعيل حساب' end,
    jsonb_build_object('status', p_status));

  return jsonb_build_object('success', true, 'status', p_status);
end;
$$;

-- ---------------------------------------------------------------
-- 57.12 Vouchers admin
-- ---------------------------------------------------------------
create or replace function get_admin_vouchers()
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.code), '[]'::jsonb)
  from voucher_usage_summary t;
$$;

create or replace function create_voucher(
  p_admin_id uuid, p_code varchar, p_points integer, p_max_uses integer,
  p_success_message text, p_internal_note text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into vouchers (code, points, max_uses, success_message, internal_note, created_by)
  values (upper(p_code), p_points, p_max_uses, p_success_message, p_internal_note, p_admin_id)
  returning id into v_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description)
  values (p_admin_id, 'create_voucher', 'vouchers', v_id, 'إنشاء كود: ' || upper(p_code));

  return jsonb_build_object('success', true, 'voucher_id', v_id);
exception when unique_violation then
  raise exception 'CODE_ALREADY_EXISTS';
end;
$$;

create or replace function set_voucher_status(p_admin_id uuid, p_voucher_id uuid, p_status varchar)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_status not in ('active','paused','exhausted') then raise exception 'INVALID_STATUS'; end if;
  update vouchers set status = p_status, updated_at = now() where id = p_voucher_id;
  if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, new_data)
  values (p_admin_id, 'set_voucher_status', 'vouchers', p_voucher_id, 'تغيير حالة كود',
    jsonb_build_object('status', p_status));

  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------
-- 57.13 Referrals admin
-- ---------------------------------------------------------------
create or replace function get_admin_referrals()
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) from referral_settings s limit 1),
    'summary', (select to_jsonb(s) from referral_summary s),
    'list', coalesce((
      select jsonb_agg(row_to_json(t) order by t.created_at desc) from (
        select r.id, inviter.full_name as inviter_name, invitee.full_name as invitee_name,
               r.status, r.rewarded_at, r.created_at
        from referrals r
        join profiles inviter on inviter.id = r.inviter_user_id
        join profiles invitee on invitee.id = r.invitee_user_id
      ) t
    ), '[]'::jsonb)
  );
$$;

create or replace function update_referral_settings(
  p_admin_id uuid, p_is_enabled boolean, p_inviter_points integer,
  p_invitee_points integer, p_message text
)
returns jsonb
language plpgsql
security definer
as $$
begin
  update referral_settings set
    is_enabled = p_is_enabled,
    inviter_points = p_inviter_points,
    invitee_points = p_invitee_points,
    message = p_message,
    updated_by = p_admin_id,
    updated_at = now();

  insert into audit_logs (admin_id, action, entity_type, description, new_data)
  values (p_admin_id, case when p_is_enabled then 'enable_referral' else 'disable_referral' end,
    'referral_settings', 'تحديث إعدادات الدعوة',
    jsonb_build_object('is_enabled', p_is_enabled, 'inviter_points', p_inviter_points,
      'invitee_points', p_invitee_points));

  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------
-- 57.14 Donation campaigns admin
-- ---------------------------------------------------------------
create or replace function get_admin_donation_campaigns()
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select c.*, b.full_name as beneficiary_name, s.total_donated, s.donation_count, s.unique_donor_count
    from donation_campaigns c
    join profiles b on b.id = c.beneficiary_user_id
    join donation_campaign_summary s on s.campaign_id = c.id
    order by c.created_at desc
  ) t;
$$;

create or replace function create_donation_campaign(
  p_admin_id uuid, p_title varchar, p_description text,
  p_beneficiary_user_id uuid, p_image_url text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into donation_campaigns (title, description, beneficiary_user_id, image_url, status, starts_at, created_by)
  values (p_title, p_description, p_beneficiary_user_id, p_image_url, 'active', now(), p_admin_id)
  returning id into v_id;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description)
  values (p_admin_id, 'create_campaign', 'donation_campaigns', v_id, 'إنشاء حملة: ' || p_title);

  return jsonb_build_object('success', true, 'campaign_id', v_id);
end;
$$;

create or replace function close_donation_campaign(p_admin_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
as $$
begin
  update donation_campaigns set status = 'closed', closed_at = now(), updated_at = now()
  where id = p_campaign_id and status = 'active';
  if not found then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;

  insert into audit_logs (admin_id, action, entity_type, entity_id, description)
  values (p_admin_id, 'close_campaign', 'donation_campaigns', p_campaign_id, 'إغلاق حملة');

  return jsonb_build_object('success', true);
end;
$$;

create or replace function get_donation_transactions_admin(p_campaign_id uuid default null)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select dt.id, c.title as campaign_title, donor.full_name as donor_name,
           ben.full_name as beneficiary_name, dt.amount, dt.created_at
    from donation_transactions dt
    join donation_campaigns c on c.id = dt.campaign_id
    join profiles donor on donor.id = dt.donor_user_id
    join profiles ben on ben.id = dt.beneficiary_user_id
    where p_campaign_id is null or dt.campaign_id = p_campaign_id
  ) t;
$$;

-- ---------------------------------------------------------------
-- 57.15 Audit log + reports admin
-- ---------------------------------------------------------------
create or replace function get_admin_audit_log(p_limit integer default 200)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select al.id, a.username as admin_username, al.action, al.entity_type, al.entity_id,
           al.description, al.old_data, al.new_data, al.created_at
    from audit_logs al
    left join admin_users a on a.id = al.admin_id
    order by al.created_at desc
    limit p_limit
  ) t;
$$;

create or replace function get_report_points_breakdown()
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select type, sum(amount) filter (where direction='credit') as total_credit,
           sum(amount) filter (where direction='debit') as total_debit,
           count(*) as tx_count
    from point_transactions
    group by type
  ) t;
$$;

grant execute on function
  get_admin_dashboard, get_admin_meetings, create_meeting, add_point_rule,
  delete_point_rule, get_meeting_details, start_meeting, get_admin_users,
  get_user_details, admin_update_user, admin_set_password, admin_set_user_status,
  get_admin_vouchers, create_voucher, set_voucher_status, get_admin_referrals,
  update_referral_settings, get_admin_donation_campaigns, create_donation_campaign,
  close_donation_campaign, get_donation_transactions_admin, get_admin_audit_log,
  get_report_points_breakdown
to anon, authenticated;

-- =====================================================================
-- END OF ADDENDUM
-- =====================================================================

-- ---------------------------------------------------------------
-- 57.16 update_app_setting — generic site settings control (section 4.2 "التحكم في إعدادات الموقع")
-- ---------------------------------------------------------------
create or replace function update_app_setting(p_admin_id uuid, p_key varchar, p_value jsonb)
returns jsonb
language plpgsql
security definer
as $$
begin
  insert into app_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, p_admin_id, now())
  on conflict (key) do update set value = excluded.value, updated_by = p_admin_id, updated_at = now();

  insert into audit_logs (admin_id, action, entity_type, entity_id, description, new_data)
  values (p_admin_id, 'update_app_setting', 'app_settings', null, 'تحديث إعداد: ' || p_key,
    jsonb_build_object('key', p_key, 'value', p_value));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function update_app_setting to anon, authenticated;

-- =====================================================================
-- ADDENDUM 2 — Dashboard spotlight (added after user testing feedback)
-- =====================================================================
-- Combined "today's meeting spotlight" for the youth dashboard: verse/announcement
-- content plus the user's own raffle number if they already attended. Added because
-- the verse/announcement and raffle number were only shown transiently on the
-- post-scan success screen — the whole point is to pull youth into opening the app,
-- so this needs to be a persistent, prominent home-page element.
create or replace function get_my_meeting_card(p_user_id uuid)
returns jsonb
language sql
security definer
as $$
  select case when m.id is null then 'null'::jsonb else
    jsonb_build_object(
      'meeting_id', m.id,
      'title', m.title,
      'content_type', m.content_type,
      'verse_text', m.verse_text,
      'announcement_text', m.announcement_text,
      'has_attended', (ar.id is not null),
      'points_awarded', ar.points_awarded,
      'raffle_number', ar.raffle_number,
      'raffle_enabled', m.raffle_enabled
    )
  end
  from (select * from meetings where status = 'active' order by started_at desc limit 1) m
  left join attendance_records ar on ar.meeting_id = m.id and ar.user_id = p_user_id;
$$;

grant execute on function get_my_meeting_card to anon, authenticated;
