-- ============================================================================
-- Arcade Night — one READ-ONLY RPC to add to the shared leaderboard spine.
-- Paste into the SQL editor of the shared Btown project (jnouvwxomrcffqwilqkq).
-- Safe to re-run. Adds nothing but a function; no table changes, no writes.
--
-- What it can and cannot say (read this before trusting the wall):
--   * scores holds ONE row per (game, player, month): the player's monthly best.
--   * submit_score sets updated_at = now() on EVERY submission, including a worse
--     one (schema.sql: `set score = greatest(...), updated_at = now()`). So
--     updated_at inside the window means "this player SUBMITTED during the night",
--     not "this score was achieved tonight". The score column may be an older
--     monthly best.
--   * Therefore this function answers "who played tonight" (attendance signal),
--     bounded by p_since and p_until. The screen still decides the SCORE by
--     comparing against the snapshot it took when the night opened: a score
--     counts for tonight only if it rose (or the player appeared) since then.
--   * Neither path can see a play that did not beat the player's monthly best,
--     and neither can tell who is physically in the room: the spine has no channel
--     for a night token (submit_score takes game, player, token, name, score, and
--     the name is set inside each game, not by the phone page).
-- Without this function the screen still works on the snapshot alone.
-- ============================================================================

create or replace function public.get_night_board(
  p_game text, p_since timestamptz, p_until timestamptz
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
    and s.updated_at <  least(p_until, p_since + interval '12 hours')   -- hard end: nothing after the deadline, never a long scan
  order by s.score desc, s.updated_at asc
  limit 100;
$$;

revoke all on function public.get_night_board(text, timestamptz, timestamptz) from public;
grant execute on function public.get_night_board(text, timestamptz, timestamptz) to anon, authenticated;
