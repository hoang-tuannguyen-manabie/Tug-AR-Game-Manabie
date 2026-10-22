import React, { useState, useEffect } from 'react';
import { ControlMode, MatchStats } from '../App';

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
  const [playerName, setPlayerName] = useState('');
  const [playerSchool, setPlayerSchool] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // ID duy nhất cho lượt chơi hiện tại
  const [currentSessionId] = useState<string>(() => {
    return currentStats?.sessionId || '';
  });

  // Tự động ghi nhận lượt chơi thật hiện tại vào danh sách (bỏ qua session khởi tạo placeholder)
  useEffect(() => {
    if (!currentStats || currentStats.totalQuestions <= 0) return;
    if (!currentStats.sessionId || currentStats.sessionId === 'initial-stats') return;

    setEntries((prev) => {
      const cleanPrev = prev.filter(
        (e) => !e.id?.startsWith('seed-') && !e.id?.startsWith('initial-')
      );
      const existingIdx = cleanPrev.findIndex((e) => e.id === currentSessionId);
      const defaultName = playerName.trim() || `Người chơi #${cleanPrev.length + 1}`;
      const defaultSchool = playerSchool.trim() || 'Lượt chơi Golive';

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
      return sorted;
    });
  }, [currentStats, currentSessionId]);

  // Cập nhật tên và trường của người chơi khi người dùng nhấn "Lưu tên"
  const handleSavePlayerInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    setEntries((prev) => {
      const nextList = prev.map((entry) => {
        if (entry.id === currentSessionId) {
          return {
            ...entry,
            name: playerName.trim(),
            schoolOrRole: playerSchool.trim() || 'Manabie Public School 2026',
          };
        }
        return entry;
      });
      const sorted = sortEntries(nextList);
      saveStoredEntries(sorted);
      return sorted;
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleResetLeaderboard = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEntries([]);
    setShowResetConfirm(false);
  };

  const sortedList = sortEntries(entries);
  const isRealMatchFinished = currentStats?.sessionId && currentStats.sessionId !== 'initial-stats';
  const currentRankIndex = isRealMatchFinished
    ? sortedList.findIndex((e) => e.id === currentSessionId)
    : -1;
  const currentRank = currentRankIndex >= 0 ? currentRankIndex + 1 : null;

  const top1 = sortedList[0];
  const top2 = sortedList[1];
  const top3 = sortedList[2];

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

        <div className="flex items-center gap-2 z-10 self-start sm:self-center">
          {sortedList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="text-[11px] sm:text-label-kicker text-on-surface-variant hover:text-error hover:bg-error-container/20 px-2.5 py-1.5 rounded-lg border border-white/10 transition-colors flex items-center gap-1 cursor-pointer"
              title="Dành cho Ban tổ chức / MC muốn làm mới bảng điểm khi bắt đầu buổi tập huấn mới"
            >
              <span className="material-symbols-outlined text-[15px]">restart_alt</span>
              <span>Đặt lại BXH</span>
            </button>
          )}
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

          {/* Form nhập/sửa tên người chơi để vinh danh */}
          <form
            onSubmit={handleSavePlayerInfo}
            className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto"
          >
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Nhập tên Thầy Cô / Đội thi..."
              className="px-3 py-1.5 text-body-sm rounded-lg bg-surface-container-lowest border border-white/20 text-on-surface focus:outline-none focus:border-tertiary flex-1 sm:w-48"
            />
            <input
              type="text"
              value={playerSchool}
              onChange={(e) => setPlayerSchool(e.target.value)}
              placeholder="Trường / Đơn vị..."
              className="px-3 py-1.5 text-body-sm rounded-lg bg-surface-container-lowest border border-white/20 text-on-surface focus:outline-none focus:border-tertiary flex-1 sm:w-48"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-tertiary text-[#032117] font-bold text-body-sm hover:brightness-110 transition-all flex items-center gap-1 cursor-pointer shrink-0 shadow-md"
            >
              <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
              <span>{isSaved ? 'Đã lưu!' : 'Ghi danh'}</span>
            </button>
          </form>
        </div>
      )}

      {/* BỤC VINH DANH TOP 1 - 2 - 3 HOẶC THÔNG BÁO SẴN SÀNG */}
      {sortedList.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-surface-container-low/70 rounded-2xl border border-white/10 my-2">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-3 text-tertiary shadow-inner">
            <span className="material-symbols-outlined text-[36px]">emoji_events</span>
          </div>
          <h3 className="text-headline-sm font-bold text-on-surface">Bảng Vàng Đang Sẵn Sàng</h3>
          <p className="text-body-sm text-on-surface-variant max-w-md mt-1 leading-relaxed">
            Chưa có lượt chơi nào được ghi nhận. Hãy bắt đầu trận đấu kéo co đầu tiên để mở màn Bảng vinh danh sự kiện Golive!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 items-end pt-3">
          {/* TOP 2 (Á QUÂN) - BÊN TRÁI NẾU CÓ */}
          <div className="order-2 md:order-1">
            {top2 ? (
              <div className="rounded-2xl bg-gradient-to-b from-slate-400/15 via-surface-container to-surface-container-low p-4 sm:p-5 border-2 border-slate-300/40 shadow-[0_8px_30px_rgba(203,213,225,0.15)] flex flex-col items-center text-center relative overflow-hidden group hover:scale-[1.01] transition-transform">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-slate-400 to-slate-200" />
                <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-900 flex items-center justify-center text-2xl font-black shadow-lg mb-2">
                  🥈
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-300/20 text-slate-200 border border-slate-300/30 mb-2">
                  HẠNG 2 • Á QUÂN
                </span>
                <h3 className="text-headline-sm font-black text-on-surface line-clamp-1 mb-0.5">
                  {top2.name}
                </h3>
                <span className="text-body-xs text-on-surface-variant font-medium mb-3">
                  {top2.schoolOrRole}
                </span>

                <div className="w-full bg-surface-container-lowest/80 rounded-xl p-2.5 flex items-center justify-around border border-white/5 text-center">
                  <div>
                    <span className="text-[9px] uppercase text-on-surface-variant block">Độ chính xác</span>
                    <span className="text-headline-xs font-black text-tertiary">
                      {top2.correctCount}/{top2.totalQuestions}
                    </span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div>
                    <span className="text-[9px] uppercase text-on-surface-variant block">Thời gian</span>
                    <span className="text-headline-xs font-black text-amber-300 font-mono">
                      {top2.totalDurationSec}s
                    </span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div>
                    <span className="text-[9px] uppercase text-on-surface-variant block">Điểm số</span>
                    <span className="text-headline-xs font-black text-on-surface">
                      {top2.score} pts
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 p-6 flex flex-col items-center justify-center text-center opacity-60 min-h-[220px]">
                <span className="text-3xl mb-2">🥈</span>
                <span className="text-label-caps text-on-surface-variant uppercase text-[11px]">Đang chờ Á Quân</span>
              </div>
            )}
          </div>

          {/* TOP 1 (QUÁN QUÂN) - Ở GIỮA, NHÔ CAO HƠN */}
          <div className="order-1 md:order-2 md:-translate-y-3">
            {top1 ? (
              <div className="rounded-2xl bg-gradient-to-b from-amber-500/25 via-surface-container-high to-surface-container p-5 sm:p-6 border-2 border-amber-400 shadow-[0_12px_45px_rgba(251,191,36,0.35)] flex flex-col items-center text-center relative overflow-hidden group hover:scale-[1.02] transition-transform">
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 animate-pulse" />
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-400/15 rounded-full blur-2xl pointer-events-none" />

                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-200 text-amber-950 flex items-center justify-center text-3xl font-black shadow-2xl mb-2.5 border-2 border-white/40 ring-4 ring-amber-400/30">
                  🥇
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-caps uppercase font-black bg-amber-400/25 text-amber-300 border border-amber-400/40 mb-2">
                  <span className="material-symbols-outlined text-[15px]">military_tech</span>
                  <span>QUÁN QUÂN • TOP 1 GOLIVE</span>
                </div>

                <h3 className="text-headline-md sm:text-headline-lg font-black text-amber-300 line-clamp-1 mb-0.5 drop-shadow-sm">
                  {top1.name}
                </h3>
                <span className="text-body-sm text-on-surface-variant font-semibold mb-3.5">
                  {top1.schoolOrRole}
                </span>

                <div className="w-full bg-surface-container-lowest/90 rounded-xl p-3 flex items-center justify-around border border-amber-400/20 text-center shadow-inner">
                  <div>
                    <span className="text-[9px] uppercase text-amber-400/80 font-bold block">Đúng câu</span>
                    <span className="text-headline-sm font-black text-tertiary">
                      {top1.correctCount}/{top1.totalQuestions}
                    </span>
                  </div>
                  <div className="w-px h-7 bg-white/10" />
                  <div>
                    <span className="text-[9px] uppercase text-amber-400/80 font-bold block">Thời gian</span>
                    <span className="text-headline-sm font-black text-amber-300 font-mono">
                      {top1.totalDurationSec}s
                    </span>
                  </div>
                  <div className="w-px h-7 bg-white/10" />
                  <div>
                    <span className="text-[9px] uppercase text-amber-400/80 font-bold block">Tổng điểm</span>
                    <span className="text-headline-sm font-black text-white">
                      {top1.score}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 p-6 flex flex-col items-center justify-center text-center opacity-60 min-h-[220px]">
                <span className="text-3xl mb-2">🥇</span>
                <span className="text-label-caps text-on-surface-variant uppercase text-[11px]">Đang chờ Quán Quân</span>
              </div>
            )}
          </div>

          {/* TOP 3 (QUÝ QUÂN) - BÊN PHẢI NẾU CÓ */}
          <div className="order-3 md:order-3">
            {top3 ? (
              <div className="rounded-2xl bg-gradient-to-b from-amber-700/15 via-surface-container to-surface-container-low p-4 sm:p-5 border-2 border-amber-600/40 shadow-[0_8px_30px_rgba(217,119,6,0.15)] flex flex-col items-center text-center relative overflow-hidden group hover:scale-[1.01] transition-transform">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-600 to-amber-700" />
                <div className="w-12 h-12 rounded-full bg-amber-700 text-amber-100 flex items-center justify-center text-2xl font-black shadow-lg mb-2">
                  🥉
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-700/20 text-amber-300 border border-amber-600/30 mb-2">
                  HẠNG 3 • QUÝ QUÂN
                </span>
                <h3 className="text-headline-sm font-black text-on-surface line-clamp-1 mb-0.5">
                  {top3.name}
                </h3>
                <span className="text-body-xs text-on-surface-variant font-medium mb-3">
                  {top3.schoolOrRole}
                </span>

                <div className="w-full bg-surface-container-lowest/80 rounded-xl p-2.5 flex items-center justify-around border border-white/5 text-center">
                  <div>
                    <span className="text-[9px] uppercase text-on-surface-variant block">Độ chính xác</span>
                    <span className="text-headline-xs font-black text-tertiary">
                      {top3.correctCount}/{top3.totalQuestions}
                    </span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div>
                    <span className="text-[9px] uppercase text-on-surface-variant block">Thời gian</span>
                    <span className="text-headline-xs font-black text-amber-300 font-mono">
                      {top3.totalDurationSec}s
                    </span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div>
                    <span className="text-[9px] uppercase text-on-surface-variant block">Điểm số</span>
                    <span className="text-headline-xs font-black text-on-surface">
                      {top3.score} pts
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 p-6 flex flex-col items-center justify-center text-center opacity-60 min-h-[220px]">
                <span className="text-3xl mb-2">🥉</span>
                <span className="text-label-caps text-on-surface-variant uppercase text-[11px]">Đang chờ Quý Quân</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BẢNG XẾP HẠNG CHI TIẾT TOÀN DIỆN */}
      <div className="rounded-2xl bg-surface-container-low/95 border border-white/10 shadow-xl overflow-hidden">
        <div className="p-3 sm:p-4 bg-surface-container-high/60 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-tertiary">format_list_numbered</span>
            <h3 className="text-headline-xs font-bold text-on-surface uppercase">
              Danh Sách Đấu Thủ Toàn Trận ({sortedList.length})
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
                <th className="py-2.5 px-3 sm:px-4 text-center w-14 sm:w-16">Hạng</th>
                <th className="py-2.5 px-3 sm:px-4">Thầy Cô / Đội Thi</th>
                <th className="py-2.5 px-3 sm:px-4 text-center hidden sm:table-cell">Chế độ</th>
                <th className="py-2.5 px-3 sm:px-4 text-center">Số câu đúng</th>
                <th className="py-2.5 px-3 sm:px-4 text-center">Thời gian</th>
                <th className="py-2.5 px-3 sm:px-4 text-right">Điểm số</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-on-surface-variant text-body-sm">
                    Chưa có lượt chơi nào. Kết quả sẽ tự động hiển thị sau khi người chơi đầu tiên hoàn thành trận đấu!
                  </td>
                </tr>
              ) : (
                sortedList.map((entry, idx) => {
                  const rank = idx + 1;
                  const isCurrent = entry.id === currentSessionId;

                  return (
                    <tr
                      key={entry.id}
                      className={`transition-colors ${
                        isCurrent
                          ? 'bg-tertiary/15 font-bold border-l-4 border-l-tertiary'
                          : rank <= 3
                          ? 'hover:bg-surface-container-high/50'
                          : 'hover:bg-surface-container/30'
                      }`}
                    >
                      {/* Cột Hạng */}
                      <td className="py-2.5 px-3 sm:px-4 text-center">
                        {rank === 1 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-amber-950 font-black text-sm shadow">
                            🥇
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-900 font-black text-sm shadow">
                            🥈
                          </span>
                        ) : rank === 3 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700 text-amber-100 font-black text-sm shadow">
                            🥉
                          </span>
                        ) : (
                          <span className="text-on-surface-variant font-mono font-bold">
                            #{rank}
                          </span>
                        )}
                      </td>

                      {/* Cột Tên & Trường */}
                      <td className="py-2.5 px-3 sm:px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className={`font-bold ${isCurrent ? 'text-tertiary' : 'text-on-surface'}`}>
                              {entry.name}
                            </span>
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
      </div>
    </div>
  );
}
