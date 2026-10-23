import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { LeaderboardEntry } from '../components/DashboardLeaderboard';

// Đọc biến môi trường Supabase từ file .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Kiểm tra xem người dùng đã cấu hình URL và API Key của Supabase hay chưa
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-id') &&
    !supabaseAnonKey.includes('your-anon') &&
    supabaseUrl.startsWith('https://')
  );
}

// Khởi tạo Supabase Client (nếu cấu hình hợp lệ)
let supabaseInstance: SupabaseClient | null = null;
if (isSupabaseConfigured()) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });
  } catch (err) {
    console.warn('Không thể khởi tạo Supabase Client:', err);
  }
}

export const supabase = supabaseInstance;

export interface DbLeaderboardRow {
  id: string;
  name: string;
  school_or_role: string;
  correct_count: number;
  total_questions: number;
  total_duration_sec: number;
  score: number;
  max_win_streak: number;
  mode: string;
  timestamp: number;
  created_at?: string;
}

function mapRowToEntry(row: DbLeaderboardRow): LeaderboardEntry {
  return {
    id: row.id,
    name: row.name,
    schoolOrRole: row.school_or_role,
    correctCount: Number(row.correct_count),
    totalQuestions: Number(row.total_questions),
    totalDurationSec: Number(row.total_duration_sec),
    score: Number(row.score),
    maxWinStreak: Number(row.max_win_streak),
    mode: (row.mode as 'ar' | 'mouse') || 'mouse',
    timestamp: Number(row.timestamp),
  };
}

function mapEntryToRow(entry: LeaderboardEntry): DbLeaderboardRow {
  return {
    id: entry.id,
    name: entry.name,
    school_or_role: entry.schoolOrRole,
    correct_count: entry.correctCount,
    total_questions: entry.totalQuestions,
    total_duration_sec: entry.totalDurationSec,
    score: entry.score,
    max_win_streak: entry.maxWinStreak,
    mode: entry.mode,
    timestamp: entry.timestamp,
  };
}

/**
 * Tải danh sách xếp hạng từ PostgreSQL (Supabase)
 * Tự động sắp xếp theo tiêu chí:
 * 1. correct_count DESC (số câu đúng nhiều hơn xếp trên)
 * 2. total_duration_sec ASC (nhanh hơn xếp trên)
 * 3. score DESC (điểm cao hơn xếp trên)
 */
export async function fetchLeaderboardFromDb(): Promise<LeaderboardEntry[] | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('leaderboard_entries')
      .select('*')
      .order('correct_count', { ascending: false })
      .order('total_duration_sec', { ascending: true })
      .order('score', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('Lỗi truy vấn Supabase leaderboard_entries:', error.message);
      return null;
    }

    if (Array.isArray(data)) {
      return data.map((r) => mapRowToEntry(r as DbLeaderboardRow));
    }
    return [];
  } catch (err) {
    console.warn('Lỗi kết nối Supabase:', err);
    return null;
  }
}

/**
 * Lưu hoặc cập nhật kết quả trận đấu lên PostgreSQL (Supabase)
 */
export async function saveLeaderboardToDb(entry: LeaderboardEntry): Promise<boolean> {
  if (!supabase) return false;

  try {
    const row = mapEntryToRow(entry);
    const { error } = await supabase
      .from('leaderboard_entries')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.warn('Lỗi ghi dữ liệu vào Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Lỗi kết nối Supabase khi lưu điểm:', err);
    return false;
  }
}

/**
 * Xóa toàn bộ dữ liệu bảng xếp hạng trên PostgreSQL (dành cho nút Reset)
 */
export async function clearLeaderboardInDb(): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('leaderboard_entries')
      .delete()
      .neq('id', '___non_existent___'); // Xóa tất cả các hàng

    if (error) {
      console.warn('Lỗi xóa bảng xếp hạng trên Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Lỗi kết nối Supabase khi xóa điểm:', err);
    return false;
  }
}

/**
 * Lắng nghe thay đổi Realtime từ PostgreSQL table `leaderboard_entries`
 */
export function subscribeLeaderboardChanges(onChange: () => void): () => void {
  if (!supabase) return () => {};

  try {
    const channel = supabase
      .channel('realtime_leaderboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leaderboard_entries' },
        () => {
          onChange();
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Không thể đăng ký realtime Supabase:', err);
    return () => {};
  }
}
