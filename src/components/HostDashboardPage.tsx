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
  deleteLeaderboardEntriesInDb,
  subscribeLeaderboardChanges,
} from '../services/supabase';
import { MANABIE_LOGO } from '../data/brand';
import { TUG_QUESTIONS } from '../data/questions';
import { audio } from '../utils/audio';

/**
 * Chuyển timestamp (ms) thành định dạng ngày YYYY-MM-DD theo múi giờ địa phương
 */
export function getDateKey(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Lấy key ngày hôm nay theo YYYY-MM-DD
 */
export function getTodayDateKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format dateKey YYYY-MM-DD sang tiếng Việt dạng "DD/MM/YYYY"
 */
export function formatDisplayDate(dateKey: string): string {
  if (!dateKey) return '';
  const parts = dateKey.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateKey;
}

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

  // Bộ lọc theo ngày tập huấn ('all' = tất cả các ngày, hoặc 'YYYY-MM-DD')
  const [selectedDate, setSelectedDate] = useState<string>('all');

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

  // Cập nhật tiêu đề trang trên tab trình duyệt và kích hoạt cuộn trang tự nhiên trên máy tính
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Host Dashboard · Đấu Trường Kéo Co AI | Manabie';

    // Mở khóa scroll trên html, body, #root cho máy tính
    document.documentElement.classList.add('host-scroll-enabled');
    document.body.classList.add('host-scroll-enabled');
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.classList.add('host-scroll-enabled');
    }

    return () => {
      document.title = prevTitle;
      document.documentElement.classList.remove('host-scroll-enabled');
      document.body.classList.remove('host-scroll-enabled');
      if (rootEl) {
        rootEl.classList.remove('host-scroll-enabled');
      }
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

  // Thông tin ngày hôm nay và danh sách các ngày tập huấn có dữ liệu
  const todayKey = getTodayDateKey();

  const availableDates = useMemo(() => {
    const countMap = new Map<string, number>();
    entries.forEach((e) => {
      const key = getDateKey(e.timestamp);
      if (key) {
        countMap.set(key, (countMap.get(key) || 0) + 1);
      }
    });
    // Sắp xếp ngày mới nhất lên đầu
    return Array.from(countMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const todayCount = useMemo(() => {
    return entries.filter((e) => getDateKey(e.timestamp) === todayKey).length;
  }, [entries, todayKey]);

  // Danh sách dữ liệu sau khi lọc theo ngày được chọn
  const dateFilteredEntries = useMemo(() => {
    if (selectedDate === 'all') {
      return entries;
    }
    return entries.filter((e) => getDateKey(e.timestamp) === selectedDate);
  }, [entries, selectedDate]);

  // Đổi ngày thì tự động quay về trang 1
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate]);

  // Xóa chỉ dữ liệu của ngày đang được chọn
  const handleResetSelectedDate = async () => {
    audio.playClick();
    if (selectedDate === 'all') {
      return handleResetAll();
    }
    const toDelete = entries.filter((e) => getDateKey(e.timestamp) === selectedDate);
    const remaining = entries.filter((e) => getDateKey(e.timestamp) !== selectedDate);
    setEntries(remaining);
    saveStoredEntries(remaining);
    setShowResetConfirm(false);
    if (toDelete.length > 0) {
      await deleteLeaderboardEntriesInDb(toDelete.map((e) => e.id));
    }
    setLastUpdated(new Date().toLocaleTimeString('vi-VN'));
  };

  // Xóa toàn bộ kết quả tất cả các ngày
  const handleResetAll = async () => {
    audio.playClick();
    localStorage.removeItem(STORAGE_KEY);
    setEntries([]);
    setShowResetConfirm(false);
    await clearLeaderboardInDb();
    setLastUpdated(new Date().toLocaleTimeString('vi-VN'));
  };

  // Xuất file CSV báo cáo kết quả kèm UTF-8 BOM cho ngày đang chọn
  const handleExportCsv = () => {
    audio.playClick();
    if (dateFilteredEntries.length === 0) {
      alert('Chưa có dữ liệu đấu thủ trong ngày đã chọn để xuất báo cáo.');
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

    const sortedAll = sortEntries(dateFilteredEntries);
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
    const dateSuffix = selectedDate === 'all' ? 'Tat_Ca_Cac_Ngay' : `Ngay_${selectedDate}`;
    link.setAttribute('href', url);
    link.setAttribute('download', `Manabie_Keo_Co_AI_Bao_Cao_${dateSuffix}_${timeStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Danh sách Top 3 người chơi dẫn đầu theo ngày đang chọn
  const top3 = useMemo(() => {
    const sorted = sortEntries(dateFilteredEntries);
    return {
      first: sorted[0] || null,
      second: sorted[1] || null,
      third: sorted[2] || null,
    };
  }, [dateFilteredEntries]);

  // Bộ lọc và tìm kiếm trên danh sách ngày đang chọn
  const filteredList = useMemo(() => {
    let list = sortEntries(dateFilteredEntries);

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
  }, [dateFilteredEntries, searchTerm, modeFilter, perfFilter, sortOption]);

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
    <div
      id="host-dashboard-page"
      className="min-h-screen w-full bg-[#f1f5f9] text-[#1e293b] flex flex-col font-sans pb-12 select-text"
    >
      {/* HEADER QUẢN TRỊ TRUNG TÂM */}
      <header className="relative z-20 w-full mana-header-royal px-4 sm:px-6 lg:px-8 py-3.5 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Logo & Tiêu đề */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative group shrink-0">
              <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white border-2 border-[#c7dcff] p-1 flex items-center justify-center shadow-md">
                <img
                  src={MANABIE_LOGO}
                  alt="Manabie Logo"
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400/25 text-amber-200 mana-keep-white text-[10px] font-black uppercase tracking-wider border border-amber-300/40 flex items-center gap-1 shadow-sm">
                  <span className="material-symbols-outlined text-[13px] text-amber-300 mana-keep-white">admin_panel_settings</span>
                  <span>HOST • BAN TỔ CHỨC</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-blue-100 mana-keep-white font-mono">
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
              <h1 className="text-base sm:text-xl md:text-2xl font-black text-white mana-keep-white uppercase tracking-tight truncate flex items-center gap-2 mt-0.5">
                <span className="text-white mana-keep-white">
                  ĐẤU TRƯỜNG KÉO CO CON NGƯỜI VS AI
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs text-blue-100/90 mana-keep-white truncate font-semibold">
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
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white mana-keep-white text-xs font-bold border border-white/25 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Làm mới dữ liệu từ máy chủ"
            >
              <span
                className={`material-symbols-outlined text-[16px] text-amber-300 mana-keep-white ${
                  isLoading ? 'animate-spin' : ''
                }`}
              >
                refresh
              </span>
              <span className="hidden sm:inline">Làm mới</span>
              <span className="text-[10px] text-blue-100 mana-keep-white font-mono">({lastUpdated})</span>
            </button>

            {/* Nút Xuất Excel/CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-xl btn-mana-green text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
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
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white mana-keep-white text-xs font-bold border border-white/25 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Xem 12 tình huống kéo co AI & Giải nghĩa sư phạm"
            >
              <span className="material-symbols-outlined text-[16px]">menu_book</span>
              <span className="hidden sm:inline">12 Câu Hỏi AI</span>
            </button>

            {/* Nút Toàn màn hình */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white mana-keep-white text-xs font-bold border border-white/25 flex items-center justify-center transition-all cursor-pointer"
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
              className="px-4 py-2 rounded-xl btn-mana-orange text-xs sm:text-sm font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
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
         * KHỐI ĐIỀU KHIỂN: THEO DÕI THEO NGÀY TẬP HUẤN (WORKSHOP DATE TRACKER)
         * =================================================================== */}
        <section
          aria-label="Bộ lọc ngày tập huấn"
          className="relative p-3.5 sm:p-4 rounded-2xl bg-white border-2 border-[#bfdbfe] shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3"
        >
          {/* Thông tin ngày đang chọn */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#ebf9f1] border-2 border-[#86efac] flex items-center justify-center shrink-0 text-[#15803d] shadow-xs">
              <span className="material-symbols-outlined text-[22px]">calendar_month</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-xs font-black uppercase text-[#1b3a8a] tracking-wide"
                  style={{ color: '#1b3a8a' }}
                >
                  THEO DÕI THEO BUỔI TẬP HUẤN
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-black bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]">
                  {selectedDate === 'all'
                    ? '🌐 Tất cả các ngày'
                    : selectedDate === todayKey
                    ? `📅 Hôm nay (${formatDisplayDate(todayKey)})`
                    : `📅 Ngày ${formatDisplayDate(selectedDate)}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate font-medium">
                Đang hiển thị <strong className="text-[#1b3a8a] font-mono font-black">{dateFilteredEntries.length}</strong> đấu thủ
                {selectedDate !== 'all'
                  ? ` trong buổi tập huấn ngày ${formatDisplayDate(selectedDate)}`
                  : ' qua toàn bộ các buổi tập huấn'}
              </p>
            </div>
          </div>

          {/* Các nút bấm chọn nhanh, Dropdown và Date Picker */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Nút 1: Tất cả các ngày */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setSelectedDate('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-2 shadow-xs ${
                selectedDate === 'all'
                  ? 'btn-mana-blue text-white border-[#1d4ed8]'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title="Xem bảng xếp hạng tổng hợp tất cả các ngày"
            >
              <span className="material-symbols-outlined text-[16px]">public</span>
              <span>Tất cả</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  selectedDate === 'all' ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {entries.length}
              </span>
            </button>

            {/* Nút 2: Hôm nay */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setSelectedDate(todayKey);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-2 shadow-xs ${
                selectedDate === todayKey
                  ? 'btn-mana-orange text-white border-[#c2410c]'
                  : 'bg-white hover:bg-orange-50 text-[#c2410c] border-orange-300'
              }`}
              title="Xem bảng xếp hạng buổi tập huấn hôm nay"
            >
              <span className="material-symbols-outlined text-[16px] text-orange-600">today</span>
              <span className="font-bold text-[#c2410c]">Hôm nay</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  selectedDate === todayKey ? 'bg-black/20 text-white' : 'bg-orange-100 text-orange-900'
                }`}
              >
                {todayCount}
              </span>
            </button>

            {/* Dropdown danh sách các ngày có dữ liệu */}
            {availableDates.length > 0 && (
              <select
                value={selectedDate}
                onChange={(e) => {
                  audio.playClick();
                  setSelectedDate(e.target.value);
                }}
                className="px-2.5 py-1.5 text-xs rounded-xl bg-white border-2 border-slate-300 text-slate-800 focus:outline-none focus:border-[#2563eb] cursor-pointer font-bold shadow-xs"
                title="Chọn ngày từ danh sách các buổi tập huấn trước"
              >
                <option value="all">-- Chọn buổi tập huấn --</option>
                {availableDates.map(([dKey, cnt]) => (
                  <option key={dKey} value={dKey}>
                    {dKey === todayKey ? '★ Hôm nay: ' : ''}Ngày {formatDisplayDate(dKey)} ({cnt} đấu thủ)
                  </option>
                ))}
              </select>
            )}

            {/* Date Picker thủ công */}
            <input
              type="date"
              value={selectedDate !== 'all' ? selectedDate : ''}
              onChange={(e) => {
                if (e.target.value) {
                  audio.playClick();
                  setSelectedDate(e.target.value);
                }
              }}
              title="Chọn ngày cụ thể từ lịch"
              className="px-2.5 py-1.5 text-xs rounded-xl bg-white border-2 border-slate-300 text-slate-800 focus:outline-none focus:border-[#2563eb] cursor-pointer font-mono font-bold shadow-xs"
            />
          </div>
        </section>

        {/* ===================================================================
         * KHỐI 1: BỤC VINH DANH TOP 1 - 2 - 3 (GRAND STAGE PODIUM)
         * =================================================================== */}
        <section aria-label="Bục vinh danh Top 3" className="relative p-4 sm:p-6 rounded-3xl bg-white border-2 border-[#bfdbfe] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-[28px]">military_tech</span>
              <div>
                <h2
                  className="text-base sm:text-xl font-black uppercase text-[#1b3a8a] tracking-wide flex items-center gap-2 flex-wrap"
                  style={{ color: '#1b3a8a' }}
                >
                  <span>BẢNG VINH DANH TOP 1 - 2 - 3</span>
                  <span className="text-xs sm:text-sm font-bold text-[#2563eb] normal-case bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                    {selectedDate === 'all'
                      ? '• Toàn bộ thời gian'
                      : selectedDate === todayKey
                      ? `• Hôm nay (${formatDisplayDate(todayKey)})`
                      : `• Buổi ngày ${formatDisplayDate(selectedDate)}`}
                  </span>
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
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
              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#be123c] border-2 border-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title={selectedDate !== 'all' ? `Đặt lại kết quả ngày ${formatDisplayDate(selectedDate)}` : 'Đặt lại toàn bộ Bảng xếp hạng'}
            >
              <span className="material-symbols-outlined text-[16px] text-rose-600">delete_sweep</span>
              <span className="hidden sm:inline font-bold text-[#be123c]">Đặt lại BXH</span>
            </button>
          </div>

          {/* 3 Cột Bục Vinh Danh */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-2">
            {/* TOP 2 - Á QUÂN (BÊN TRÁI) */}
            <div className="order-2 md:order-1 flex flex-col items-center">
              {top3.second ? (
                <div className="w-full flex flex-col items-center p-4 rounded-2xl bg-gradient-to-t from-slate-100 via-white to-slate-50 border-2 border-slate-300 shadow-[0_5px_0_#94a3b8] relative group hover:border-slate-400 transition-all">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 text-slate-800 font-black text-base shadow mb-2">
                    🥈
                  </span>
                  <div className="relative w-16 h-16 rounded-2xl bg-[#eff6ff] border-2 border-slate-300 p-1 mb-2 shadow-sm">
                    <img
                      src={top3.second.characterImage || resolveEntryCharacter(top3.second).image}
                      alt={top3.second.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-black text-[9px] uppercase mb-1">
                    Á QUÂN • TOP 2
                  </span>
                  <h3
                    className="text-sm sm:text-base font-black text-slate-900 text-center truncate max-w-[200px]"
                    style={{ color: '#0f172a' }}
                  >
                    {top3.second.name}
                  </h3>
                  <span
                    className="text-[11px] text-[#1e3a8a] font-bold text-center truncate max-w-[200px] mb-2"
                    style={{ color: '#1e3a8a' }}
                  >
                    {top3.second.characterName || resolveEntryCharacter(top3.second).name}
                  </span>
                  <div className="w-full grid grid-cols-3 gap-1 pt-2 border-t-2 border-slate-100 text-center font-mono text-xs">
                    <div>
                      <span className="text-[9px] text-slate-500 font-sans font-bold block">ĐÚNG</span>
                      <strong className="text-[#15803d] font-black">{top3.second.correctCount}/{top3.second.totalQuestions}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-sans font-bold block">THỜI GIAN</span>
                      <strong className="text-[#2563eb] font-black">{top3.second.totalDurationSec}s</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-sans font-bold block">ĐIỂM</span>
                      <strong className="text-[#1b3a8a] font-black">{top3.second.score}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-48 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 flex flex-col items-center justify-center p-4 text-center text-slate-400">
                  <span className="text-2xl mb-1">🥈</span>
                  <span className="text-xs font-bold uppercase text-slate-500">Chờ Á Quân</span>
                </div>
              )}
            </div>

            {/* TOP 1 - QUÁN QUÂN (Ở GIỮA - NỔI BẬT NHẤT) */}
            <div className="order-1 md:order-2 flex flex-col items-center -mt-2">
              {top3.first ? (
                <div className="w-full flex flex-col items-center p-5 rounded-3xl bg-gradient-to-t from-amber-50 via-white to-amber-50/50 border-3 border-amber-400 shadow-[0_8px_0_#d97706,0_16px_32px_rgba(245,158,11,0.18)] relative group hover:scale-[1.02] transition-all">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 font-black text-[10px] uppercase shadow-md flex items-center gap-1 border border-amber-300">
                    <span>👑 QUÁN QUÂN ĐẤU TRƯỜNG</span>
                  </div>

                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-200 text-amber-950 font-black text-xl shadow mb-2 mt-2">
                    🥇
                  </span>

                  <div className="relative w-20 h-20 rounded-2xl bg-[#fffbeb] border-2 border-amber-400 p-1.5 mb-2 shadow-md">
                    <img
                      src={top3.first.characterImage || resolveEntryCharacter(top3.first).image}
                      alt={top3.first.name}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-amber-950 font-black text-[10px] flex items-center justify-center border-2 border-white shadow">
                      #1
                    </div>
                  </div>

                  <h3
                    className="text-base sm:text-lg font-black text-[#78350f] text-center truncate max-w-[220px]"
                    style={{ color: '#78350f' }}
                  >
                    {top3.first.name}
                  </h3>
                  <span
                    className="text-xs text-[#1e3a8a] text-center truncate max-w-[220px] mb-2 font-black"
                    style={{ color: '#1e3a8a' }}
                  >
                    {top3.first.characterName || resolveEntryCharacter(top3.first).name}
                  </span>

                  <div className="w-full grid grid-cols-3 gap-1 pt-2.5 border-t-2 border-amber-200 text-center font-mono text-xs">
                    <div>
                      <span className="text-[9.5px] text-slate-500 block font-sans font-bold">ĐÚNG</span>
                      <strong className="text-[#15803d] font-black text-sm">{top3.first.correctCount}/{top3.first.totalQuestions}</strong>
                    </div>
                    <div>
                      <span className="text-[9.5px] text-slate-500 block font-sans font-bold">THỜI GIAN</span>
                      <strong className="text-[#2563eb] font-black text-sm">{top3.first.totalDurationSec}s</strong>
                    </div>
                    <div>
                      <span className="text-[9.5px] text-slate-500 block font-sans font-bold">ĐIỂM SỐ</span>
                      <strong className="text-[#1b3a8a] font-black text-sm">{top3.first.score} pts</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-56 rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50/40 flex flex-col items-center justify-center p-4 text-center text-amber-800">
                  <span className="text-3xl mb-1">👑</span>
                  <span className="text-sm font-black uppercase text-amber-800">Chờ Đón Quán Quân</span>
                  <p className="text-[11px] text-slate-500 max-w-[200px] mt-1 font-medium">
                    {selectedDate !== 'all'
                      ? `Chưa có đấu thủ thi đấu trong ngày ${formatDisplayDate(selectedDate)}`
                      : 'Bắt đầu trận đấu để ghi tên đấu thủ đầu tiên lên đỉnh vinh quang!'}
                  </p>
                </div>
              )}
            </div>

            {/* TOP 3 - QUÝ QUÂN (BÊN PHẢI) */}
            <div className="order-3 flex flex-col items-center">
              {top3.third ? (
                <div className="w-full flex flex-col items-center p-4 rounded-2xl bg-gradient-to-t from-orange-50 via-white to-orange-50/50 border-2 border-amber-500/50 shadow-[0_5px_0_#b45309] relative group hover:border-amber-600 transition-all">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-700 text-amber-50 font-black text-base shadow mb-2">
                    🥉
                  </span>
                  <div className="relative w-16 h-16 rounded-2xl bg-[#fff7ed] border-2 border-amber-500/50 p-1 mb-2 shadow-sm">
                    <img
                      src={top3.third.characterImage || resolveEntryCharacter(top3.third).image}
                      alt={top3.third.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-black text-[9px] uppercase mb-1">
                    QUÝ QUÂN • TOP 3
                  </span>
                  <h3
                    className="text-sm sm:text-base font-black text-slate-900 text-center truncate max-w-[200px]"
                    style={{ color: '#0f172a' }}
                  >
                    {top3.third.name}
                  </h3>
                  <span
                    className="text-[11px] text-[#1e3a8a] font-bold text-center truncate max-w-[200px] mb-2"
                    style={{ color: '#1e3a8a' }}
                  >
                    {top3.third.characterName || resolveEntryCharacter(top3.third).name}
                  </span>
                  <div className="w-full grid grid-cols-3 gap-1 pt-2 border-t-2 border-amber-100 text-center font-mono text-xs">
                    <div>
                      <span className="text-[9px] text-slate-500 font-sans font-bold block">ĐÚNG</span>
                      <strong className="text-[#15803d] font-black">{top3.third.correctCount}/{top3.third.totalQuestions}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-sans font-bold block">THỜI GIAN</span>
                      <strong className="text-[#2563eb] font-black">{top3.third.totalDurationSec}s</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 font-sans font-bold block">ĐIỂM</span>
                      <strong className="text-[#1b3a8a] font-black">{top3.third.score}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-48 rounded-2xl border-2 border-dashed border-amber-300 bg-orange-50/30 flex flex-col items-center justify-center p-4 text-center text-slate-400">
                  <span className="text-2xl mb-1">🥉</span>
                  <span className="text-xs font-bold uppercase text-slate-500">Chờ Quý Quân</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ===================================================================
         * KHỐI 3: BẢNG DANH SÁCH CHI TIẾT (TÌM KIẾM, LỌC & PHÂN TRANG 20 NGƯỜI)
         * =================================================================== */}
        <section aria-label="Bảng dữ liệu chi tiết" className="rounded-3xl bg-white border-2 border-[#bfdbfe] shadow-sm overflow-hidden flex flex-col">
          {/* Thanh công cụ tìm kiếm và bộ lọc */}
          <div className="p-4 sm:p-5 bg-[#f8fafc] border-b-2 border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-[#2563eb] flex items-center justify-center shrink-0 border border-blue-200">
                <span className="material-symbols-outlined text-[20px]">table_rows</span>
              </div>
              <div>
                <h3
                  className="text-sm sm:text-base font-black text-[#1b3a8a] uppercase flex items-center gap-2 flex-wrap"
                  style={{ color: '#1b3a8a' }}
                >
                  <span>DANH SÁCH ĐẤU THỦ</span>
                  <span className="text-xs text-[#15803d] font-mono bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-bold">
                    ({filteredList.length}/{dateFilteredEntries.length})
                  </span>
                  {selectedDate !== 'all' ? (
                    <span className="text-[11px] text-[#2563eb] font-sans font-bold">
                      • Buổi {selectedDate === todayKey ? 'hôm nay ' : ''}({formatDisplayDate(selectedDate)})
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500 font-sans font-medium">
                      • Toàn bộ thời gian ({entries.length} lượt)
                    </span>
                  )}
                </h3>
                <span className="text-[11px] text-slate-500 font-medium">
                  Hiển thị giới hạn 20 người mỗi trang theo tiêu chuẩn sự kiện
                </span>
              </div>
            </div>

            {/* Bộ điều khiển lọc & tìm kiếm */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ô tìm kiếm */}
              <div className="relative flex-1 sm:w-60">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400 pointer-events-none">
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
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white border-2 border-slate-300 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#2563eb] font-medium shadow-xs"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer text-sm font-bold"
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
                className="px-3 py-1.5 text-xs rounded-xl bg-white border-2 border-slate-300 text-slate-800 focus:outline-none focus:border-[#2563eb] cursor-pointer font-bold shadow-xs"
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
                className="px-3 py-1.5 text-xs rounded-xl bg-white border-2 border-slate-300 text-slate-800 focus:outline-none focus:border-[#2563eb] cursor-pointer font-bold shadow-xs"
              >
                <option value="all">Tất cả thành tích</option>
                <option value="perfect">Đạt 100% đúng</option>
                <option value="top10">Top 10 cao nhất</option>
              </select>

              {/* Sắp xếp */}
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="px-3 py-1.5 text-xs rounded-xl bg-white border-2 border-[#93c5fd] text-[#1d4ed8] focus:outline-none focus:border-[#2563eb] cursor-pointer font-bold shadow-xs"
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
                <tr className="border-b-2 border-slate-200 text-[#1b3a8a] uppercase bg-[#eff6ff] text-[11px] font-black">
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
              <tbody className="divide-y divide-slate-100">
                {pagedList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500 text-sm font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[36px] text-slate-300">
                          inbox
                        </span>
                        <span>
                          {selectedDate !== 'all'
                            ? `Chưa có đấu thủ nào trong ngày ${formatDisplayDate(selectedDate)} phù hợp với bộ lọc hiện tại.`
                            : 'Không tìm thấy đấu thủ nào phù hợp với bộ lọc hiện tại.'}
                        </span>
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
                        className={`transition-colors hover:bg-slate-50/80 ${
                          rank === 1
                            ? 'bg-amber-50/60'
                            : rank === 2
                            ? 'bg-slate-50/80'
                            : rank === 3
                            ? 'bg-orange-50/60'
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
                            <span className="font-mono font-bold text-slate-500">
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
                              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain bg-[#eff6ff] border-2 border-blue-200 p-0.5 shrink-0 shadow-xs"
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-black text-slate-900 text-xs sm:text-sm truncate">
                                  {entry.name}
                                </span>
                                {rank <= 3 && (
                                  <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300">
                                    TOP {rank}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10.5px] text-[#2563eb] font-bold truncate">
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
                                ? 'bg-[#ebf9f1] text-[#15803d] border border-[#86efac]'
                                : 'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]'
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
                            <span className="font-mono font-black text-[#15803d]">
                              {entry.correctCount}/{entry.totalQuestions}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono font-bold">
                              ({accuracy}%)
                            </span>
                          </div>
                        </td>

                        {/* Cột Thời gian hoàn thành */}
                        <td className="py-3 px-3 sm:px-4 text-center font-mono font-black text-[#2563eb]">
                          {entry.totalDurationSec}s
                        </td>

                        {/* Cột Chuỗi thắng */}
                        <td className="py-3 px-3 sm:px-4 text-center font-mono font-black text-orange-600 hidden md:table-cell">
                          {(entry.maxWinStreak || 0) > 0 ? `🔥 x${entry.maxWinStreak}` : '—'}
                        </td>

                        {/* Cột Điểm số */}
                        <td className="py-3 px-3 sm:px-4 text-right font-mono font-black text-[#1b3a8a] text-sm">
                          {entry.score} pts
                        </td>

                        {/* Cột Thời điểm thi */}
                        <td className="py-3 px-3 sm:px-4 text-center text-[10.5px] text-slate-500 font-mono hidden lg:table-cell">
                          {entry.timestamp ? (
                            selectedDate === 'all' ? (
                              <div className="flex flex-col items-center leading-tight">
                                <span className="text-slate-800 font-bold">{formatDisplayDate(getDateKey(entry.timestamp))}</span>
                                <span className="text-[9.5px] text-slate-500 font-medium">{new Date(entry.timestamp).toLocaleTimeString('vi-VN')}</span>
                              </div>
                            ) : (
                              <span className="font-medium text-slate-700">{new Date(entry.timestamp).toLocaleTimeString('vi-VN')}</span>
                            )
                          ) : (
                            '—'
                          )}
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
            <div className="p-3.5 sm:p-4 bg-[#f8fafc] border-t-2 border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 select-none">
              {/* Thống kê phạm vi */}
              <div className="text-xs text-slate-600 font-medium flex items-center gap-1.5 flex-wrap justify-center sm:justify-start">
                <span>Hiển thị</span>
                <strong className="text-[#1b3a8a] font-mono font-black bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                  {startIndex + 1}–{endIndex}
                </strong>
                <span>trên tổng số</span>
                <strong className="text-[#15803d] font-mono font-black">{filteredList.length}</strong>
                <span>đấu thủ • Trang <strong className="text-[#1b3a8a] font-mono font-black">{currentPage}</strong> / {totalPages}</span>
              </div>

              {/* Dãy số trang: 1, 2, 3... */}
              <div className="flex items-center gap-1 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border-2 border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-slate-100 text-slate-700 shadow-xs"
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
                        className="w-7 text-center text-xs font-bold text-slate-400 select-none"
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
                      className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer relative flex items-center justify-center border-2 ${
                        isActive
                          ? 'btn-mana-blue text-white font-black border-[#1d4ed8] shadow-sm'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 active:scale-95 shadow-xs'
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
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border-2 border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-slate-100 text-slate-700 shadow-xs"
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
      <footer className="relative z-10 w-full bg-white border-t-2 border-slate-200 py-3 text-center text-xs text-slate-500 font-medium">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Manabie AI EdTech Platform • Chuyên đề 12 Tiết AI Cốt Lõi 2026</span>
          <span className="text-[11px] font-mono text-[#2563eb] font-bold">
            Đường dẫn Quản trị: <strong>/host</strong>
          </span>
        </div>
      </footer>

      {/* ===================================================================
       * MODAL 1: XÁC NHẬN RESET BẢNG XẾP HẠNG
       * =================================================================== */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white border-4 border-rose-500 p-5 sm:p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <span className="material-symbols-outlined text-[32px]">warning</span>
              <h3 className="text-lg font-black uppercase text-slate-900">XÁC NHẬN ĐẶT LẠI BXH</h3>
            </div>
            <div className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-5 font-medium">
              {selectedDate !== 'all' ? (
                <div className="space-y-2">
                  <p>
                    Bạn đang theo dõi buổi tập huấn <strong className="text-[#2563eb]">Ngày {formatDisplayDate(selectedDate)}</strong> ({dateFilteredEntries.length} lượt đấu).
                  </p>
                  <p className="p-3 rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-900">
                    💡 <strong>Gợi ý:</strong> Bạn có thể chọn <span className="text-amber-700 font-black">Chỉ xóa ngày này</span> để làm sạch dữ liệu cho buổi tập huấn hiện tại mà không làm mất lịch sử các ngày khác.
                  </p>
                </div>
              ) : (
                <p>
                  Thao tác này sẽ <strong className="text-rose-600 font-black">xóa toàn bộ danh sách điểm số và đấu thủ ({entries.length} người)</strong> trên cả trình duyệt hiện tại và máy chủ cơ sở dữ liệu.
                  Dữ liệu sau khi xóa sẽ không thể phục hồi.
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
              >
                Hủy bỏ
              </button>
              {selectedDate !== 'all' && (
                <button
                  type="button"
                  onClick={handleResetSelectedDate}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase cursor-pointer transition-colors shadow-md"
                >
                  Chỉ xóa ngày này ({dateFilteredEntries.length})
                </button>
              )}
              <button
                type="button"
                onClick={handleResetAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase cursor-pointer transition-colors shadow-md"
              >
                {selectedDate !== 'all' ? `Xóa tất cả (${entries.length})` : 'Xác nhận Xóa Hết'}
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
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 select-none"
          onClick={() => setShowQuestionsModal(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] rounded-3xl bg-white border-4 border-[#2563eb] p-4 sm:p-6 shadow-2xl flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-slate-200">
              <div className="flex items-center gap-2 text-[#2563eb]">
                <span className="material-symbols-outlined text-[26px]">school</span>
                <h3 className="text-base sm:text-lg font-black text-[#1b3a8a] uppercase">
                  NGÂN HÀNG 12 CÂU HỎI KÉO CO & GIẢI NGHĨA SƯ PHẠM
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuestionsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
              {TUG_QUESTIONS.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-3.5 rounded-2xl bg-[#f8fafc] border-2 border-slate-200 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-black uppercase text-[#2563eb]">
                      CÂU {idx + 1}: {q.toolName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        q.hasAI
                          ? 'bg-blue-100 text-[#1d4ed8] border border-blue-300'
                          : 'bg-emerald-100 text-[#15803d] border border-emerald-300'
                      }`}
                    >
                      {q.hasAI ? '👉 CÓ SỬ DỤNG AI' : '👈 KHÔNG CÓ AI'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 leading-relaxed">
                    {q.question}
                  </p>
                  <div className="mt-1 p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 text-[11px] text-slate-700 flex items-start gap-1.5 font-medium">
                    <span className="material-symbols-outlined text-[16px] text-amber-500 shrink-0 mt-0.5">
                      lightbulb
                    </span>
                    <span>
                      <strong className="text-[#1b3a8a] font-bold">Giải nghĩa sư phạm:</strong> {q.insight}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t-2 border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowQuestionsModal(false)}
                className="px-5 py-2 rounded-xl btn-mana-blue text-white text-xs font-black uppercase cursor-pointer"
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
