import React, { useState, useEffect, useMemo } from 'react';
import {
  LeaderboardEntry,
  loadStoredEntries,
  saveStoredEntries,
  sortEntries,
  resolveEntryCharacter,
  getPageList,
  ITEMS_PER_PAGE,
  STORAGE_KEY,
} from './DashboardLeaderboard';
import {
  isSupabaseConfigured,
  fetchLeaderboardFromDb,
  clearLeaderboardInDb,
  subscribeLeaderboardChanges,
} from '../services/supabase';
import { MANABIE_LOGO } from '../data/brand';
import { TUG_QUESTIONS } from '../data/questions';
import { audio } from '../utils/audio';

interface HostDashboardPageProps {
  onNavigateToGame: () => void;
}

export function HostDashboardPage({ onNavigateToGame }: HostDashboardPageProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(() => loadStoredEntries());
  const [isDbConnected, setIsDbConnected] = useState<boolean>(() => isSupabaseConfigured());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>(() =>
    new Date().toLocaleTimeString('vi-VN')
  );

  // Search, Filters & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'ar' | 'mouse'>('all');
  const [perfFilter, setPerfFilter] = useState<'all' | 'perfect' | 'top10'>('all');
  const [sortOption, setSortOption] = useState<'rank' | 'time' | 'score' | 'latest'>('rank');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Cập nhật tiêu đề trang trên tab trình duyệt
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Host Dashboard · Đấu Trường Kéo Co AI | Manabie';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  // Tải dữ liệu từ Supabase hoặc LocalStorage
  const refreshData = async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const dbEntries = await fetchLeaderboardFromDb();
        if (dbEntries !== null) {
          setIsDbConnected(true);
          const sorted = sortEntries(dbEntries);
          setEntries(sorted);
          saveStoredEntries(sorted);
        } else {
          setIsDbConnected(false);
          setEntries(sortEntries(loadStoredEntries()));
        }
      } else {
        setIsDbConnected(false);
        setEntries(sortEntries(loadStoredEntries()));
      }
      setLastUpdated(new Date().toLocaleTimeString('vi-VN'));
    } catch (e) {
      console.warn('Lỗi làm mới dữ liệu Host:', e);
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  };

  // Khởi tạo và đăng ký Realtime Supabase
  useEffect(() => {
    refreshData(false);

    const unsubscribe = subscribeLeaderboardChanges(() => {
      // Khi có người chơi mới nộp bài, tự động cập nhật ngay lập tức
      refreshData(false);
    });

    // Định kỳ 15s kiểm tra làm mới nền một lần để đảm bảo luôn đồng bộ
    const interval = window.setInterval(() => {
      refreshData(false);
    }, 15000);

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      unsubscribe();
      clearInterval(interval);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    audio.playClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  // Xóa toàn bộ kết quả để bắt đầu lượt đấu mới
  const handleResetLeaderboard = async () => {
    audio.playClick();
    localStorage.removeItem(STORAGE_KEY);
    setEntries([]);
    setShowResetConfirm(false);
    await clearLeaderboardInDb();
    setLastUpdated(new Date().toLocaleTimeString('vi-VN'));
  };

  // Xuất file CSV báo cáo kết quả kèm UTF-8 BOM
  const handleExportCsv = () => {
    audio.playClick();
    if (entries.length === 0) {
      alert('Chưa có dữ liệu đấu thủ để xuất báo cáo.');
      return;
    }

    const headers = [
      'Hạng',
      'Tên Đấu Thủ',
      'Thông Tin / Đơn Vị',
      'Nhân Vật Đồng Hành',
      'Chế Độ Điều Khiển',
      'Số Câu Đúng',
      'Tổng Số Câu',
      'Tỷ Lệ Đúng (%)',
      'Thời Gian Hoàn Thành (giây)',
      'Chuỗi Thắng Kỷ Lục',
      'Điểm Số (pts)',
      'Thời Điểm Ghi Nhận',
    ];

    const sortedAll = sortEntries(entries);
    const rows = sortedAll.map((e, idx) => {
      const char = resolveEntryCharacter(e);
      const acc = Math.round((e.correctCount / Math.max(1, e.totalQuestions)) * 100);
      const dateStr = e.timestamp ? new Date(e.timestamp).toLocaleString('vi-VN') : '';
      return [
        idx + 1,
        `"${(e.name || '').replace(/"/g, '""')}"`,
        `"${(e.schoolOrRole || '').replace(/"/g, '""')}"`,
        `"${(e.characterName || char.name || '').replace(/"/g, '""')}"`,
        e.mode === 'ar' ? 'Camera AR' : 'Chuột',
        e.correctCount,
        e.totalQuestions,
        `${acc}%`,
        e.totalDurationSec,
        e.maxWinStreak || 0,
        e.score,
        `"${dateStr}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timeStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.setAttribute('href', url);
    link.setAttribute('download', `Manabie_Keo_Co_AI_Bao_Cao_${timeStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Danh sách Top 3 người chơi dẫn đầu
  const top3 = useMemo(() => {
    const sorted = sortEntries(entries);
    return {
      first: sorted[0] || null,
      second: sorted[1] || null,
      third: sorted[2] || null,
    };
  }, [entries]);

  // Bộ lọc và tìm kiếm
  const filteredList = useMemo(() => {
    let list = sortEntries(entries);

    // Tìm kiếm theo tên hoặc thông tin
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.schoolOrRole.toLowerCase().includes(q) ||
          (e.characterName && e.characterName.toLowerCase().includes(q))
      );
    }

    // Lọc theo chế độ
    if (modeFilter !== 'all') {
      list = list.filter((e) => e.mode === modeFilter);
    }

    // Lọc theo hiệu suất
    if (perfFilter === 'perfect') {
      list = list.filter((e) => e.correctCount === e.totalQuestions && e.totalQuestions > 0);
    } else if (perfFilter === 'top10') {
      list = list.slice(0, 10);
    }

    // Sắp xếp
    if (sortOption === 'time') {
      list.sort((a, b) => a.totalDurationSec - b.totalDurationSec);
    } else if (sortOption === 'score') {
      list.sort((a, b) => b.score - a.score);
    } else if (sortOption === 'latest') {
      list.sort((a, b) => b.timestamp - a.timestamp);
    } else {
      list = sortEntries(list);
    }

    return list;
  }, [entries, searchTerm, modeFilter, perfFilter, sortOption]);

  // Phân trang 20 người/trang
  const totalPages = Math.max(1, Math.ceil(filteredList.length / ITEMS_PER_PAGE));
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredList.length);
  const pagedList = filteredList.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-[#090d1a] text-on-surface flex flex-col selection:bg-primary selection:text-on-primary">
      {/* Nền phong cách Cyber Manabie */}
      <div className="fixed inset-0 pointer-events-none opacity-40 z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-tertiary/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[700px] h-[700px] bg-primary/10 rounded-full blur-[160px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      {/* HEADER QUẢN TRỊ TRUNG TÂM */}
      <header className="relative z-20 w-full bg-surface-container-lowest/90 backdrop-blur-2xl border-b border-white/10 px-4 sm:px-6 lg:px-8 py-3.5 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Logo & Tiêu đề */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative group shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-r from-tertiary via-primary to-emerald-400 rounded-xl blur opacity-70 group-hover:opacity-100 transition duration-300" />
              <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#11162b] border border-white/20 p-1 flex items-center justify-center">
                <img
                  src={MANABIE_LOGO}
                  alt="Manabie Logo"
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider border border-amber-400/30 flex items-center gap-1 shadow-sm">
                  <span className="material-symbols-outlined text-[13px] text-amber-400">admin_panel_settings</span>
                  <span>HOST • BAN TỔ CHỨC</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant font-mono">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isDbConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                    }`}
                  />
                  <span>
                    {isDbConnected ? 'Realtime Trực tuyến' : 'Bộ nhớ máy (Offline)'}
                  </span>
                </span>
              </div>
              <h1 className="text-base sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight truncate flex items-center gap-2 mt-0.5">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-tertiary">
                  ĐẤU TRƯỜNG KÉO CO CON NGƯỜI VS AI
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs text-on-surface-variant truncate font-semibold">
                BẢNG VINH DANH & TỔNG HỢP KẾT QUẢ • CHUYÊN ĐỀ 12 TIẾT AI
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Nút Làm mới */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                refreshData(true);
              }}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-highest text-on-surface text-xs font-bold border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Làm mới dữ liệu từ máy chủ"
            >
              <span
                className={`material-symbols-outlined text-[16px] text-tertiary ${
                  isLoading ? 'animate-spin' : ''
                }`}
              >
                refresh
              </span>
              <span className="hidden sm:inline">Làm mới</span>
              <span className="text-[10px] text-on-surface-variant font-mono">({lastUpdated})</span>
            </button>

            {/* Nút Xuất Excel/CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-highest text-emerald-300 text-xs font-bold border border-emerald-400/25 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Xuất danh sách ra file Excel / CSV"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Xuất Excel</span>
            </button>

            {/* Nút Xem Ngân hàng câu hỏi */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setShowQuestionsModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-highest text-secondary text-xs font-bold border border-secondary/25 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Xem 12 tình huống kéo co AI & Giải nghĩa sư phạm"
            >
              <span className="material-symbols-outlined text-[16px]">menu_book</span>
              <span className="hidden sm:inline">12 Câu Hỏi AI</span>
            </button>

            {/* Nút Toàn màn hình */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-surface-container hover:bg-surface-container-highest text-on-surface text-xs font-bold border border-white/10 flex items-center justify-center transition-all cursor-pointer"
              title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình chiếu LED'}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
              </span>
            </button>

            {/* Nút Về màn hình thi đấu Game */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                onNavigateToGame();
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 via-tertiary to-emerald-300 text-[#032117] text-xs sm:text-sm font-black uppercase tracking-wider shadow-[0_0_20px_rgba(23,219,229,0.4)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">sports_esports</span>
              <span>Vào Đấu Trường Game</span>
            </button>
          </div>
        </div>
      </header>

      {/* NỘI DUNG CHÍNH */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* ===================================================================
         * KHỐI 1: BỤC VINH DANH TOP 1 - 2 - 3 (GRAND STAGE PODIUM)
         * =================================================================== */}
        <section aria-label="Bục vinh danh Top 3" className="relative p-4 sm:p-6 rounded-3xl bg-gradient-to-b from-surface-container-high/60 via-surface-container/40 to-surface-container-lowest/80 border border-white/10 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-[26px]">military_tech</span>
              <div>
                <h2 className="text-base sm:text-xl font-black uppercase text-white tracking-wide">
                  BẢNG VINH DANH TOP 1 - 2 - 3
                </h2>
                <p className="text-[11px] sm:text-xs text-on-surface-variant">
                  Tiêu chí xếp hạng: Số câu đúng nhiều nhất → Thời gian hoàn thành nhanh nhất → Điểm số
                </p>
              </div>
            </div>

            {/* Nút đặt lại BXH dành riêng cho Admin */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setShowResetConfirm(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-error/15 hover:bg-error/25 text-error border border-error/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Đặt lại toàn bộ Bảng xếp hạng trước giờ G"
            >
              <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              <span className="hidden sm:inline">Đặt lại BXH</span>
            </button>
          </div>

          {/* 3 Cột Bục Vinh Danh */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-2">
            {/* TOP 2 - Á QUÂN (BÊN TRÁI) */}
            <div className="order-2 md:order-1 flex flex-col items-center">
              {top3.second ? (
                <div className="w-full flex flex-col items-center p-4 rounded-2xl bg-gradient-to-t from-slate-400/15 via-surface-container to-surface-container-high border-2 border-slate-300/40 shadow-xl relative group hover:border-slate-300 transition-all">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-400 text-slate-900 font-black text-base shadow mb-2">
                    🥈
                  </span>
                  <div className="relative w-16 h-16 rounded-2xl bg-[#1a1c2e] border-2 border-slate-300/50 p-1 mb-2 shadow-[0_0_20px_rgba(203,213,225,0.3)]">
                    <img
                      src={top3.second.characterImage || resolveEntryCharacter(top3.second).image}
                      alt={top3.second.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-300/20 text-slate-200 font-black text-[9px] uppercase mb-1">
                    Á QUÂN • TOP 2
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-white text-center truncate max-w-[200px]">
                    {top3.second.name}
                  </h3>
                  <span className="text-[11px] text-on-surface-variant text-center truncate max-w-[200px] mb-2">
                    {top3.second.characterName || resolveEntryCharacter(top3.second).name}
                  </span>
                  <div className="w-full grid grid-cols-3 gap-1 pt-2 border-t border-white/10 text-center font-mono text-xs">
                    <div>
                      <span className="text-[9px] text-on-surface-variant block">ĐÚNG</span>
                      <strong className="text-emerald-400 font-black">{top3.second.correctCount}/{top3.second.totalQuestions}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-on-surface-variant block">THỜI GIAN</span>
                      <strong className="text-amber-300 font-black">{top3.second.totalDurationSec}s</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-on-surface-variant block">ĐIỂM</span>
                      <strong className="text-white font-black">{top3.second.score}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-48 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-4 text-center text-on-surface-variant/60">
                  <span className="text-2xl mb-1">🥈</span>
                  <span className="text-xs font-bold uppercase">Chờ Á Quân</span>
                </div>
              )}
            </div>

            {/* TOP 1 - QUÁN QUÂN (Ở GIỮA - NỔI BẬT NHẤT) */}
            <div className="order-1 md:order-2 flex flex-col items-center -mt-2">
              {top3.first ? (
                <div className="w-full flex flex-col items-center p-5 rounded-3xl bg-gradient-to-t from-amber-500/25 via-surface-container to-surface-container-high border-2 border-amber-400 shadow-[0_0_50px_rgba(251,191,36,0.3)] relative group hover:scale-[1.02] transition-all">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 font-black text-[10px] uppercase shadow-lg flex items-center gap-1">
                    <span>👑 QUÁN QUÂN ĐẤU TRƯỜNG</span>
                  </div>

                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-200 text-amber-950 font-black text-xl shadow mb-2 mt-2">
                    🥇
                  </span>

                  <div className="relative w-20 h-20 rounded-2xl bg-[#241a05] border-2 border-amber-400 p-1.5 mb-2 shadow-[0_0_30px_rgba(251,191,36,0.6)]">
                    <img
                      src={top3.first.characterImage || resolveEntryCharacter(top3.first).image}
                      alt={top3.first.name}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-amber-950 font-black text-[10px] flex items-center justify-center border border-white shadow">
                      #1
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-amber-300 text-center truncate max-w-[220px]">
                    {top3.first.name}
                  </h3>
                  <span className="text-xs text-amber-200/80 text-center truncate max-w-[220px] mb-2 font-medium">
                    {top3.first.characterName || resolveEntryCharacter(top3.first).name}
                  </span>

                  <div className="w-full grid grid-cols-3 gap-1 pt-2.5 border-t border-amber-400/30 text-center font-mono text-xs">
                    <div>
                      <span className="text-[9.5px] text-on-surface-variant block font-sans">ĐÚNG</span>
                      <strong className="text-emerald-400 font-black text-sm">{top3.first.correctCount}/{top3.first.totalQuestions}</strong>
                    </div>
                    <div>
                      <span className="text-[9.5px] text-on-surface-variant block font-sans">THỜI GIAN</span>
                      <strong className="text-amber-300 font-black text-sm">{top3.first.totalDurationSec}s</strong>
                    </div>
                    <div>
                      <span className="text-[9.5px] text-on-surface-variant block font-sans">ĐIỂM SỐ</span>
                      <strong className="text-white font-black text-sm">{top3.first.score} pts</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-56 rounded-3xl border-2 border-dashed border-amber-400/30 flex flex-col items-center justify-center p-4 text-center text-amber-200/60">
                  <span className="text-3xl mb-1">👑</span>
                  <span className="text-sm font-black uppercase text-amber-300">Chờ Đón Quán Quân</span>
                  <p className="text-[11px] text-on-surface-variant max-w-[200px] mt-1">
                    Bắt đầu trận đấu để ghi tên đấu thủ đầu tiên lên đỉnh vinh quang!
                  </p>
                </div>
              )}
            </div>

            {/* TOP 3 - QUÝ QUÂN (BÊN PHẢI) */}
            <div className="order-3 flex flex-col items-center">
              {top3.third ? (
                <div className="w-full flex flex-col items-center p-4 rounded-2xl bg-gradient-to-t from-amber-800/20 via-surface-container to-surface-container-high border-2 border-amber-700/50 shadow-xl relative group hover:border-amber-600 transition-all">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-800 text-amber-100 font-black text-base shadow mb-2">
                    🥉
                  </span>
                  <div className="relative w-16 h-16 rounded-2xl bg-[#26150a] border-2 border-amber-700/60 p-1 mb-2 shadow-[0_0_20px_rgba(217,119,6,0.3)]">
                    <img
                      src={top3.third.characterImage || resolveEntryCharacter(top3.third).image}
                      alt={top3.third.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-700/25 text-amber-300 font-black text-[9px] uppercase mb-1">
                    QUÝ QUÂN • TOP 3
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-white text-center truncate max-w-[200px]">
                    {top3.third.name}
                  </h3>
                  <span className="text-[11px] text-on-surface-variant text-center truncate max-w-[200px] mb-2">
                    {top3.third.characterName || resolveEntryCharacter(top3.third).name}
                  </span>
                  <div className="w-full grid grid-cols-3 gap-1 pt-2 border-t border-white/10 text-center font-mono text-xs">
                    <div>
                      <span className="text-[9px] text-on-surface-variant block">ĐÚNG</span>
                      <strong className="text-emerald-400 font-black">{top3.third.correctCount}/{top3.third.totalQuestions}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-on-surface-variant block">THỜI GIAN</span>
                      <strong className="text-amber-300 font-black">{top3.third.totalDurationSec}s</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-on-surface-variant block">ĐIỂM</span>
                      <strong className="text-white font-black">{top3.third.score}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-48 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-4 text-center text-on-surface-variant/60">
                  <span className="text-2xl mb-1">🥉</span>
                  <span className="text-xs font-bold uppercase">Chờ Quý Quân</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ===================================================================
         * KHỐI 3: BẢNG DANH SÁCH CHI TIẾT (TÌM KIẾM, LỌC & PHÂN TRANG 20 NGƯỜI)
         * =================================================================== */}
        <section aria-label="Bảng dữ liệu chi tiết" className="rounded-3xl bg-surface-container-low/95 border border-white/10 shadow-2xl overflow-hidden flex flex-col">
          {/* Thanh công cụ tìm kiếm và bộ lọc */}
          <div className="p-4 sm:p-5 bg-surface-container-high/60 border-b border-white/10 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px] text-tertiary">table_rows</span>
              <div>
                <h3 className="text-sm sm:text-base font-black text-white uppercase">
                  DANH SÁCH TOÀN BỘ ĐẤU THỦ ({filteredList.length}/{entries.length})
                </h3>
                <span className="text-[11px] text-on-surface-variant">
                  Hiển thị giới hạn 20 người mỗi trang theo tiêu chuẩn sự kiện
                </span>
              </div>
            </div>

            {/* Bộ điều khiển lọc & tìm kiếm */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ô tìm kiếm */}
              <div className="relative flex-1 sm:w-60">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant pointer-events-none">
                  search
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Tìm tên đấu thủ..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-surface-container-lowest border border-white/15 text-white placeholder:text-on-surface-variant/50 focus:outline-none focus:border-tertiary"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Lọc chế độ */}
              <select
                value={modeFilter}
                onChange={(e) => {
                  setModeFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 text-xs rounded-xl bg-surface-container-lowest border border-white/15 text-on-surface focus:outline-none focus:border-tertiary cursor-pointer font-bold"
              >
                <option value="all">Tất cả chế độ</option>
                <option value="ar">Chỉ Camera AR</option>
                <option value="mouse">Chỉ Chuột</option>
              </select>

              {/* Lọc thành tích */}
              <select
                value={perfFilter}
                onChange={(e) => {
                  setPerfFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 text-xs rounded-xl bg-surface-container-lowest border border-white/15 text-on-surface focus:outline-none focus:border-tertiary cursor-pointer font-bold"
              >
                <option value="all">Tất cả thành tích</option>
                <option value="perfect">Đạt 100% đúng</option>
                <option value="top10">Top 10 cao nhất</option>
              </select>

              {/* Sắp xếp */}
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="px-3 py-1.5 text-xs rounded-xl bg-surface-container-lowest border border-white/15 text-tertiary focus:outline-none focus:border-tertiary cursor-pointer font-bold"
              >
                <option value="rank">Sắp xếp: Thứ hạng chuẩn</option>
                <option value="time">Sắp xếp: Nhanh nhất</option>
                <option value="score">Sắp xếp: Điểm cao nhất</option>
                <option value="latest">Sắp xếp: Mới nhất</option>
              </select>
            </div>
          </div>

          {/* Bảng dữ liệu */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 text-label-kicker text-on-surface-variant uppercase bg-surface-container/60 text-[10.5px]">
                  <th className="py-3 px-3 sm:px-4 text-center w-16 sm:w-20">Hạng</th>
                  <th className="py-3 px-3 sm:px-4">Đấu Thủ & Bạn Đồng Hành</th>
                  <th className="py-3 px-3 sm:px-4 text-center">Chế độ</th>
                  <th className="py-3 px-3 sm:px-4 text-center">Số câu đúng</th>
                  <th className="py-3 px-3 sm:px-4 text-center">Thời gian</th>
                  <th className="py-3 px-3 sm:px-4 text-center hidden md:table-cell">Chuỗi thắng</th>
                  <th className="py-3 px-3 sm:px-4 text-right">Điểm số</th>
                  <th className="py-3 px-3 sm:px-4 text-center hidden lg:table-cell">Thời điểm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pagedList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-on-surface-variant text-sm">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[32px] text-on-surface-variant/40">
                          inbox
                        </span>
                        <span>Không tìm thấy đấu thủ nào phù hợp với bộ lọc hiện tại.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedList.map((entry, idx) => {
                    const rank = startIndex + idx + 1;
                    const char = resolveEntryCharacter(entry);
                    const accuracy = Math.round(
                      (entry.correctCount / Math.max(1, entry.totalQuestions)) * 100
                    );

                    return (
                      <tr
                        key={entry.id}
                        className={`transition-colors hover:bg-surface-container/40 ${
                          rank === 1
                            ? 'bg-amber-500/10'
                            : rank === 2
                            ? 'bg-slate-300/10'
                            : rank === 3
                            ? 'bg-amber-700/10'
                            : ''
                        }`}
                      >
                        {/* Cột Thứ hạng */}
                        <td className="py-3 px-3 sm:px-4 text-center">
                          {rank === 1 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-200 text-amber-950 font-black text-sm shadow">
                              🥇
                            </span>
                          ) : rank === 2 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr from-slate-200 to-slate-400 text-slate-900 font-black text-sm shadow">
                              🥈
                            </span>
                          ) : rank === 3 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr from-amber-600 to-amber-800 text-amber-100 font-black text-sm shadow">
                              🥉
                            </span>
                          ) : (
                            <span className="font-mono font-bold text-on-surface-variant">
                              #{rank}
                            </span>
                          )}
                        </td>

                        {/* Cột Đấu thủ & Nhân vật */}
                        <td className="py-3 px-3 sm:px-4">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={entry.characterImage || char.image}
                              alt={entry.characterName || char.name}
                              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain bg-[#190f38] border border-white/15 p-0.5 shrink-0 shadow-sm"
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-black text-white text-xs sm:text-sm truncate">
                                  {entry.name}
                                </span>
                                {rank <= 3 && (
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase bg-amber-400/25 text-amber-300 border border-amber-400/40">
                                    TOP {rank}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10.5px] text-emerald-300 truncate">
                                {entry.characterName || char.name}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Cột Chế độ chơi */}
                        <td className="py-3 px-3 sm:px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              entry.mode === 'ar'
                                ? 'bg-tertiary/15 text-tertiary border border-tertiary/30'
                                : 'bg-surface-container text-secondary border border-white/10'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {entry.mode === 'ar' ? 'videocam' : 'mouse'}
                            </span>
                            <span>{entry.mode === 'ar' ? 'Camera AR' : 'Chuột'}</span>
                          </span>
                        </td>

                        {/* Cột Số câu đúng */}
                        <td className="py-3 px-3 sm:px-4 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="font-mono font-black text-emerald-400">
                              {entry.correctCount}/{entry.totalQuestions}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              ({accuracy}%)
                            </span>
                          </div>
                        </td>

                        {/* Cột Thời gian hoàn thành */}
                        <td className="py-3 px-3 sm:px-4 text-center font-mono font-bold text-amber-300">
                          {entry.totalDurationSec}s
                        </td>

                        {/* Cột Chuỗi thắng */}
                        <td className="py-3 px-3 sm:px-4 text-center font-mono font-bold text-red-400 hidden md:table-cell">
                          {(entry.maxWinStreak || 0) > 0 ? `🔥 x${entry.maxWinStreak}` : '—'}
                        </td>

                        {/* Cột Điểm số */}
                        <td className="py-3 px-3 sm:px-4 text-right font-mono font-black text-white text-sm">
                          {entry.score} pts
                        </td>

                        {/* Cột Thời điểm thi */}
                        <td className="py-3 px-3 sm:px-4 text-center text-[10.5px] text-on-surface-variant font-mono hidden lg:table-cell">
                          {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('vi-VN') : '—'}
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
            <div className="p-3.5 sm:p-4 bg-surface-container-high/40 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 select-none">
              {/* Thống kê phạm vi */}
              <div className="text-xs text-on-surface-variant font-medium flex items-center gap-1.5 flex-wrap justify-center sm:justify-start">
                <span>Hiển thị</span>
                <strong className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">
                  {startIndex + 1}–{endIndex}
                </strong>
                <span>trên tổng số</span>
                <strong className="text-tertiary font-mono">{filteredList.length}</strong>
                <span>đấu thủ • Trang <strong className="text-white font-mono">{currentPage}</strong> / {totalPages}</span>
              </div>

              {/* Dãy số trang: 1, 2, 3... */}
              <div className="flex items-center gap-1 flex-wrap justify-center">
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
                      {pageNum}
                    </button>
                  );
                })}

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
        </section>
      </main>

      {/* FOOTER TRANG HOST */}
      <footer className="relative z-10 w-full bg-surface-container-lowest/90 border-t border-white/10 py-3 text-center text-xs text-on-surface-variant">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Manabie AI EdTech Platform • Chuyên đề 12 Tiết AI Cốt Lõi 2026</span>
          <span className="text-[11px] font-mono text-tertiary">
            Đường dẫn Quản trị: <strong>/host</strong>
          </span>
        </div>
      </footer>

      {/* ===================================================================
       * MODAL 1: XÁC NHẬN RESET TOÀN BỘ BẢNG XẾP HẠNG
       * =================================================================== */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-container-high border-2 border-error/50 p-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-error mb-3">
              <span className="material-symbols-outlined text-[32px]">warning</span>
              <h3 className="text-lg font-black uppercase text-white">XÁC NHẬN ĐẶT LẠI BXH</h3>
            </div>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed mb-4">
              Thao tác này sẽ <strong className="text-error">xóa toàn bộ danh sách điểm số và đấu thủ</strong> trên cả trình duyệt hiện tại và máy chủ PostgreSQL.
              Dữ liệu sau khi xóa sẽ không thể phục hồi. Bạn có chắc chắn muốn thực hiện?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-highest text-on-surface text-xs font-bold border border-white/10 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleResetLeaderboard}
                className="px-4 py-2 rounded-xl bg-error hover:bg-error-container text-white text-xs font-black uppercase cursor-pointer transition-colors shadow-lg"
              >
                Xác nhận Xóa Hết
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
       * MODAL 2: NGÂN HÀNG 12 CÂU HỎI & GIẢI NGHĨA SƯ PHẠM
       * =================================================================== */}
      {showQuestionsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none"
          onClick={() => setShowQuestionsModal(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] rounded-3xl bg-surface-container-high border border-tertiary/40 p-4 sm:p-6 shadow-2xl flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-tertiary">
                <span className="material-symbols-outlined text-[24px]">school</span>
                <h3 className="text-base sm:text-lg font-black text-white uppercase">
                  NGÂN HÀNG 12 CÂU HỎI KÉO CO & GIẢI NGHĨA SƯ PHẠM
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuestionsModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-highest text-white flex items-center justify-center cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
              {TUG_QUESTIONS.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-3.5 rounded-2xl bg-surface-container-lowest/80 border border-white/10 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-black uppercase text-tertiary">
                      CÂU {idx + 1}: {q.toolName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        q.hasAI
                          ? 'bg-tertiary/20 text-tertiary border border-tertiary/40'
                          : 'bg-secondary-container/40 text-secondary border border-secondary/40'
                      }`}
                    >
                      {q.hasAI ? '👉 CÓ SỬ DỤNG AI' : '👈 KHÔNG CÓ AI'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                    {q.question}
                  </p>
                  <div className="mt-1 p-2 rounded-xl bg-white/5 border border-white/5 text-[11px] text-on-surface-variant flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-tertiary shrink-0 mt-0.5">
                      lightbulb
                    </span>
                    <span>
                      <strong className="text-tertiary">Giải nghĩa sư phạm:</strong> {q.insight}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowQuestionsModal(false)}
                className="px-5 py-2 rounded-xl bg-tertiary text-[#032117] text-xs font-black uppercase cursor-pointer hover:brightness-110"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
