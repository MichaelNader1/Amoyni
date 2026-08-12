-- =====================================================================
-- AMOYNI — Migration 2 (standalone)
-- -----------------------------------------------------------------
-- Run this alone in the Supabase SQL Editor if you already ran the main
-- `amoyni_supabase_setup.sql` file before. It only contains what's NEW
-- since then — nothing here touches or repeats anything you already
-- have. Safe to run more than once (idempotent).
--
-- What this adds:
--   1) get_my_meeting_card() — powers the new "spotlight" card on the
--      youth dashboard (today's verse/announcement + the user's own
--      raffle number, shown prominently instead of only appearing
--      briefly on the post-scan success screen).
--   2) Fixes avatar image paths stored in the `avatars` table so they
--      work correctly regardless of where the site is hosted (was an
--      absolute path starting with "/", now a relative path).
-- =====================================================================

-- ---------------------------------------------------------------
-- 1) Dashboard spotlight function
-- ---------------------------------------------------------------
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

-- ---------------------------------------------------------------
-- 2) Fix avatar image paths (absolute -> relative)
-- ---------------------------------------------------------------
update avatars
set image_url = regexp_replace(image_url, '^/', '')
where image_url like '/%';

-- Verification
select 'get_my_meeting_card installed' as check_type,
  count(*) as count from information_schema.routines
  where routine_schema = 'public' and routine_name = 'get_my_meeting_card';

select 'avatars with leading slash remaining (should be 0)' as check_type,
  count(*) as count from avatars where image_url like '/%';

-- =====================================================================
-- END OF MIGRATION 2
-- =====================================================================
