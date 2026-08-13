-- Run only against an isolated/local Amoyni database after migration 3.
-- Every fixture and mutation is rolled back.
begin;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_disabled_id uuid := gen_random_uuid();
  v_meeting_id uuid := gen_random_uuid();
  v_other_meeting_id uuid := gen_random_uuid();
  v_before_id uuid := gen_random_uuid();
  v_after_id uuid := gen_random_uuid();
  v_admin_token text;
  v_user_token text;
  v_disabled_token text;
  v_result jsonb;
  v_count integer;
begin
  -- Isolate lifecycle tests without permanently changing pre-existing rows.
  update meetings set status = 'closed', closed_at = now() where status = 'active';

  insert into admin_users(id,username,password_hash,display_name,status)
  values(v_admin_id,'qr-test-'||v_admin_id,crypt('test-password',gen_salt('bf')),'QR Test','active');
  insert into profiles(id,phone,password_hash,full_name,status,current_balance)
  values
    (v_user_id,'test-'||v_user_id,crypt('test-password',gen_salt('bf')),'QR Youth','active',0),
    (v_disabled_id,'test-'||v_disabled_id,crypt('test-password',gen_salt('bf')),'Disabled Youth','active',0);

  v_admin_token := admin_login('qr-test-'||v_admin_id,'test-password')->>'session_token';
  v_user_token := youth_login('test-'||v_user_id,'test-password')->>'session_token';
  v_disabled_token := issue_app_session(v_disabled_id,null);
  update profiles set status='disabled' where id=v_disabled_id;

  if has_table_privilege('anon','public.meetings','SELECT') then
    raise exception 'anonymous role can still select meeting QR tokens';
  end if;

  insert into meetings(id,title,meeting_date,attendance_start,attendance_end,status,qr_token,created_by,
    raffle_enabled,raffle_start_number,raffle_end_number)
  values(v_meeting_id,'QR valid',current_date,now()-interval '5 minutes',now()+interval '1 hour',
    'active',repeat('a',32),v_admin_id,true,1,1);
  insert into meeting_point_rules(meeting_id,start_time,end_time,points,sort_order)
  values(v_meeting_id,now()-interval '5 minutes',now()+interval '1 hour',10,0);

  begin
    perform register_attendance(null,v_meeting_id,repeat('a',32));
    raise exception 'anonymous attendance unexpectedly succeeded';
  exception when sqlstate 'AM001' then null; end;

  begin
    perform register_attendance(v_disabled_token,v_meeting_id,repeat('a',32));
    raise exception 'disabled profile unexpectedly succeeded';
  exception when sqlstate 'AM008' then null; end;

  begin
    perform register_attendance(v_user_token,v_meeting_id,repeat('b',32));
    raise exception 'invalid token unexpectedly succeeded';
  exception when sqlstate 'AM004' then null; end;

  v_result := register_attendance(v_user_token,v_meeting_id,repeat('a',32));
  if (v_result->>'points_awarded')::integer <> 10 then raise exception 'wrong points'; end if;
  if (v_result->>'raffle_number')::integer <> 1 then raise exception 'raffle allocation failed'; end if;
  select count(*) into v_count from attendance_records where meeting_id=v_meeting_id and user_id=v_user_id;
  if v_count <> 1 then raise exception 'attendance was not persisted exactly once'; end if;
  if (select current_balance from profiles where id=v_user_id) <> 10 then raise exception 'balance not atomic'; end if;
  if (select count(*) from point_transactions where user_id=v_user_id and type='attendance') <> 1 then
    raise exception 'point transaction not atomic';
  end if;

  begin
    perform register_attendance(v_user_token,v_meeting_id,repeat('a',32));
    raise exception 'duplicate attendance unexpectedly succeeded';
  exception when sqlstate 'AM007' then null; end;

  begin
    insert into meetings(id,title,meeting_date,attendance_start,attendance_end,status,qr_token,created_by)
    values(v_other_meeting_id,'Conflict',current_date,now(),now()+interval '1 hour','active',repeat('c',32),v_admin_id);
    raise exception 'conflicting active meeting unexpectedly succeeded';
  exception when sqlstate 'AM009' then null; end;

  update meetings set status='closed',closed_at=now() where id=v_meeting_id;
  begin
    perform register_attendance(v_user_token,v_meeting_id,repeat('a',32));
    raise exception 'closed meeting attendance unexpectedly succeeded';
  exception when sqlstate 'AM003' then null; end;
  begin
    perform register_attendance(v_user_token,gen_random_uuid(),repeat('a',32));
    raise exception 'unknown meeting attendance unexpectedly succeeded';
  exception when sqlstate 'AM002' then null; end;
  insert into meetings(id,title,meeting_date,attendance_start,attendance_end,status,qr_token,created_by)
  values(v_before_id,'Before',current_date,now()+interval '1 hour',now()+interval '2 hours','active',repeat('d',32),v_admin_id);
  begin
    perform register_attendance(v_user_token,v_before_id,repeat('d',32));
    raise exception 'early attendance unexpectedly succeeded';
  exception when sqlstate 'AM005' then null; end;
  update meetings set status='closed',closed_at=now() where id=v_before_id;

  insert into meetings(id,title,meeting_date,attendance_start,attendance_end,status,qr_token,created_by)
  values(v_after_id,'After',current_date,now()-interval '2 hours',now()-interval '1 hour','active',repeat('e',32),v_admin_id);
  begin
    perform register_attendance(v_user_token,v_after_id,repeat('e',32));
    raise exception 'late attendance unexpectedly succeeded';
  exception when sqlstate 'AM006' then null; end;

  if (get_meeting_details(v_admin_token,v_after_id)->'meeting'->>'qr_token') <> repeat('e',32) then
    raise exception 'authorized admin cannot retrieve QR token';
  end if;
  begin
    perform get_meeting_details(v_user_token,v_after_id);
    raise exception 'youth token unexpectedly accessed admin details';
  exception when sqlstate 'AM010' then null; end;
end $$;

rollback;
