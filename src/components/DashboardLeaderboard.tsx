import React, { useState, useEffect } from 'react';
import { ControlMode, MatchStats } from '../App';
import { getCharacterById, PLAYER_CHARACTERS } from '../data/characters';
import {
  isSupabaseConfigured,
  fetchLeaderboardFromDb,
  saveLeaderboardToDb,
  clearLeaderboardInDb,
  subscribeLeaderboardChanges,
} from '../services/supabase';

export interface LeaderboardEntry {
  id: string;
  name: string;
  schoolOrRole: string;
  correctCount: number;
  totalQuestions: number;
  totalDurationSec: number;
  score: number;
  maxWinStreak: number;
  mode: ControlMode;
  timestamp: number;
  isCurrent?: boolean;
  characterId?: string;
  characterImage?: string;
  characterName?: string;
}

/**
 * Tìm ảnh nhân vật đồng hành của người chơi dựa trên characterId hoặc thông tin lưu trong schoolOrRole
 */
function resolveEntryCharacter(entry: LeaderboardEntry) {
  if (entry.characterId) {
    return getCharacterById(entry.characterId);
  }
  const roleText = entry.schoolOrRole || '';
  const matched = PLAYER_CHARACTERS.find((c) => roleText.includes(c.name));
  if (matched) return matched;
  // Chọn ổn định theo id nếu là dữ liệu cũ chưa có characterId
  let hash = 0;
  for (let i = 0; i < entry.id.length; i++) {
    hash = (hash * 31 + entry.id.charCodeAt(i)) >>> 0;
  }
  return PLAYER_CHARACTERS[hash % PLAYER_CHARACTERS.length];
}

const STORAGE_KEY = 'manabie_tug_leaderboard_2026';

/**
 * Quy tắc sắp xếp xếp hạng Dashboard:
 * 1. Số câu trả lời đúng (correctCount) cao hơn -> xếp trên
 * 2. Cùng số câu đúng: Thời gian hoàn thành (totalDurationSec) ít hơn (nhanh hơn) -> xếp trên
 * 3. Điểm số (score) cao hơn -> xếp trên
 */
function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.correctCount !== a.correctCount) {
      return b.correctCount - a.correctCount;
    }
    if (a.totalDurationSec !== b.totalDurationSec) {
      return a.totalDurationSec - b.totalDurationSec;
    }
    return b.score - a.score;
  });
}

const ITEMS_PER_PAGE = 20;

/**
 * Sinh danh sách số trang dạng 1, 2, 3... nếu số lượng người chơi đông
 */
function getPageList(current: number, total: number): Array<number | '...'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

function loadStoredEntries(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Loại bỏ hoàn toàn dữ liệu mẫu cũ nếu có trong localStorage từ trước
      return parsed.filter(
        (e) => !e.id?.startsWith('seed-') && !e.id?.startsWith('initial-')
      );
    }
  } catch (e) {
    console.warn('Lỗi đọc Dashboard từ localStorage:', e);
  }
  return [];
}

