-- ==============================================================================
-- BẢNG LƯU TRỮ DASHBOARD / BẢNG XẾP HẠNG TRÒ CHƠI KÉO CO AI (POSTGRESQL / SUPABASE)
-- Chạy script này trong Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Tạo bảng lưu trữ kết quả trận đấu
create table if not exists public.leaderboard_entries (
  id text primary key,
  name text not null,
  school_or_role text not null default 'Người tham gia',
  correct_count integer not null default 0,
  total_questions integer not null default 12,
  total_duration_sec numeric(6, 2) not null default 0,
  score integer not null default 0,
  max_win_streak integer not null default 0,
  mode text not null default 'mouse', -- 'mouse' hoặc 'ar'
  timestamp bigint not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Đánh chỉ mục (Index) để tối ưu truy vấn sắp xếp bảng xếp hạng
-- Tiêu chí xếp hạng:
--   1. Số câu đúng giảm dần (correct_count DESC)
--   2. Thời gian hoàn thành tăng dần (total_duration_sec ASC)
--   3. Điểm số giảm dần (score DESC)
create index if not exists idx_leaderboard_rank 
on public.leaderboard_entries (correct_count desc, total_duration_sec asc, score desc);

-- 3. Kích hoạt Row Level Security (RLS) để bảo vệ dữ liệu
alter table public.leaderboard_entries enable row level security;

-- 4. Tạo chính sách (Policies) cho phép người chơi xem và lưu điểm công khai
drop policy if exists "Cho phép mọi người xem bảng xếp hạng" on public.leaderboard_entries;
create policy "Cho phép mọi người xem bảng xếp hạng"
on public.leaderboard_entries
for select
using (true);

drop policy if exists "Cho phép mọi người lưu và cập nhật điểm số" on public.leaderboard_entries;
create policy "Cho phép mọi người lưu và cập nhật điểm số"
on public.leaderboard_entries
for all
using (true)
with check (true);

-- 5. Bật Realtime để bảng xếp hạng tự động nhảy điểm khi có người hoàn thành
alter publication supabase_realtime add table public.leaderboard_entries;
