-- =====================================================================
-- AMOYNI — Migration 3: secure, server-authoritative QR attendance
-- Safe for existing data: no attendance/profile/meeting rows are deleted
-- or rewritten. Existing browser sessions must sign in once to receive a
-- server-verifiable token. Existing conflicting active meetings must be
-- closed explicitly before another meeting can be started.
-- =====================================================================

begin;

do $$
begin
  if (select count(*) from public.meetings where status='active') > 1 then
    raise exception using errcode='AM009',
      message='ACTIVE_MEETING_CLEANUP_REQUIRED: close duplicate active meetings before migration 3';
  end if;
end $$;

create table if not exists public.app_sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  bytea not null unique,
  profile_id  uuid references public.profiles(id) on delete cascade,
  admin_id    uuid references public.admin_users(id) on delete cascade,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((profile_id is not null)::integer + (admin_id is not null)::integer = 1)
);
create index if not exists idx_app_sessions_profile on public.app_sessions (profile_id) where revoked_at is null;
create index if not exists idx_app_sessions_admin on public.app_sessions (admin_id) where revoked_at is null;
alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from anon, authenticated;

create or replace function public.issue_app_session(p_profile_id uuid default null, p_admin_id uuid default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token text; v_ttl interval;
begin
  if (p_profile_id is null) = (p_admin_id is null) then
    raise exception using errcode = 'AM010', message = 'UNAUTHORIZED';
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  v_ttl := case when p_admin_id is not null then interval '12 hours' else interval '30 days' end;
  insert into app_sessions (token_hash, profile_id, admin_id, expires_at)
  values (digest(v_token, 'sha256'), p_profile_id, p_admin_id, now() + v_ttl);
  return v_token;
end $$;

create or replace function public.resolve_youth_session(p_session_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile_id uuid; v_profile_status varchar;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  select s.profile_id, p.status into v_profile_id, v_profile_status
  from app_sessions s join profiles p on p.id = s.profile_id
  where s.token_hash = digest(p_session_token, 'sha256')
    and s.revoked_at is null and s.expires_at > now() and p.deleted_at is null;
  if v_profile_id is null then
    if exists(select 1 from app_sessions where token_hash=digest(p_session_token,'sha256')
      and admin_id is not null and revoked_at is null and expires_at>now()) then
      raise exception using errcode='AM010',message='UNAUTHORIZED';
    end if;
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  if v_profile_status <> 'active' then
    raise exception using errcode = 'AM008', message = 'ACCOUNT_DISABLED';
  end if;
  return v_profile_id;
end $$;

create or replace function public.resolve_admin_session(p_session_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_admin_id uuid;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  select s.admin_id into v_admin_id
  from app_sessions s join admin_users a on a.id = s.admin_id
  where s.token_hash = digest(p_session_token, 'sha256')
    and s.revoked_at is null and s.expires_at > now() and a.status = 'active';
  if v_admin_id is null then
    if exists(select 1 from app_sessions where token_hash=digest(p_session_token,'sha256')
      and profile_id is not null and revoked_at is null and expires_at>now()) then
      raise exception using errcode='AM010',message='UNAUTHORIZED';
    end if;
    raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED';
  end if;
  return v_admin_id;
end $$;

create or replace function public.logout_app_session(p_session_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_session_token is not null and p_session_token ~ '^[0-9a-fA-F]{64}$' then
    update app_sessions set revoked_at=now()
    where token_hash=digest(p_session_token,'sha256') and revoked_at is null;
  end if;
  return jsonb_build_object('success',true);
end $$;

revoke all on function public.issue_app_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_youth_session(text) from public, anon, authenticated;
revoke all on function public.resolve_admin_session(text) from public, anon, authenticated;
grant execute on function public.logout_app_session(text) to anon, authenticated;

create or replace function public.youth_login(p_phone varchar, p_password varchar)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile profiles%rowtype; v_session_token text;
begin
  select * into v_profile from profiles where phone = p_phone and deleted_at is null;
  if not found or v_profile.password_hash <> crypt(p_password, v_profile.password_hash) then
    raise exception 'INVALID_CREDENTIALS';
  end if;
  if v_profile.status <> 'active' then raise exception 'ACCOUNT_DISABLED'; end if;
  v_session_token := issue_app_session(v_profile.id, null);
  return jsonb_build_object(
    'success', true, 'session_token', v_session_token, 'user_id', v_profile.id,
    'full_name', v_profile.full_name, 'phone', v_profile.phone, 'grade', v_profile.grade,
    'avatar_id', v_profile.avatar_id, 'current_balance', v_profile.current_balance,
    'current_streak', v_profile.current_streak, 'referral_code', v_profile.referral_code
  );
end $$;

create or replace function public.admin_login(p_username varchar, p_password varchar)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_admin admin_users%rowtype; v_session_token text;
begin
  select * into v_admin from admin_users where username = p_username;
  if not found or v_admin.password_hash <> crypt(p_password, v_admin.password_hash) then
    raise exception 'INVALID_CREDENTIALS';
  end if;
  if v_admin.status <> 'active' then raise exception 'ACCOUNT_DISABLED'; end if;
  update admin_users set last_login_at = now() where id = v_admin.id;
  v_session_token := issue_app_session(null, v_admin.id);
  return jsonb_build_object('success', true, 'session_token', v_session_token,
    'admin_id', v_admin.id, 'username', v_admin.username, 'display_name', v_admin.display_name);
end $$;

drop function if exists public.register_attendance(uuid, uuid, varchar, timestamptz);

create or replace function public.register_attendance(p_session_token text, p_meeting_id uuid, p_qr_token varchar)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid; v_meeting meetings%rowtype; v_profile profiles%rowtype;
  v_server_time timestamptz := now(); v_rule meeting_point_rules%rowtype;
  v_points integer := 0; v_raffle_number integer := null; v_candidate integer;
  v_taken_count integer; v_total_numbers integer; v_attempt integer := 0;
  v_attendance_id uuid; v_balance_before integer; v_balance_after integer;
  v_first_attendance boolean := false; v_referral_settings referral_settings%rowtype;
begin
  v_user_id := resolve_youth_session(p_session_token);
  select * into v_meeting from meetings where id = p_meeting_id for update;
  if not found then raise exception using errcode = 'AM002', message = 'MEETING_NOT_FOUND'; end if;
  if v_meeting.status <> 'active' then raise exception using errcode = 'AM003', message = 'MEETING_NOT_ACTIVE'; end if;
  if v_meeting.qr_token is distinct from p_qr_token then raise exception using errcode = 'AM004', message = 'INVALID_TOKEN'; end if;
  if v_server_time < v_meeting.attendance_start then raise exception using errcode = 'AM005', message = 'ATTENDANCE_NOT_STARTED'; end if;
  if v_server_time > v_meeting.attendance_end then raise exception using errcode = 'AM006', message = 'ATTENDANCE_ENDED'; end if;
  if exists (select 1 from attendance_records where meeting_id = p_meeting_id and user_id = v_user_id) then
    raise exception using errcode = 'AM007', message = 'ALREADY_ATTENDED';
  end if;
  select * into v_profile from profiles where id = v_user_id for update;
  if not found then raise exception using errcode = 'AM001', message = 'UNAUTHENTICATED'; end if;
  if v_profile.status <> 'active' then raise exception using errcode = 'AM008', message = 'ACCOUNT_DISABLED'; end if;
  v_first_attendance := (v_profile.attendance_count = 0);

  select * into v_rule from meeting_point_rules
  where meeting_id = p_meeting_id and v_server_time >= start_time and v_server_time < end_time
  order by sort_order asc limit 1;
  if found then v_points := v_rule.points; end if;

  if v_meeting.raffle_enabled and v_meeting.raffle_start_number is not null and v_meeting.raffle_end_number is not null then
    v_total_numbers := v_meeting.raffle_end_number - v_meeting.raffle_start_number + 1;
    select count(*) into v_taken_count from attendance_records where meeting_id = p_meeting_id and raffle_number is not null;
    if v_taken_count < v_total_numbers then
      loop
        v_attempt := v_attempt + 1;
        v_candidate := floor(random() * v_total_numbers)::int + v_meeting.raffle_start_number;
        if not exists (select 1 from attendance_records where meeting_id = p_meeting_id and raffle_number = v_candidate) then
          v_raffle_number := v_candidate; exit;
        end if;
        if v_attempt > 50 then
          select n into v_raffle_number from generate_series(v_meeting.raffle_start_number, v_meeting.raffle_end_number) n
          where not exists (select 1 from attendance_records ar where ar.meeting_id = p_meeting_id and ar.raffle_number = n)
          order by random() limit 1; exit;
        end if;
      end loop;
    end if;
  end if;

  v_balance_before := v_profile.current_balance;
  v_balance_after := v_balance_before + v_points;
  insert into attendance_records (meeting_id, user_id, scan_started_at, server_received_at,
    points_awarded, point_rule_id, raffle_number, status)
  values (p_meeting_id, v_user_id, v_server_time, v_server_time,
    v_points, v_rule.id, v_raffle_number, 'confirmed') returning id into v_attendance_id;
  update profiles set current_balance = v_balance_after, total_earned = total_earned + v_points,
    attendance_count = attendance_count + 1, last_attendance_meeting_id = p_meeting_id,
    last_attendance_at = v_server_time, updated_at = v_server_time where id = v_user_id;
  if v_points > 0 then
    insert into point_transactions (user_id, type, direction, amount, balance_before, balance_after,
      related_entity_type, related_entity_id, reason)
    values (v_user_id, 'attendance', 'credit', v_points, v_balance_before, v_balance_after,
      'attendance_records', v_attendance_id, 'حضور اجتماع: ' || v_meeting.title);
  end if;
  perform recalculate_user_streak(v_user_id);
  if v_first_attendance and v_profile.referred_by_user_id is not null then
    select * into v_referral_settings from referral_settings limit 1;
    if found and v_referral_settings.is_enabled then perform activate_referral_reward(v_user_id); end if;
  end if;
  return jsonb_build_object('success', true, 'attendance_id', v_attendance_id,
    'points_awarded', v_points, 'balance_after', v_balance_after,
    'raffle_number', v_raffle_number, 'raffle_enabled', v_meeting.raffle_enabled,
    'raffle_exhausted', (v_meeting.raffle_enabled and v_raffle_number is null),
    'streak', (select current_streak from profiles where id = v_user_id),
    'content_type', v_meeting.content_type, 'verse_text', v_meeting.verse_text,
    'announcement_text', v_meeting.announcement_text);
end $$;

grant execute on function public.register_attendance(text, uuid, varchar) to anon, authenticated;

create or replace function public.enforce_single_active_meeting()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended('amoyni-single-active-meeting', 0));
    if exists (select 1 from meetings where status = 'active' and id <> new.id) then
      raise exception using errcode = 'AM009', message = 'ACTIVE_MEETING_EXISTS';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_single_active_meeting() from public, anon, authenticated;
drop trigger if exists trg_single_active_meeting on public.meetings;
create trigger trg_single_active_meeting before insert or update of status on public.meetings
for each row execute function public.enforce_single_active_meeting();

drop function if exists public.close_meeting(uuid, uuid);
create or replace function public.close_meeting(p_admin_session_token text, p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_meeting meetings%rowtype; v_admin_id uuid;
begin
  v_admin_id := resolve_admin_session(p_admin_session_token);
  select * into v_meeting from meetings where id = p_meeting_id for update;
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if v_meeting.status <> 'active' then raise exception 'MEETING_NOT_ACTIVE'; end if;
  update meetings set status = 'closed', closed_at = now(), updated_at = now() where id = p_meeting_id;
  insert into audit_logs (admin_id, action, entity_type, entity_id, description, old_data, new_data)
  values (v_admin_id, 'close_meeting', 'meetings', p_meeting_id, 'إغلاق اجتماع',
    to_jsonb(v_meeting), jsonb_build_object('status','closed'));
  return jsonb_build_object('success', true, 'meeting_id', p_meeting_id, 'status', 'closed');
end $$;

drop function if exists public.create_meeting(uuid,varchar,date,timestamptz,timestamptz,varchar,text,text,boolean,integer,integer);
create or replace function public.create_meeting(p_admin_session_token text, p_title varchar, p_meeting_date date,
  p_attendance_start timestamptz, p_attendance_end timestamptz, p_content_type varchar,
  p_verse_text text, p_announcement_text text, p_raffle_enabled boolean,
  p_raffle_start integer, p_raffle_end integer)
returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare v_id uuid; v_admin_id uuid;
begin
  v_admin_id := resolve_admin_session(p_admin_session_token);
  insert into meetings (title,meeting_date,attendance_start,attendance_end,content_type,verse_text,
    announcement_text,raffle_enabled,raffle_start_number,raffle_end_number,status,created_by)
  values (p_title,p_meeting_date,p_attendance_start,p_attendance_end,p_content_type,p_verse_text,
    p_announcement_text,coalesce(p_raffle_enabled,false),p_raffle_start,p_raffle_end,'draft',v_admin_id)
  returning id into v_id;
  insert into audit_logs (admin_id,action,entity_type,entity_id,description,new_data)
  values (v_admin_id,'create_meeting','meetings',v_id,'إنشاء اجتماع: '||p_title,
    jsonb_build_object('title',p_title,'meeting_date',p_meeting_date));
  return jsonb_build_object('success',true,'meeting_id',v_id);
end $$;

drop function if exists public.add_point_rule(uuid,uuid,timestamptz,timestamptz,integer,integer);
create or replace function public.add_point_rule(p_admin_session_token text,p_meeting_id uuid,p_start_time timestamptz,
  p_end_time timestamptz,p_points integer,p_sort_order integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status varchar;v_id uuid;
begin
  perform resolve_admin_session(p_admin_session_token);
  select status into v_status from meetings where id=p_meeting_id;
  if v_status is null then raise exception 'MEETING_NOT_FOUND'; end if;
  if v_status <> 'draft' then raise exception 'MEETING_NOT_DRAFT'; end if;
  insert into meeting_point_rules(meeting_id,start_time,end_time,points,sort_order)
  values(p_meeting_id,p_start_time,p_end_time,p_points,coalesce(p_sort_order,0)) returning id into v_id;
  return jsonb_build_object('success',true,'rule_id',v_id);
end $$;

drop function if exists public.delete_point_rule(uuid,uuid);
create or replace function public.delete_point_rule(p_admin_session_token text,p_rule_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_meeting_id uuid;v_status varchar;
begin
  perform resolve_admin_session(p_admin_session_token);
  select meeting_id into v_meeting_id from meeting_point_rules where id=p_rule_id;
  if v_meeting_id is null then raise exception 'RULE_NOT_FOUND'; end if;
  select status into v_status from meetings where id=v_meeting_id;
  if v_status <> 'draft' then raise exception 'MEETING_NOT_DRAFT'; end if;
  delete from meeting_point_rules where id=p_rule_id;
  return jsonb_build_object('success',true);
end $$;

drop function if exists public.get_meeting_details(uuid);
create or replace function public.get_meeting_details(p_admin_session_token text,p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform resolve_admin_session(p_admin_session_token);
  return (select jsonb_build_object(
    'meeting',(select to_jsonb(m) from meetings m where m.id=p_meeting_id),
    'point_rules',coalesce((select jsonb_agg(row_to_json(r) order by r.sort_order)
      from meeting_point_rules r where r.meeting_id=p_meeting_id),'[]'::jsonb),
    'attendance',coalesce((select jsonb_agg(row_to_json(t) order by t.created_at) from
      (select p.full_name,p.phone,p.grade,ar.created_at,ar.points_awarded,ar.raffle_number
       from attendance_records ar join profiles p on p.id=ar.user_id where ar.meeting_id=p_meeting_id)t),'[]'::jsonb)
  ));
end $$;

drop function if exists public.start_meeting(uuid,uuid);
create or replace function public.start_meeting(p_admin_session_token text,p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_admin_id uuid;v_status varchar;v_token varchar;
begin
  v_admin_id:=resolve_admin_session(p_admin_session_token);
  perform pg_advisory_xact_lock(hashtextextended('amoyni-single-active-meeting',0));
  select status into v_status from meetings where id=p_meeting_id for update;
  if v_status is null then raise exception 'MEETING_NOT_FOUND'; end if;
  if v_status <> 'draft' then raise exception 'MEETING_NOT_DRAFT'; end if;
  if exists(select 1 from meetings where status='active' and id<>p_meeting_id) then
    raise exception using errcode='AM009',message='ACTIVE_MEETING_EXISTS';
  end if;
  v_token:=encode(gen_random_bytes(16),'hex');
  update meetings set status='active',started_at=now(),qr_token=v_token,updated_at=now() where id=p_meeting_id;
  insert into audit_logs(admin_id,action,entity_type,entity_id,description)
  values(v_admin_id,'start_meeting','meetings',p_meeting_id,'بدء الاجتماع وتفعيل QR');
  return jsonb_build_object('success',true,'meeting_id',p_meeting_id,'qr_token',v_token);
end $$;

grant execute on function public.close_meeting(text,uuid) to anon,authenticated;
grant execute on function public.create_meeting(text,varchar,date,timestamptz,timestamptz,varchar,text,text,boolean,integer,integer) to anon,authenticated;
grant execute on function public.add_point_rule(text,uuid,timestamptz,timestamptz,integer,integer) to anon,authenticated;
grant execute on function public.delete_point_rule(text,uuid) to anon,authenticated;
grant execute on function public.get_meeting_details(text,uuid) to anon,authenticated;
grant execute on function public.start_meeting(text,uuid) to anon,authenticated;

drop policy if exists meetings_public_read on public.meetings;
revoke select on table public.meetings from anon,authenticated;

commit;