function saveStoredEntries(entries: LeaderboardEntry[]) {
  try {
    const clean = entries.filter(
      (e) => !e.id?.startsWith('seed-') && !e.id?.startsWith('initial-')
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (e) {
    console.warn('Lỗi lưu Dashboard vào localStorage:', e);
  }
}

export function DashboardLeaderboard({
  currentStats,
}: {
  currentStats?: MatchStats;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(() => loadStoredEntries());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(() => isSupabaseConfigured());
  const [, setIsLoadingDb] = useState<boolean>(false);

  // ID duy nhất cho lượt chơi hiện tại
  const [currentSessionId] = useState<string>(() => {
    return currentStats?.sessionId || '';
  });

  // Tải dữ liệu từ PostgreSQL (Supabase) khi khởi tạo và đăng ký Realtime
  useEffect(() => {
    let active = true;

    async function initSupabaseData() {
      if (isSupabaseConfigured()) {
        setIsLoadingDb(true);
        const dbEntries = await fetchLeaderboardFromDb();
        if (active && dbEntries !== null) {
          setIsDbConnected(true);
          setEntries((prev) => {
            const currentItem = prev.find((e) => e.isCurrent);
            if (currentItem) {
              const merged = [
                currentItem,
                ...dbEntries.filter((e) => e.id !== currentItem.id),
              ];
              const sorted = sortEntries(merged);
              saveStoredEntries(sorted);
              return sorted;
            }
            const sorted = sortEntries(dbEntries);
            saveStoredEntries(sorted);
            return sorted;
          });
        } else if (active) {
          setIsDbConnected(false);
        }
        if (active) setIsLoadingDb(false);
      }
    }

    initSupabaseData();

    // Lắng nghe thay đổi Realtime từ PostgreSQL Supabase
    const unsubscribe = subscribeLeaderboardChanges(() => {
      fetchLeaderboardFromDb().then((dbEntries) => {
        if (active && dbEntries !== null) {
          setEntries(sortEntries(dbEntries));
        }
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Tự động ghi nhận lượt chơi thật hiện tại vào danh sách (bỏ qua session khởi tạo placeholder)
  useEffect(() => {
    if (!currentStats || currentStats.totalQuestions <= 0) return;
    if (!currentStats.sessionId || currentStats.sessionId === 'initial-stats') return;

    setEntries((prev) => {
      const cleanPrev = prev.filter(
        (e) => !e.id?.startsWith('seed-') && !e.id?.startsWith('initial-')
      );
      const existingIdx = cleanPrev.findIndex((e) => e.id === currentSessionId);
      const defaultName =
        currentStats.playerName?.trim() ||
        `Người chơi #${cleanPrev.length + 1}`;
      const defaultSchool =
        currentStats.characterName
          ? `Đồng hành: ${currentStats.characterName}`
          : 'Lượt chơi Golive';

      const newEntry: LeaderboardEntry = {
        id: currentSessionId,
        name: defaultName,
        schoolOrRole: defaultSchool,
        correctCount: currentStats.correctCount,
        totalQuestions: currentStats.totalQuestions,
        totalDurationSec: currentStats.totalDurationSec || 40.0,
        score: currentStats.humanScore,
        maxWinStreak: currentStats.maxWinStreak,
        mode: currentStats.controlMode || 'ar',
        timestamp: Date.now(),
        isCurrent: true,
        characterId: currentStats.characterId,
        characterImage: currentStats.characterImage,
        characterName: currentStats.characterName,
      };

      let nextList: LeaderboardEntry[];
      if (existingIdx >= 0) {
        nextList = [...cleanPrev];
        nextList[existingIdx] = {
          ...nextList[existingIdx],
          ...newEntry,
          name: cleanPrev[existingIdx].name || defaultName,
          schoolOrRole: cleanPrev[existingIdx].schoolOrRole || defaultSchool,
        };
      } else {
        const cleaned = cleanPrev.map((e) => ({ ...e, isCurrent: false }));
        nextList = [newEntry, ...cleaned];
      }

      const sorted = sortEntries(nextList);
      saveStoredEntries(sorted);

      // Tự động lưu lên PostgreSQL (Supabase)
      saveLeaderboardToDb(newEntry).then((success) => {
        if (success) setIsDbConnected(true);
      });

      return sorted;
    });
  }, [currentStats, currentSessionId]);

  const handleResetLeaderboard = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setEntries([]);
    setShowResetConfirm(false);
    await clearLeaderboardInDb();
  };

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasJumpedToPlayer, setHasJumpedToPlayer] = useState(false);

  const sortedList = sortEntries(entries);
  const isRealMatchFinished = currentStats?.sessionId && currentStats.sessionId !== 'initial-stats';
  const currentRankIndex = isRealMatchFinished
    ? sortedList.findIndex((e) => e.id === currentSessionId)
    : -1;
  const currentRank = currentRankIndex >= 0 ? currentRankIndex + 1 : null;
  const totalPages = Math.max(1, Math.ceil(sortedList.length / ITEMS_PER_PAGE));
  const playerPage = currentRankIndex >= 0 ? Math.floor(currentRankIndex / ITEMS_PER_PAGE) + 1 : 1;

  // Tự động chuyển đến trang chứa kết quả của người chơi khi hoàn thành trận
  useEffect(() => {
    if (currentRankIndex >= 0 && !hasJumpedToPlayer) {
      setCurrentPage(playerPage);
      setHasJumpedToPlayer(true);
    }
  }, [currentRankIndex, playerPage, hasJumpedToPlayer]);

  // Giữ currentPage hợp lệ khi danh sách thay đổi
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, sortedList.length);
  const pagedEntries = sortedList.slice(startIndex, endIndex);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full ppt-page-enter">
      {/* HEADER DASHBOARD */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-surface-container-high via-surface-container to-surface-container-lowest p-3.5 sm:p-5 rounded-2xl border border-white/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-tertiary/10 to-transparent pointer-events-none" />

        <div className="flex flex-col gap-1 z-10">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-[10px] sm:text-label-caps uppercase text-tertiary font-bold tracking-wider">
              LIVE DASHBOARD • HOẠT ĐỘNG TƯƠNG TÁC SƯ PHẠM 2026
            </span>
          </div>
          <h2 className="text-headline-md sm:text-headline-lg font-black text-on-surface uppercase tracking-tight">
            BẢNG VINH DANH <span className="text-tertiary">TOP 1 - 2 - 3</span> ĐẤU TRƯỜNG KÉO CO
          </h2>
          <p className="text-body-sm text-on-surface-variant flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-tertiary">sort</span>
            Tiêu chí xếp hạng: <strong>Số câu đúng cao nhất</strong> → <strong>Thời gian hoàn thành nhanh nhất</strong>.
          </p>
        </div>
      </div>

      {/* MODAL XÁC NHẬN ĐẶT LẠI BXH */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-high border border-white/20 rounded-2xl p-5 max-w-sm w-full text-center flex flex-col items-center gap-3 shadow-2xl">
            <span className="material-symbols-outlined text-error text-[36px]">warning</span>
            <h4 className="text-headline-sm font-bold text-on-surface">Đặt lại Bảng xếp hạng?</h4>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              Thao tác này sẽ xóa toàn bộ danh sách kết quả đã ghi nhận và làm mới lại bảng xếp hạng.
            </p>
            <div className="flex items-center justify-center gap-2 w-full pt-1">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-surface-container-lowest text-on-surface font-semibold text-body-sm border border-white/10"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleResetLeaderboard}
                className="flex-1 py-2 rounded-xl bg-error text-on-error font-bold text-body-sm shadow-md"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BANNER THÔNG BÁO THỨ HẠNG CỦA LƯỢT CHƠI HIỆN TẠI (CHỈ HIỂN THỊ KHI ĐÃ CÓ LƯỢT ĐẤU THỰC SỰ) */}
      {currentRank !== null && isRealMatchFinished && (
        <div
          className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border transition-all ${
            currentRank <= 3
              ? 'bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-surface-container border-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.25)]'
              : 'bg-surface-container-low/90 border-tertiary/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-[22px] shrink-0 font-black shadow-md ${
                currentRank === 1
                  ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-[#032117]'
                  : currentRank === 2
                  ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-[#032117]'
                  : currentRank === 3
                  ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white'
                  : 'bg-primary-container text-on-primary-container'
              }`}
            >
              {currentRank === 1 ? '🥇' : currentRank === 2 ? '🥈' : currentRank === 3 ? '🥉' : `#${currentRank}`}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-headline-sm font-black text-on-surface">
                  {currentRank <= 3 ? 'CHÚC MỪNG! BẠN ĐÃ LỌT TOP VINH DANH GOLIVE!' : 'KẾT QUẢ LƯỢT CHƠI CỦA BẠN'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-tertiary/20 text-tertiary border border-tertiary/30">
                  HẠNG #{currentRank}
                </span>
              </div>
              <p className="text-body-sm text-on-surface-variant">
                Đạt <strong>{currentStats?.correctCount}/{currentStats?.totalQuestions} câu đúng</strong> trong{' '}
                <strong className="text-tertiary font-mono">{currentStats?.totalDurationSec}s</strong> • Điểm số:{' '}
                <strong>{currentStats?.humanScore} pts</strong>
              </p>
            </div>
          </div>

          {/* Thông tin đấu thủ & bạn đồng hành đã thiết lập từ đầu */}
          <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-surface-container-lowest/85 border border-white/10 shrink-0 shadow-inner">
            {currentStats.characterImage && (
              <img
                src={currentStats.characterImage}
                alt={currentStats.characterName || 'Nhân vật'}
                className="w-10 h-10 rounded-xl object-contain bg-[#180c3a] border border-emerald-400/50 p-0.5 shrink-0 shadow-md"
              />
            )}
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-black text-white leading-tight">
                {currentStats.playerName || 'Người chơi'}
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-emerald-300 leading-tight">
                {currentStats.characterName ? `Đồng hành: ${currentStats.characterName}` : 'Đã ghi nhận kết quả'}
              </span>
            </div>
            <span className="ml-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1 shadow-sm">
              <span className="material-symbols-outlined text-[13px]">check_circle</span>
              <span>Đã lưu BXH</span>
            </span>
          </div>
        </div>
      )}

      {/* THÔNG BÁO KHI CHƯA CÓ LƯỢT CHƠI NÀO */}
      {sortedList.length === 0 && (
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-surface-container-low/70 rounded-2xl border border-white/10 my-2">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-3 text-tertiary shadow-inner">
            <span className="material-symbols-outlined text-[36px]">emoji_events</span>
          </div>
          <h3 className="text-headline-sm font-bold text-on-surface">Bảng Vàng Đang Sẵn Sàng</h3>
          <p className="text-body-sm text-on-surface-variant max-w-md mt-1 leading-relaxed">
            Chưa có lượt chơi nào được ghi nhận. Hãy bắt đầu trận đấu kéo co đầu tiên để mở màn Bảng vinh danh sự kiện Golive!
          </p>
        </div>
      )}

      {/* BẢNG XẾP HẠNG CHI TIẾT TOÀN DIỆN */}
      <div className="rounded-2xl bg-surface-container-low/95 border border-white/10 shadow-xl overflow-hidden">
        <div className="p-3 sm:p-4 bg-surface-container-high/60 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-tertiary">format_list_numbered</span>
            <h3 className="text-headline-xs font-bold text-on-surface uppercase flex items-center gap-2">
              <span>Danh Sách Đấu Thủ Toàn Trận ({sortedList.length})</span>
              {totalPages > 1 && (
                <span className="text-[11px] font-bold text-tertiary bg-tertiary/15 px-2 py-0.5 rounded-full border border-tertiary/30">
                  Trang {currentPage}/{totalPages}
                </span>
              )}
            </h3>
          </div>
          <span className="text-label-caps text-on-surface-variant uppercase text-[10px]">
            Ưu tiên: Câu đúng ➔ Thời gian
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead>
              <tr className="border-b border-white/10 text-label-kicker text-on-surface-variant uppercase bg-surface-container/50">
                <th className="py-2.5 px-3 sm:px-4 text-center w-16 sm:w-20">Hạng</th>
                <th className="py-2.5 px-3 sm:px-4">Thầy Cô / Đội Thi</th>
                <th className="py-2.5 px-3 sm:px-4 text-center hidden sm:table-cell">Chế độ</th>
                <th className="py-2.5 px-3 sm:px-4 text-center">Số câu đúng</th>
                <th className="py-2.5 px-3 sm:px-4 text-center">Thời gian</th>
                <th className="py-2.5 px-3 sm:px-4 text-center hidden md:table-cell">Chuỗi thắng</th>
                <th className="py-2.5 px-3 sm:px-4 text-right">Điểm số</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-on-surface-variant text-body-sm">
                    Chưa có lượt chơi nào. Kết quả sẽ tự động hiển thị sau khi người chơi đầu tiên hoàn thành trận đấu!
                  </td>
                </tr>
              ) : (
                pagedEntries.map((entry, idx) => {
                  const rank = startIndex + idx + 1;
                  const isCurrent = entry.id === currentSessionId;

                  return (
                    <tr
                      key={entry.id}
                      className={`transition-colors ${
                        isCurrent
                          ? 'bg-tertiary/15 font-bold border-l-4 border-l-tertiary'
                          : rank === 1
                          ? 'bg-amber-500/10 hover:bg-amber-500/20'
                          : rank === 2
                          ? 'bg-slate-300/10 hover:bg-slate-300/20'
                          : rank === 3
                          ? 'bg-amber-700/10 hover:bg-amber-700/20'
                          : 'hover:bg-surface-container/30'
                      }`}
                    >
                      {/* Cột Hạng */}
                      <td className="py-2.5 px-3 sm:px-4 text-center">
                        {rank === 1 ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-200 text-amber-950 font-black text-sm shadow">
                              🥇
                            </span>
                            <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider">Top 1</span>
                          </div>
                        ) : rank === 2 ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr from-slate-200 to-slate-400 text-slate-900 font-black text-sm shadow">
                              🥈
                            </span>
                            <span className="text-[9px] font-black uppercase text-slate-300 tracking-wider">Top 2</span>
                          </div>
                        ) : rank === 3 ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr from-amber-600 to-amber-800 text-amber-100 font-black text-sm shadow">
                              🥉
                            </span>
                            <span className="text-[9px] font-black uppercase text-amber-500 tracking-wider">Top 3</span>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant font-mono font-bold">
                            #{rank}
                          </span>
                        )}
                      </td>

                      {/* Cột Tên & Trường kèm Avatar nhân vật đồng hành */}
                      <td className="py-2.5 px-3 sm:px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={entry.characterImage || resolveEntryCharacter(entry).image}
                            alt={entry.characterName || resolveEntryCharacter(entry).name}
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-contain bg-[#1e1148] border border-purple-400/35 p-0.5 shrink-0 shadow-sm"
                          />
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold ${isCurrent ? 'text-tertiary' : rank === 1 ? 'text-amber-300' : 'text-on-surface'}`}>
                                {entry.name}
                              </span>
                              {rank === 1 && (
                                <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase bg-amber-400/25 text-amber-300 border border-amber-400/40">
                                  QUÁN QUÂN
                                </span>
                              )}
                              {rank === 2 && (
                                <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase bg-slate-300/25 text-slate-200 border border-slate-300/40">
                                  Á QUÂN
                                </span>
                              )}
                              {rank === 3 && (
                                <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase bg-amber-700/25 text-amber-300 border border-amber-600/40">
                                  QUÝ QUÂN
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] sm:text-body-xs text-on-surface-variant">
                              {entry.schoolOrRole}
                            </span>
                          </div>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase bg-tertiary text-[#032117] shadow-sm">
                              BẠN
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cột Chế độ điều khiển */}
                      <td className="py-2.5 px-3 sm:px-4 text-center hidden sm:table-cell">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            entry.mode === 'ar'
                              ? 'bg-tertiary/15 text-tertiary border border-tertiary/30'
                              : 'bg-primary-container/40 text-primary border border-primary/30'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {entry.mode === 'ar' ? 'videocam' : 'mouse'}
                          </span>
                          <span>{entry.mode === 'ar' ? 'Camera AR' : 'Chuột'}</span>
                        </span>
                      </td>

                      {/* Cột Số câu đúng */}
                      <td className="py-2.5 px-3 sm:px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="font-mono font-bold text-tertiary">
                            {entry.correctCount}/{entry.totalQuestions}
                          </span>
                          <span className="text-[10px] text-on-surface-variant hidden md:inline">
                            ({Math.round((entry.correctCount / entry.totalQuestions) * 100)}%)
                          </span>
                        </div>
                      </td>

                      {/* Cột Thời gian */}
                      <td className="py-2.5 px-3 sm:px-4 text-center font-mono font-bold text-amber-300">
                        {entry.totalDurationSec}s
                      </td>

                      {/* Cột Chuỗi thắng */}
                      <td className="py-2.5 px-3 sm:px-4 text-center font-mono text-[11px] text-emerald-400 font-bold hidden md:table-cell">
                        {entry.maxWinStreak > 0 ? `🔥 x${entry.maxWinStreak}` : '—'}
                      </td>

                      {/* Cột Điểm số */}
                      <td className="py-2.5 px-3 sm:px-4 text-right font-black text-on-surface">
                        {entry.score} pts
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* THANH ĐIỀU HƯỚNG PHÂN TRANG (20 NGƯỜI / TRANG) */}
        {totalPages > 1 && (
          <div className="p-3 sm:p-4 bg-surface-container-high/40 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 select-none">
            {/* Thống kê phạm vi hiển thị */}
            <div className="text-xs text-on-surface-variant font-medium flex items-center gap-1.5 flex-wrap justify-center sm:justify-start">
              <span>Hiển thị</span>
              <strong className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">
                {startIndex + 1}–{endIndex}
              </strong>
              <span>trên tổng số</span>
              <strong className="text-tertiary font-mono">{sortedList.length}</strong>
              <span>đấu thủ • Trang <strong className="text-white font-mono">{currentPage}</strong> / {totalPages}</span>

              {/* Nút nhảy nhanh về trang của bạn nếu đang xem trang khác */}
              {currentRankIndex >= 0 && currentPage !== playerPage && (
                <button
                  type="button"
                  onClick={() => setCurrentPage(playerPage)}
                  className="ml-1 sm:ml-2 px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[13px]">person_pin</span>
                  <span>Về trang của bạn (#{currentRank})</span>
                </button>
              )}
            </div>

            {/* Dãy số trang: 1, 2, 3... */}
            <div className="flex items-center gap-1 flex-wrap justify-center">
              {/* Nút Trang trước */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-white/10 disabled:opacity-25 disabled:cursor-not-allowed bg-surface-container hover:bg-surface-container-highest text-on-surface active:scale-95"
                title="Trang trước"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                <span className="hidden sm:inline">Trước</span>
              </button>

              {/* Danh sách các số trang 1, 2, 3... */}
              {getPageList(currentPage, totalPages).map((p, pIdx) => {
                if (p === '...') {
                  return (
                    <span
                      key={`ellipsis-${pIdx}`}
                      className="w-7 text-center text-xs font-bold text-on-surface-variant/60 select-none"
                    >
                      ...
                    </span>
                  );
                }

                const pageNum = p as number;
                const isActive = pageNum === currentPage;
                const isPlayerPage = currentRankIndex >= 0 && pageNum === playerPage;

                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer relative flex items-center justify-center ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-400 to-tertiary text-[#032117] font-black shadow-[0_0_15px_rgba(23,219,229,0.5)] scale-105'
                        : 'bg-surface-container hover:bg-surface-container-highest text-on-surface border border-white/10 hover:border-white/25 active:scale-95'
                    }`}
                  >
                    <span>{pageNum}</span>
                    {/* Chấm tròn nhỏ nhận diện trang có kết quả của người chơi */}
                    {isPlayerPage && !isActive && (
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 border border-[#0d0722] shadow"
                        title="Trang có kết quả của bạn"
                      />
                    )}
                  </button>
                );
              })}

              {/* Nút Trang sau */}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-white/10 disabled:opacity-25 disabled:cursor-not-allowed bg-surface-container hover:bg-surface-container-highest text-on-surface active:scale-95"
                title="Trang sau"
              >
                <span className="hidden sm:inline">Sau</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
