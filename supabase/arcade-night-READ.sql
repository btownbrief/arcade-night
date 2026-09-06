-- ============================================================================
-- Arcade Night — one READ-ONLY RPC to add to the shared leaderboard spine.
-- Paste into the SQL editor of the shared Btown project (jnouvwxomrcffqwilqkq).
-- Safe to re-run. Adds nothing but a function; no table changes, no writes.
--
-- Why: the spine's get_leaderboard(p_game, p_month) returns the monthly top 100
-- with no timestamps, so a screen cannot tell which scores landed tonight. The
-- scores table already carries updated_at (bumped only when a player's monthly
-- best improves). This returns the rows touched since a moment, so the night
-- screen can show "tonight's board" directly.
--
-- Without this function the screen still works: it snapshots each monthly board
-- when the night opens and counts anyone whose best rose since. The one thing
-- neither path can see is a player who plays tonight but does not beat their
-- own monthly best; that is a property of the spine (best-per-month), not of
-- this function.
-- ============================================================================

create or replace function public.get_night_board(
  p_game text, p_since timestamptz
) returns table (name text, score integer, player_id uuid, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select p.name, s.score, s.player_id, s.updated_at
  from scores s
  join players p on p.player_id = s.player_id
  where s.game = p_game
    and s.updated_at >= p_since
    and s.updated_at >= now() - interval '2 days'      -- never a long scan; a night is hours
  order by s.score desc, s.updated_at asc
  limit 100;
$$;

revoke all on function public.get_night_board(text, timestamptz) from public;
grant execute on function public.get_night_board(text, timestamptz) to anon, authenticated;
