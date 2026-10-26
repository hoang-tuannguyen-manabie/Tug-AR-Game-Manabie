import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ARGestureTracker, GestureSide } from './components/ARGestureTracker';
import { DashboardLeaderboard } from './components/DashboardLeaderboard';
import { CharacterAvatar, PlayerSetupModal, SetupStep } from './components/PlayerSetupModal';
import { BRAND_MASCOTS, MANABIE_LOGO } from './data/brand';
import {
  getCharacterById,
  loadSavedPlayerProfile,
  PLAYER_CHARACTERS,
  PlayerProfile,
  savePlayerProfile,
} from './data/characters';
import { TUG_QUESTIONS, getShuffledQuestions, TugQuestion } from './data/questions';
import { audio } from './utils/audio';

export type PageStep = 'gioi-thieu' | 'huong-dan' | 'tro-choi-keo-co' | 'tong-ket';
export type ControlMode = 'ar' | 'mouse';

export interface AnswerRecord {
  questionId: number;
  questionIndex: number;
  question: string;
  topic: string;
  toolName?: string;
  image?: string;
  userChoice: 'LEFT' | 'RIGHT' | null;
  userChoiceText: string;
  correctSide: 'LEFT' | 'RIGHT';
  correctSideText: string;
  isCorrect: boolean;
  insight: string;
  timeSpentSec?: number;
}

export interface MatchStats {
  humanScore: number;
  aiScore: number;
  ropeMeters: number; // Dương (+): nghiêng về Đội Con Người, Âm (-): nghiêng về Đội AI
  correctCount: number;
  totalQuestions: number;
  avgReactionSec: number;
  maxWinStreak: number;
  totalDurationSec: number;
  controlMode?: ControlMode;
  sessionId?: string;
  answers?: AnswerRecord[];
  playerName?: string;
  characterId?: string;
  characterImage?: string;
  characterName?: string;
}

const INITIAL_STATS: MatchStats = {
  humanScore: 850,
  aiScore: 650,
  ropeMeters: 3.6,
  correctCount: 8,
  totalQuestions: TUG_QUESTIONS.length,
  avgReactionSec: 3.8,
  maxWinStreak: 5,
  totalDurationSec: 38.5,
  controlMode: 'ar',
  sessionId: 'initial-stats',
  answers: TUG_QUESTIONS.map((q, idx) => {
    const isCorrect = idx !== 2 && idx !== 6;
    const userChoice = (isCorrect ? (q.hasAI ? 'RIGHT' : 'LEFT') : (q.hasAI ? 'LEFT' : 'RIGHT')) as 'LEFT' | 'RIGHT';
    return {
      questionId: q.id,
      questionIndex: idx + 1,
      question: q.question,
      topic: q.topic,
      toolName: q.toolName,
      image: q.image,
      userChoice,
      userChoiceText: userChoice === 'RIGHT' ? 'Có sử dụng AI' : 'Không có AI',
      correctSide: (q.hasAI ? 'RIGHT' : 'LEFT') as 'LEFT' | 'RIGHT',
      correctSideText: q.hasAI ? 'Có sử dụng AI' : 'Không có AI',
      isCorrect,
      insight: q.insight,
      timeSpentSec: +(3.2 + (idx % 3) * 0.7).toFixed(1),
    };
  }),
};

const BRIDGE_LABELS: Record<PageStep, string> = {
  'gioi-thieu': '01 • KHỞI ĐỘNG CHUYÊN ĐỀ 12 TIẾT AI',
  'huong-dan': '02 • QUY TẮC & CHỌN CHẾ ĐỘ ĐIỀU KHIỂN',
  'tro-choi-keo-co': '03 • ĐẤU TRƯỜNG KÉO CO CON NGƯỜI VS AI',
  'tong-ket': '04 • TỔNG KẾT & THỐNG KÊ CHI TIẾT',
};

const NAV_STEPS = [
  { id: 'gioi-thieu', num: '01', icon: 'flag', label: 'Giới thiệu', sub: 'Khởi động 12 tiết' },
  { id: 'huong-dan', num: '02', icon: 'menu_book', label: 'Hướng dẫn', sub: 'Luật chơi & Thử AR' },
  { id: 'tro-choi-keo-co', num: '03', icon: 'sports_kabaddi', label: 'Kéo co AI', sub: 'Người vs AI' },
  { id: 'tong-ket', num: '04', icon: 'emoji_events', label: 'Tổng kết', sub: 'Dashboard & Thống kê' },
] as const;

function PinchMark({ live }: { live?: boolean }) {
  return <span className={`pinch ${live ? 'pinch-live' : ''}`} aria-hidden="true" />;
}

export default function App() {
  const [page, setPage] = useState<PageStep>('gioi-thieu');
  const [controlMode, setControlMode] = useState<ControlMode>('ar');
  const [muted, setMuted] = useState(false);
  const [matchStats, setMatchStats] = useState<MatchStats>(INITIAL_STATS);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [gameSessionId, setGameSessionId] = useState(1);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Quản lý hồ sơ người chơi & nhân vật đồng hành (36 nhân vật)
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(() =>
    loadSavedPlayerProfile()
  );
  // Tự động mở popup hồ sơ người chơi & nhân vật ngay từ khi mới vào đầu trang
  const [playerSetupOpen, setPlayerSetupOpen] = useState(true);
  const [playerSetupInitialStep, setPlayerSetupInitialStep] = useState<SetupStep>(() => {
    const saved = loadSavedPlayerProfile();
    return saved ? 'confirm' : 'name';
  });
  const [pendingGameLaunchMode, setPendingGameLaunchMode] = useState<ControlMode | null>(null);

  // Quản lý khóa các bước theo tuần tự (Mục 3 và Mục 4 ban đầu bị khóa)
  const [unlockedSteps, setUnlockedSteps] = useState<Record<PageStep, boolean>>({
    'gioi-thieu': true,
    'huong-dan': true,
    'tro-choi-keo-co': false,
    'tong-ket': false,
  });
  const unlockedStepsRef = useRef(unlockedSteps);
  unlockedStepsRef.current = unlockedSteps;

  const unlockStep = (step: PageStep) => {
    unlockedStepsRef.current[step] = true;
    setUnlockedSteps((prev) => ({ ...prev, [step]: true }));
  };

  // Chuyển cảnh Morph Bridge & Launch Iris Wipe giống repo tham chiếu
  const [bridgeText, setBridgeText] = useState<string | null>(null);
  const [launchWipeText, setLaunchWipeText] = useState<string | null>(null);
  const [motionKey, setMotionKey] = useState(0);
  const transitionLockRef = useRef(false);

  const pageRef = useRef(page);
  pageRef.current = page;

  // Kích hoạt âm thanh nền nhẹ nhàng cho Trang 1 & 2 sau lần tương tác đầu tiên của người dùng
  useEffect(() => {
    const startAudioOnFirstInteraction = () => {
      audio.init();
      if (pageRef.current === 'gioi-thieu' || pageRef.current === 'huong-dan') {
        audio.playAmbientMusic();
      }
      window.removeEventListener('pointerdown', startAudioOnFirstInteraction);
      window.removeEventListener('keydown', startAudioOnFirstInteraction);
    };
    window.addEventListener('pointerdown', startAudioOnFirstInteraction, { once: true });
    window.addEventListener('keydown', startAudioOnFirstInteraction, { once: true });
    return () => {
      window.removeEventListener('pointerdown', startAudioOnFirstInteraction);
      window.removeEventListener('keydown', startAudioOnFirstInteraction);
    };
  }, []);

  const triggerPageTransition = (
    target: PageStep,
    options?: {
      modeOverride?: ControlMode;
      isLaunchGame?: boolean;
      customLabel?: string;
      forceUnlock?: boolean;
    }
  ) => {
    if (transitionLockRef.current) return;
    // Khi đã từ mục 2 qua mục 3, không cho phép bấm về các mục trước đó (mục 1 và mục 2)
    if (page === 'tro-choi-keo-co' && (target === 'gioi-thieu' || target === 'huong-dan')) {
      return;
    }
    if (!unlockedStepsRef.current[target] && !options?.forceUnlock) return;
    transitionLockRef.current = true;

    audio.init();
    audio.playClick();
    // Dừng nhạc ngay lập tức khi bắt đầu chuyển bước, ngăn chặn hoàn toàn hiện tượng phát đè âm thanh
    audio.stopMusic();

    if (options?.modeOverride) {
      setControlMode(options.modeOverride);
    }

    const applyPageChange = () => {
      const update = () =>
        flushSync(() => {
          setPage(target);
          setMotionKey((k) => k + 1);
        });

      const docWithVT = document as Document & {
        startViewTransition?: (cb: () => void) => { finished: Promise<void> };
      };
      if (docWithVT.startViewTransition) {
        docWithVT.startViewTransition(update).finished.catch(() => undefined);
      } else {
        update();
      }

      if (target === 'tro-choi-keo-co') {
        setGameSessionId((s) => s + 1);
        audio.playBattleMusic();
      } else if (target === 'gioi-thieu' || target === 'huong-dan') {
        audio.playAmbientMusic();
      } else if (target === 'tong-ket') {
        audio.stopMusic();
        audio.playWin();
      } else {
        audio.stopMusic();
      }
    };

    if (options?.isLaunchGame) {
      const chosenMode = options.modeOverride ?? controlMode;
      setLaunchWipeText(
        chosenMode === 'ar'
          ? 'KHỞI ĐỘNG ĐẤU TRƯỜNG • CHẾ ĐỘ CAMERA AR'
          : 'KHỞI ĐỘNG ĐẤU TRƯỜNG • CHẾ ĐỘ CLICK CHUỘT'
      );
      window.setTimeout(() => {
        applyPageChange();
      }, 360);
      window.setTimeout(() => {
        setLaunchWipeText(null);
        transitionLockRef.current = false;
      }, 820);
      return;
    }

    setBridgeText(options?.customLabel ?? BRIDGE_LABELS[target]);
    window.setTimeout(() => {
      applyPageChange();
    }, 280);
    window.setTimeout(() => {
      setBridgeText(null);
      transitionLockRef.current = false;
    }, 920);
  };

  const replayCurrentPageMotion = () => {
    audio.init();
    audio.playClick();
    setBridgeText('XEM LẠI HIỆU ỨNG TRÌNH CHIẾU');
    window.setTimeout(() => {
      setMotionKey((k) => k + 1);
    }, 220);
    window.setTimeout(() => {
      setBridgeText(null);
    }, 880);
  };

  const toggleMute = () => {
    audio.init();
    const next = !muted;
    setMuted(next);
    audio.setMuted(next);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col justify-between relative selection:bg-primary selection:text-on-primary overflow-x-hidden ${
        page !== 'tong-ket' ? 'h-screen max-h-screen overflow-hidden' : ''
      }`}
    >
      {/* LỚP NỀN ATMOSPHERE ĐỒNG BỘ REPO THAM CHIẾU */}
      <div className="workshop-atmosphere" aria-hidden="true">
        <span className="workshop-grid" />
        <span className="workshop-scanline" />
      </div>

      {/* OVERLAY CHUYỂN CẢNH MORPH BRIDGE */}
      {bridgeText && (
        <div className="morph-bridge-overlay" aria-hidden="true">
          <span />
          <b>{bridgeText}</b>
        </div>
      )}

      {/* OVERLAY LAUNCH IRIS WIPE KHI VÀO GAME */}
      {launchWipeText && (
        <div className="launch-wipe-overlay" aria-hidden="true">
          <span>{launchWipeText}</span>
        </div>
      )}

      {/* THANH ĐIỀU HƯỚNG CỘT BÊN PHẢI (COLLAPSIBLE RIGHT SIDEBAR - TÍCH HỢP TOÀN BỘ TIỆN ÍCH HEADER TỪ TRANG 1) */}
      <aside
        aria-label="Thanh điều hướng các bước"
        className={`fixed right-2 sm:right-3 top-2 sm:top-3 z-40 transition-all duration-300 ease-in-out ${
          sidebarExpanded
            ? 'w-56 sm:w-64 bg-surface-container-lowest/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.65)] p-3'
            : 'w-12 sm:w-14 bg-surface-container-lowest/90 backdrop-blur-xl border border-white/15 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1.5 sm:p-2'
        }`}
      >
        {/* Header của Sidebar */}
        <div
          className={`flex items-center ${
            sidebarExpanded
              ? 'justify-between pb-2 mb-2 border-b border-white/10'
              : 'flex-col items-center gap-1.5 pb-1.5 mb-1.5 border-b border-white/10'
          }`}
        >
          {sidebarExpanded ? (
            <button
              type="button"
              onClick={() => {
                if (page !== 'tro-choi-keo-co') {
                  triggerPageTransition('gioi-thieu');
                }
              }}
              className={`flex items-center gap-2 min-w-0 text-left group ${
                page === 'tro-choi-keo-co' ? 'cursor-default' : 'cursor-pointer'
              }`}
              title="Manabie Public School 2026 - 12 Tiết AI"
            >
              <img
                alt="Manabie Logo"
                className="h-6 w-6 rounded object-contain shrink-0 group-hover:scale-105 transition-transform"
                src={MANABIE_LOGO}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[10.5px] font-black uppercase text-tertiary tracking-wider leading-none truncate">
                  12 TIẾT AI
                </span>
                <span className="text-[8.5px] text-on-surface-variant leading-none mt-0.5 truncate">
                  Manabie 2026
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (page !== 'tro-choi-keo-co') {
                  triggerPageTransition('gioi-thieu');
                }
              }}
              className={`flex items-center justify-center p-0.5 rounded-lg group ${
                page === 'tro-choi-keo-co' ? 'cursor-default' : 'cursor-pointer hover:bg-surface-container-high'
              }`}
              title="12 Tiết AI • Manabie 2026"
            >
              <img
                alt="Manabie Logo"
                className="h-5 w-5 sm:h-6 sm:w-6 rounded object-contain group-hover:scale-110 transition-transform"
                src={MANABIE_LOGO}
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-surface-container-high/80 hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-white/10 shrink-0"
            title={sidebarExpanded ? 'Thu gọn menu điều hướng' : 'Mở rộng menu điều hướng'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {sidebarExpanded ? 'chevron_right' : 'menu'}
            </span>
          </button>
        </div>

        {/* Cụm Tiện ích chuyển từ Header xuống Sidebar khi ở Mục 3 (hoặc hiển thị luôn trong Sidebar) */}
        {sidebarExpanded ? (
          <div className="mb-2.5 flex flex-col gap-1.5">
            {/* Badge trang hiện tại */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-container-high/60 border border-white/10 text-on-surface-variant text-[10.5px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse shrink-0" />
              <span className="truncate">{BRIDGE_LABELS[page]}</span>
            </div>

            {/* Nút Âm thanh + Toàn màn hình + Chế độ */}
            <div className="flex items-center justify-between gap-1 p-1 rounded-xl bg-surface-container-high/40 border border-white/5">
              <button
                onClick={toggleMute}
                className="flex-1 py-1 px-1.5 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1 transition-colors text-[10px] font-bold border border-white/5 cursor-pointer"
                title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                type="button"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {muted ? 'volume_off' : 'volume_up'}
                </span>
                <span>{muted ? 'Tắt' : 'Bật'}</span>
              </button>

              <button
                onClick={toggleFullscreen}
                className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors border border-white/5 cursor-pointer shrink-0"
                title="Toàn màn hình"
                type="button"
              >
                <span className="material-symbols-outlined text-[15px]">fullscreen</span>
              </button>

              <div
                className={`px-1.5 py-1 rounded-lg text-[9.5px] font-black uppercase border flex items-center gap-1 shrink-0 ${
                  controlMode === 'ar'
                    ? 'bg-tertiary-container/30 text-tertiary border-tertiary/30'
                    : 'bg-surface-container text-secondary border-white/10'
                }`}
              >
                <span className="w-1 h-1 rounded-full bg-current" />
                <span>{controlMode === 'ar' ? 'AR' : 'Chuột'}</span>
              </div>
            </div>
          </div>
        ) : (
          /* Khi Sidebar thu gọn ở dạng icon: hiển thị 2 icon Âm thanh & Fullscreen */
          <div className="flex flex-col items-center gap-1 mb-2 pb-2 border-b border-white/10">
            <button
              onClick={toggleMute}
              className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-white/5"
              title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">
                {muted ? 'volume_off' : 'volume_up'}
              </span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-white/5"
              title="Toàn màn hình"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">fullscreen</span>
            </button>
          </div>
        )}

        {/* Danh sách 4 bước */}
        <nav className="flex flex-col gap-1.5">
          {NAV_STEPS.map((tab) => {
            const active = page === tab.id;
            const isPastStepLocked =
              page === 'tro-choi-keo-co' && (tab.id === 'gioi-thieu' || tab.id === 'huong-dan');
            const isLocked = !unlockedSteps[tab.id] || isPastStepLocked;

            return (
              <button
                key={tab.id}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (isLocked) return;
                  if (tab.id === 'tro-choi-keo-co' && page !== 'tro-choi-keo-co') {
                    if (!playerProfile) {
                      setPendingGameLaunchMode(controlMode);
                      setPlayerSetupInitialStep('name');
                      setPlayerSetupOpen(true);
                      return;
                    }
                  }
                  triggerPageTransition(tab.id, {
                    isLaunchGame: tab.id === 'tro-choi-keo-co' && page !== 'tro-choi-keo-co',
                  });
                }}
                title={
                  isPastStepLocked
                    ? `Đang trong trận đấu kéo co. Dùng nút "Hướng dẫn" trên màn hình để xem lại!`
                    : isLocked
                    ? `Mục ${tab.num} đang khóa. Vui lòng hoàn thành tuần tự!`
                    : `${tab.num} • ${tab.label}`
                }
                className={`group relative flex items-center rounded-xl transition-all ${
                  sidebarExpanded ? 'px-2.5 py-2 gap-2.5 text-left' : 'w-full aspect-square justify-center'
                } ${
                  active
                    ? 'bg-gradient-to-r from-primary-container to-primary-container/80 text-on-primary-container font-black shadow-[0_0_16px_rgba(57,90,210,0.5)] border border-primary/40'
                    : isLocked
                    ? 'opacity-35 text-on-surface-variant cursor-not-allowed hover:bg-transparent'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/80 cursor-pointer border border-transparent hover:border-white/10'
                }`}
              >
                {/* Icon hoặc Số */}
                <div className="relative shrink-0 flex items-center justify-center">
                  <span
                    className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                      active
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant group-hover:text-tertiary'
                    }`}
                  >
                    {tab.num}
                  </span>
                  {active && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-tertiary animate-ping" />
                  )}
                </div>

                {/* Khi phóng to: hiển thị chi tiết tên bước & mô tả ngắn */}
                {sidebarExpanded && (
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] font-bold truncate leading-tight">
                      {tab.label}
                    </span>
                    <span className="text-[9.5px] text-on-surface-variant/80 truncate">
                      {tab.sub}
                    </span>
                  </div>
                )}

                {/* Biểu tượng ổ khóa nếu bị khóa */}
                {isLocked && !active && (
                  <span
                    className={`material-symbols-outlined text-[14px] text-on-surface-variant/70 shrink-0 ${
                      sidebarExpanded ? 'ml-auto' : 'absolute bottom-1 right-1 text-[11px]'
                    }`}
                  >
                    lock
                  </span>
                )}

                {/* Tooltip khi thu gọn ở dạng icon */}
                {!sidebarExpanded && (
                  <div className="absolute right-full mr-2 px-2.5 py-1 bg-surface-container-lowest/95 text-on-surface text-[11px] font-bold rounded-lg border border-white/15 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {tab.num} • {tab.label}
                    {isLocked && ' 🔒 (Đang khóa)'}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Chân sidebar khi mở rộng */}
        {sidebarExpanded && (
          <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-col gap-1.5 text-[10px] text-on-surface-variant">
            {playerProfile && (
              <button
                type="button"
                onClick={() => {
                  if (page !== 'tro-choi-keo-co') {
                    setPendingGameLaunchMode(null);
                    setPlayerSetupInitialStep('name');
                    setPlayerSetupOpen(true);
                  }
                }}
                className="flex items-center gap-2 p-1.5 rounded-xl bg-[#241354]/90 border border-purple-400/30 hover:border-emerald-400/60 transition-colors cursor-pointer text-left"
                title="Đổi tên hoặc nhân vật đồng hành"
              >
                <img
                  src={playerProfile.characterImage}
                  alt={playerProfile.characterName}
                  className="w-6 h-6 rounded-lg object-contain bg-[#180c3a] shrink-0"
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[10.5px] font-black text-white truncate">
                    {playerProfile.playerName}
                  </span>
                  <span className="text-[9px] text-emerald-300 truncate">
                    {playerProfile.characterName}
                  </span>
                </div>
              </button>
            )}
            <div className="flex items-center justify-between">
              <span>Chế độ: <strong>{controlMode === 'ar' ? 'Camera AR' : 'Chuột'}</strong></span>
              <span className="text-tertiary font-bold">12 Tiết AI</span>
            </div>
          </div>
        )}
      </aside>

      {/* NỘI DUNG TỪNG TRANG VỚI KỸ THUẬT STAGGER & MORPH (KHÔNG SCROLL Ở MỤC 1, 2, 3) */}
      <main
        key={motionKey}
        className={`w-full ${
          page === 'tong-ket'
            ? 'pt-4 sm:pt-6 pb-6 min-h-[calc(100vh-4rem)]'
            : 'p-1 sm:p-2 h-full max-h-screen overflow-hidden'
        } flex flex-col justify-center pr-12 sm:pr-14 md:pr-16`}
      >
        <div
          className={`max-w-7xl w-full mx-auto px-1 sm:px-3 ${
            page === 'tro-choi-keo-co' || page === 'gioi-thieu' || page === 'huong-dan'
              ? 'h-full flex flex-col justify-center items-center'
              : ''
          }`}
        >
          {page === 'gioi-thieu' && (
            <WelcomePage
              controlMode={controlMode}
              onSelectControlMode={setControlMode}
              playerProfile={playerProfile}
              onOpenPlayerSetup={(step = 'name') => {
                setPendingGameLaunchMode(controlMode);
                setPlayerSetupInitialStep(step);
                setPlayerSetupOpen(true);
              }}
              onNext={() => {
                unlockStep('huong-dan');
                triggerPageTransition('huong-dan');
              }}
              onOpenQr={() => setQrModalOpen(true)}
            />
          )}

          {page === 'huong-dan' && (
            <GuidePage
              controlMode={controlMode}
              onSelectControlMode={setControlMode}
              playerProfile={playerProfile}
              onOpenPlayerSetup={(step = 'name') => {
                setPendingGameLaunchMode(controlMode);
                setPlayerSetupInitialStep(step);
                setPlayerSetupOpen(true);
              }}
              onBack={() => triggerPageTransition('gioi-thieu')}
              onStartGame={(mode) => {
                setControlMode(mode);
                unlockStep('tro-choi-keo-co');
                triggerPageTransition('tro-choi-keo-co', {
                  modeOverride: mode,
                  isLaunchGame: true,
                  forceUnlock: true,
                });
              }}
            />
          )}

          {page === 'tro-choi-keo-co' && (
            <GameplayPage
              key={gameSessionId}
              controlMode={controlMode}
              onSelectControlMode={setControlMode}
              playerProfile={playerProfile}
              onFinish={(stats) => {
                setMatchStats(stats);
                unlockStep('tong-ket');
                triggerPageTransition('tong-ket', {
                  customLabel: 'HOÀN THÀNH TRẬN ĐẤU • TỔNG HỢP KẾT QUẢ',
                  forceUnlock: true,
                });
              }}
            />
          )}

          {page === 'tong-ket' && (
            <SummaryPage
              stats={matchStats}
              playerProfile={playerProfile}
              onReplay={() => {
                setPendingGameLaunchMode(controlMode);
                setPlayerSetupInitialStep('name');
                setPlayerSetupOpen(true);
              }}
              onHome={() => triggerPageTransition('gioi-thieu')}
            />
          )}
        </div>
      </main>

      {/* MÀN HÌNH THIẾT LẬP NGƯỜI CHƠI: NHẬP TÊN -> CHỌN 36 NHÂN VẬT -> XÁC NHẬN */}
      <PlayerSetupModal
        open={playerSetupOpen}
        initialProfile={playerProfile}
        initialStep={playerSetupInitialStep}
        onConfirm={(profile) => {
          setPlayerProfile(profile);
          savePlayerProfile(profile);
          setPlayerSetupOpen(false);
          setPendingGameLaunchMode(null);
          // Nút bắt đầu chơi sẽ tới mục 1 để chọn phương thức chơi chứ không nhảy hẳn vào màn chơi
          unlockStep('gioi-thieu');
          unlockStep('huong-dan');
          triggerPageTransition('gioi-thieu', {
            forceUnlock: true,
          });
        }}
      />

      {/* FOOTER CHUNG (CHỈ HIỂN THỊ KHI Ở MỤC 4 TỔNG KẾT ĐỂ MỤC 1, 2, 3 KHÔNG BỊ SCROLL VÀ TOÀN BỘ ĐÃ ĐƯỢC CHUYỂN VÀO SIDEBAR) */}
      {page === 'tong-ket' && (
        <footer className="w-full shrink-0 bg-surface-container-lowest/90 backdrop-blur-md border-t border-white/10 py-1 sm:py-1.5 text-[10px] sm:text-xs">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-on-surface-variant truncate">
              <span className="text-[10px] uppercase font-bold text-tertiary">
                12 TIẾT AI CỐT LÕI
              </span>
              <span className="text-outline-variant">•</span>
              <span className="hidden sm:inline text-on-surface-variant">Manabie AI EdTech Platform</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="text-[9.5px] text-outline uppercase hidden sm:inline">Manabie Public School 2026</span>
              <span className="text-outline-variant hidden sm:inline">•</span>
              <span className="text-[10px] sm:text-xs text-tertiary font-semibold">Made by Nguyen Hoang Tuan</span>
            </div>
          </div>
        </footer>
      )}

      {/* MODAL HƯỚNG DẪN THIẾT BỊ */}
      {qrModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className="bg-surface-container-high border border-white/20 rounded-2xl p-6 max-w-md w-full text-center shadow-2xl flex flex-col items-center gap-3 ppt-page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={BRAND_MASCOTS.welcomeAnimated}
              alt="Mana Mascot"
              className="w-24 h-24 object-contain"
            />
            <span className="text-label-caps text-tertiary uppercase">HỆ THỐNG TƯƠNG TÁC LỚP HỌC</span>
            <h3 className="text-headline-md text-on-surface">Hai chế độ điều khiển linh hoạt</h3>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              • <strong>Camera AR (Cử chỉ bàn tay)</strong>: Đưa bàn tay sang trái hoặc phải trước webcam để điều khiển.<br />
              • <strong>Chế độ Chuột (Click trực tiếp)</strong>: Phù hợp khi dùng màn hình tương tác cảm ứng hoặc chuột máy chiếu.
            </p>
            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="mt-2 px-7 py-2.5 rounded-xl bg-primary-container text-on-primary-container font-bold cursor-pointer"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 01 - TRANG CHÀO MỪNG (WELCOME PAGE) — CO GIÃN GỌN GÀNG, KHÔNG SCROLL, ĐẦY ĐỦ THÔNG TIN
 * ============================================================================ */
function WelcomePage({
  controlMode,
  onSelectControlMode,
  playerProfile,
  onOpenPlayerSetup,
  onNext,
  onOpenQr,
}: {
  controlMode: ControlMode;
  onSelectControlMode: (mode: ControlMode) => void;
  playerProfile: PlayerProfile | null;
  onOpenPlayerSetup: (step?: SetupStep) => void;
  onNext: () => void;
  onOpenQr: () => void;
}) {
  return (
    <div className="relative w-full max-w-4xl mx-auto rounded-2xl bg-surface-container-lowest/90 backdrop-blur-xl p-3 sm:p-4 md:p-5 overflow-hidden shadow-2xl border border-white/10 ppt-page-enter flex flex-col justify-between gap-2 sm:gap-2.5 h-full max-h-full">
      {/* Cổng Morph Portal */}
      <div className="workshop-morph-gate" aria-hidden="true">
        <i>AI</i>
        <b>ĐẤU TRƯỜNG KÉO CO</b>
      </div>

      <div className="absolute -top-24 -left-24 w-72 h-72 bg-primary-container/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-tertiary-container/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top bar chip */}
      <div className="flex items-center justify-between pb-0.5 ppt-stagger-1 shrink-0">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high border border-white/10 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse shadow-[0_0_8px_currentColor]" />
          <span className="text-[10px] sm:text-label-caps text-tertiary uppercase font-bold">
            BƯỚC 01 / 04 • KHỞI ĐỘNG
          </span>
        </div>
        <div className="flex items-center gap-2">
          {playerProfile && (
            <button
              type="button"
              onClick={() => onOpenPlayerSetup?.('confirm')}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-950/70 hover:bg-purple-900/80 border border-purple-400/40 text-purple-200 text-[10px] font-bold cursor-pointer transition-all shadow-sm"
              title="Nhấn để đổi tên hoặc chọn lại nhân vật"
            >
              <img
                src={playerProfile.characterImage}
                alt={playerProfile.characterName}
                className="w-4 h-4 rounded-full object-contain bg-[#180c3a]"
              />
              <span className="truncate max-w-[120px] text-emerald-300">{playerProfile.playerName}</span>
              <span className="material-symbols-outlined text-[13px] text-emerald-400">tune</span>
            </button>
          )}
          <span className="text-[10px] sm:text-label-kicker text-secondary uppercase tracking-[0.14em]">
            SỞ GD&ĐT • MANABIE EDTECH
          </span>
        </div>
      </div>

      {/* Tiêu đề chương trình */}
      <div className="flex flex-col gap-0.5 ppt-stagger-1 shrink-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-on-surface uppercase leading-tight">
          CHƯƠNG TRÌNH BỒI DƯỠNG{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-fixed via-tertiary to-emerald-300">
            GIÁO VIÊN PHỔ THÔNG
          </span>
        </h1>
        <p className="text-xs sm:text-body-sm text-secondary-fixed-dim font-semibold">
          Triển khai thực hiện 12 tiết giáo dục trí tuệ nhân tạo cốt lõi
        </p>
      </div>

      {/* Mascot + Lời chào sư phạm + Hoạt cảnh kéo co với AI */}
      <div className="p-2.5 sm:p-3 rounded-xl bg-surface-container/85 border border-white/10 shadow-md flex items-center justify-between gap-3 ppt-stagger-2 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <img
            alt="Mascot Mana chào đón giáo viên"
            className="w-11 h-11 sm:w-13 sm:h-13 object-contain shrink-0 drop-shadow-[0_4px_12px_rgba(23,219,229,0.4)] ppt-mascot-enter"
            src={BRAND_MASCOTS.welcomeAnimated}
          />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-label-caps text-tertiary uppercase text-[10px] sm:text-[11px] font-bold">
                MANA TRỢ LÝ SƯ PHẠM
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-ping" />
            </div>
            <p className="text-xs sm:text-body-sm text-on-surface leading-snug">
              Cùng khám phá cách đưa giáo dục AI vào lớp học thông qua trò chơi kéo co giữa{' '}
              <strong className="text-tertiary font-bold">Đội Con người</strong> và{' '}
              <strong className="text-primary font-bold">Đội AI</strong>!
            </p>
          </div>
        </div>

        <img
          src={BRAND_MASCOTS.tugOfWarScene}
          alt="Hoạt cảnh Kéo co với AI"
          className="hidden md:block h-14 sm:h-16 w-auto object-contain shrink-0 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] tug-scene-live"
        />
      </div>

      {/* Bộ chọn chế độ điều khiển */}
      <div className="p-2 sm:p-2.5 rounded-xl bg-surface-container-high/70 border border-white/15 flex flex-col gap-1.5 ppt-stagger-3 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-label-caps text-tertiary uppercase flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold">
            <span className="material-symbols-outlined text-[15px]">tune</span>
            CHỌN PHƯƠNG THỨC TƯƠNG TÁC
          </span>
          <button
            type="button"
            onClick={onOpenQr}
            className="text-[10px] sm:text-label-kicker text-secondary underline cursor-pointer"
          >
            Chi tiết
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Option 1: Camera AR */}
          <button
            type="button"
            onClick={() => {
              audio.init();
              audio.playClick();
              onSelectControlMode('ar');
            }}
            className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
              controlMode === 'ar'
                ? 'bg-tertiary-container/35 border-tertiary shadow-[0_0_18px_rgba(23,219,229,0.3)]'
                : 'bg-surface-container-lowest/60 border-white/10 opacity-80 hover:opacity-100'
            }`}
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-tertiary/20 text-tertiary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">front_hand</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-body-sm font-bold text-on-surface">
                  Camera AR (Cử chỉ tay)
                </span>
                {controlMode === 'ar' && (
                  <span className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_#17dbe5]" />
                )}
              </div>
              <span className="text-[10px] sm:text-xs text-on-surface-variant block truncate">
                Đưa tay sang Trái / Phải để điều khiển
              </span>
            </div>
          </button>

          {/* Option 2: Click Chuột */}
          <button
            type="button"
            onClick={() => {
              audio.init();
              audio.playClick();
              onSelectControlMode('mouse');
            }}
            className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
              controlMode === 'mouse'
                ? 'bg-primary-container/45 border-primary shadow-[0_0_18px_rgba(184,196,255,0.3)]'
                : 'bg-surface-container-lowest/60 border-white/10 opacity-80 hover:opacity-100'
            }`}
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">touch_app</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-body-sm font-bold text-on-surface">
                  Chế độ Chuột / Cảm ứng
                </span>
                {controlMode === 'mouse' && (
                  <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#b8c4ff]" />
                )}
              </div>
              <span className="text-[10px] sm:text-xs text-on-surface-variant block truncate">
                Click chọn trực tiếp thẻ đáp án
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Action CTA Bar */}
      <div className="pt-0.5 ppt-stagger-4 shrink-0">
        <button
          type="button"
          onClick={onNext}
          className="pinch-host group w-full py-2.5 sm:py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-400 to-tertiary text-[#032117] text-xs sm:text-body-base font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(23,219,229,0.35)] hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
        >
          <PinchMark live />
          <span>TIẾP TỤC: XEM HƯỚNG DẪN CHƠI (BƯỚC 02)</span>
          <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * 02 - TRANG HƯỚNG DẪN CHƠI (GUIDE PAGE) — CHIA 2 BÊN, CÓ NÚT BẮT ĐẦU TEST AR
 * ============================================================================ */
function GuidePage({
  controlMode,
  onSelectControlMode,
  playerProfile,
  onOpenPlayerSetup,
  onBack,
  onStartGame,
}: {
  controlMode: ControlMode;
  onSelectControlMode?: (mode: ControlMode) => void;
  playerProfile: PlayerProfile | null;
  onOpenPlayerSetup: (step?: SetupStep) => void;
  onBack: () => void;
  onStartGame: (mode: ControlMode) => void;
}) {
  const [markerOffset, setMarkerOffset] = useState(0);
  const [isTestingAR, setIsTestingAR] = useState(false);
  const [isEnlarged, setIsEnlarged] = useState(false);

  useEffect(() => {
    let dir = 1;
    const timer = window.setInterval(() => {
      setMarkerOffset((prev) => {
        const next = prev + dir * 2.5;
        if (Math.abs(next) > 24) dir *= -1;
        return next;
      });
    }, 80);
    return () => clearInterval(timer);
  }, []);

  // Hỗ trợ phím Escape để thoát chế độ phóng to
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEnlarged) {
        setIsEnlarged(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnlarged]);

  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-2xl bg-surface-container-lowest/90 backdrop-blur-xl p-2.5 sm:p-3.5 md:p-4 overflow-hidden shadow-2xl border border-white/10 ppt-page-enter flex flex-col justify-between gap-2.5 h-full max-h-full">
      {/* Header & Telemetry */}
      <div className="flex flex-row items-center justify-between gap-2 pb-0.5 ppt-stagger-1 shrink-0">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high border border-white/10 mb-0.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary shadow-[0_0_8px_rgba(23,219,229,0.8)]" />
            <span className="text-[10px] sm:text-label-caps text-tertiary uppercase font-bold">
              BƯỚC 02 / 04 • QUY TẮC & LUẬT CHƠI
            </span>
          </div>
          <h1 className="text-base sm:text-xl md:text-2xl font-black text-on-surface uppercase leading-tight">
            HƯỚNG DẪN CHƠI{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-tertiary">
              AI TUG OF WAR
            </span>
          </h1>
        </div>

        {/* Telemetry gọn nhẹ */}
        <div className="flex items-center gap-2 sm:gap-3 bg-surface-container-low/90 backdrop-blur-md px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl shadow-md border border-white/10 shrink-0">
          <div className="flex flex-col items-start">
            <span className="text-[8.5px] sm:text-[9.5px] text-outline uppercase font-bold">Thời lượng</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-black font-mono text-tertiary leading-none">20</span>
              <span className="text-[9px] text-on-surface-variant font-bold">GIÂY/CÂU</span>
            </div>
          </div>
          <div className="w-px h-6 bg-surface-variant" />
          <div className="flex flex-col items-start">
            <span className="text-[8.5px] sm:text-[9.5px] text-outline uppercase font-bold">Lực kéo</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-black font-mono text-primary leading-none">+1.8</span>
              <span className="text-[9px] text-on-surface-variant font-bold">MÉT/ĐÚNG</span>
            </div>
          </div>
        </div>
      </div>

      {/* BỐ CỤC 2 BÊN: CỘT 1 (GOM 3 BƯỚC XẾP DỌC) & CỘT 2 (TEST CAMERA AR / SÂN KHẤU MÔ PHỎNG) */}
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3 flex-1 min-h-0">
        {/* CỘT 1 (5 PHẦN): GOM 3 BƯỚC HƯỚNG DẪN XẾP DỌC — THOÁNG MẮT, KHÔNG BỊ NÉN */}
        <div className="lg:col-span-5 flex flex-col justify-around gap-2 h-full min-h-0 ppt-stagger-2">
          {/* Step 1 */}
          <div className="rounded-xl bg-surface-container-low/90 border border-white/10 p-2 sm:p-2.5 flex items-center gap-2.5 sm:gap-3 shadow-sm hover:border-white/25 transition-colors">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary-container/30 border border-primary/30 p-1 flex items-center justify-center shrink-0">
              <img
                src={BRAND_MASCOTS.inspectAnimated}
                alt="01"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] sm:text-[10px] font-black text-primary px-1.5 py-0.2 rounded bg-primary-container/40 uppercase">
                  01 • QUAN SÁT
                </span>
                <span className="text-xs sm:text-sm font-bold text-white">ĐỌC TÌNH HUỐNG</span>
              </div>
              <p className="text-[11px] sm:text-xs text-on-surface-variant leading-snug">
                Phân tích xem công cụ có dùng <strong>Trí tuệ nhân tạo (AI)</strong> hay chỉ là <strong>Tự động hóa</strong>.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl bg-surface-container-low/90 border border-tertiary/30 p-2 sm:p-2.5 flex items-center gap-2.5 sm:gap-3 shadow-sm hover:border-tertiary/50 transition-colors">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-tertiary-container/30 border border-tertiary/30 p-1 flex items-center justify-center shrink-0">
              <img
                src={BRAND_MASCOTS.welcomeAnimated}
                alt="02"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] sm:text-[10px] font-black text-tertiary px-1.5 py-0.2 rounded bg-tertiary-container/40 uppercase">
                  02 • RA QUYẾT ĐỊNH
                </span>
                <span className="text-xs sm:text-sm font-bold text-white">CHỌN TRÁI / PHẢI</span>
              </div>
              <div className="text-[11px] sm:text-xs text-on-surface-variant leading-snug flex items-center gap-2 flex-wrap">
                <span>• <strong className="text-secondary">TRÁI (👈)</strong>: KHÔNG CÓ AI</span>
                <span className="text-outline-variant">|</span>
                <span>• <strong className="text-tertiary">PHẢI (👉)</strong>: CÓ DÙNG AI</span>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-xl bg-surface-container-low/90 border border-white/10 p-2 sm:p-2.5 flex items-center gap-2.5 sm:gap-3 shadow-sm hover:border-white/25 transition-colors">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 p-1 flex items-center justify-center shrink-0">
              <img
                src={BRAND_MASCOTS.actionAnimated}
                alt="03"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] sm:text-[10px] font-black text-emerald-400 px-1.5 py-0.2 rounded bg-emerald-500/25 uppercase">
                  03 • KÉO DÂY
                </span>
                <span className="text-xs sm:text-sm font-bold text-white">KÉO CO CHIẾN THẮNG</span>
              </div>
              <p className="text-[11px] sm:text-xs text-on-surface-variant leading-snug">
                Đúng: <strong>Đội Người +1.8m (+150đ)</strong>. Sai: <strong>Đội AI kéo lùi</strong>!
              </p>
            </div>
          </div>
        </div>

        {/* CỘT 2 (7 PHẦN): KHUNG THỬ NGHIỆM AR HOẶC SÂN KHẤU MÔ PHỎNG (KHI PHÓNG TO: TẠM THỜI OVERLAY PHẦN HƯỚNG DẪN) */}
        <div
          className={`${
            controlMode === 'ar' && isEnlarged
              ? 'absolute inset-0 z-30'
              : 'lg:col-span-7'
          } flex flex-col h-full min-h-0 ppt-stagger-3 transition-all duration-300`}
        >
          {controlMode === 'ar' ? (
            <div className={`relative rounded-xl ${isEnlarged ? 'bg-[#090e1c] shadow-2xl' : 'bg-surface-container-lowest/95 backdrop-blur-2xl'} border border-tertiary/40 p-2 sm:p-2.5 shadow-xl flex flex-col gap-1.5 h-full min-h-0 overflow-hidden`}>
              {/* Header của Khung Test AR */}
              <div className="flex items-center justify-between pb-1 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full ${isTestingAR ? 'bg-tertiary animate-ping' : 'bg-outline'}`} />
                  <span className="text-[10px] sm:text-label-caps text-tertiary font-bold uppercase truncate">
                    {isTestingAR ? 'THỬ NGHIỆM AR • PHẢN XẠ 10 MỤC TIÊU' : 'THỬ NGHIỆM CAMERA AR'}
                  </span>
                </div>

                <div className="flex items-center gap-1 sm:gap-1.5">
                  {/* NÚT PHÓNG TO / THU NHỎ DUY NHẤT (OVERLAY PHẦN HƯỚNG DẪN) */}
                  <button
                    type="button"
                    onClick={() => {
                      audio.playClick();
                      setIsEnlarged((prev) => !prev);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface text-[10px] sm:text-xs font-bold transition-all cursor-pointer border border-white/10"
                    title={isEnlarged ? 'Thu nhỏ về cột bên phải' : 'Phóng to che phần hướng dẫn'}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {isEnlarged ? 'close_fullscreen' : 'open_in_full'}
                    </span>
                    <span>{isEnlarged ? 'Thu nhỏ' : 'Phóng to'}</span>
                  </button>

                  {isTestingAR && (
                    <button
                      type="button"
                      onClick={() => {
                        audio.playClick();
                        setIsTestingAR(false);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface text-[10px] sm:text-xs font-bold transition-all cursor-pointer border border-white/10"
                      title="Tắt thử nghiệm"
                    >
                      <span className="material-symbols-outlined text-[15px]">videocam_off</span>
                      <span>Tắt test</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Nội dung bên trong: Màn hình chờ HOẶC Camera AR */}
              {!isTestingAR ? (
                <div className="relative flex-1 min-h-0 rounded-xl bg-surface-container/50 border border-white/10 flex flex-col items-center justify-center p-3 text-center gap-2.5 sm:gap-3">
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-tertiary/20 animate-ping opacity-60 pointer-events-none" />
                    <img
                      src={BRAND_MASCOTS.cameraWaitAnimated}
                      alt="Mana AR"
                      className="w-full h-full object-contain relative z-10 drop-shadow-[0_4px_12px_rgba(23,219,229,0.35)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1 max-w-sm">
                    <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
                      BẠN ĐÃ CHỌN ĐIỀU KHIỂN BẰNG CAMERA AR
                    </span>
                    <p className="text-[11px] sm:text-xs text-on-surface-variant leading-snug">
                      Bấm nút bên dưới để bật camera và thử đưa bàn tay ✋ chạm giữ các mục tiêu 1 giây trước khi vào trận.
                    </p>
                  </div>

                  {/* NÚT BẮT ĐẦU TEST AR DUY NHẤT (THEO YÊU CẦU: KHÔNG CÓ NÚT PHÓNG TO THỪA KẾ BÊN) */}
                  <button
                    type="button"
                    onClick={() => {
                      audio.init();
                      audio.playClick();
                      setIsTestingAR(true);
                    }}
                    className="pinch-host px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-emerald-400 via-tertiary to-emerald-300 text-[#032117] font-black text-xs sm:text-body-sm uppercase tracking-wider shadow-[0_6px_20px_rgba(23,219,229,0.4)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/20"
                  >
                    <PinchMark live />
                    <span className="material-symbols-outlined text-[18px]">videocam</span>
                    <span>BẮT ĐẦU THỬ NGHIỆM AR</span>
                  </button>
                </div>
              ) : (
                <div className="relative flex-1 min-h-0 flex flex-col">
                  <ARGestureTracker
                    enabled={true}
                    mode="minigame"
                    pointerImage={playerProfile?.characterImage}
                    pointerName={playerProfile?.characterName}
                    onStartGame={() => onStartGame('ar')}
                    onSelectSide={() => {}}
                    onFallbackToMouse={() => {
                      audio.playClick();
                      setIsTestingAR(false);
                      onSelectControlMode?.('mouse');
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="relative bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl p-2.5 sm:p-3 shadow-xl overflow-hidden border border-white/10 h-full min-h-0 flex flex-col justify-between">
              <div className="w-full flex justify-between items-center px-1 text-[8.5px] sm:text-[9.5px] text-outline relative z-20 font-bold uppercase">
                <span className="text-tertiary">◄ ĐỘI NGƯỜI (KHI ĐÚNG +1.8M)</span>
                <span className="text-error px-2 py-0.5 rounded-full bg-error-container/40 border border-error/40 text-[8.5px]">
                  VẠCH TÂM 0.0M
                </span>
                <span className="text-secondary">ĐỘI AI (KHI SAI -1.5M) ►</span>
              </div>

              <div className="relative flex-1 flex items-center justify-center overflow-hidden rounded-lg bg-surface-container/60 border border-white/5 py-1 my-1">
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-error/80 z-10 pointer-events-none" />
                <div
                  className="relative z-20 transition-transform duration-150 flex items-center justify-center"
                  style={{ transform: `translateX(${markerOffset}px)` }}
                >
                  <img
                    src={BRAND_MASCOTS.tugOfWarScene}
                    alt="Hoạt cảnh Kéo co Đội Con Người vs Đội AI"
                    className="h-24 sm:h-32 md:h-36 max-w-full w-auto object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.65)] tug-scene-live"
                  />
                </div>
              </div>

              <div className="p-2 rounded-lg bg-surface-container-high/60 border border-white/5 flex items-center justify-between text-[11px] text-on-surface-variant">
                <span>🖱️ Chế độ Chuột: Click trực tiếp vào 1 trong 2 đáp án hoặc dùng phím <strong>A</strong> / <strong>D</strong>.</span>
                <span className="text-tertiary font-bold">Sẵn sàng!</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* THANH ĐIỀU HƯỚNG & NÚT BẮT ĐẦU */}
      <div className="bg-surface-container-high/75 backdrop-blur-xl rounded-xl p-2 sm:p-2.5 border border-white/15 flex items-center justify-between gap-2 ppt-stagger-4 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-lowest/70 hover:bg-surface-container-lowest text-on-surface-variant hover:text-on-surface transition-all cursor-pointer border border-white/10 text-xs font-semibold"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Quay lại</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Nút hiển thị hoặc chọn hồ sơ người chơi & nhân vật đồng hành */}
          <button
            type="button"
            onClick={() => {
              audio.init();
              audio.playClick();
              onOpenPlayerSetup('name');
            }}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#241354]/90 hover:bg-[#311b6e] border border-purple-400/40 text-xs font-bold text-white transition-all cursor-pointer shadow-sm"
            title="Thiết lập tên và chọn nhân vật đồng hành"
          >
            <img
              src={playerProfile?.characterImage || PLAYER_CHARACTERS[0].image}
              alt={playerProfile?.characterName || PLAYER_CHARACTERS[0].name}
              className="w-6 h-6 rounded-lg object-contain bg-[#180c3a] shrink-0"
            />
            <span className="max-w-[120px] truncate text-emerald-300">
              {playerProfile ? playerProfile.playerName : 'Chọn nhân vật'}
            </span>
          </button>

          {/* Huy hiệu hiển thị phương thức chơi đã chọn ở Bước 1 */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface-container-lowest/80 border border-white/10 text-on-surface-variant text-xs font-semibold">
            <span className="text-outline uppercase text-[10px]">Chế độ:</span>
            <span
              className={`font-black flex items-center gap-1 ${
                controlMode === 'ar' ? 'text-tertiary' : 'text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {controlMode === 'ar' ? 'videocam' : 'mouse'}
              </span>
              {controlMode === 'ar' ? 'Camera AR' : 'Chuột'}
            </span>
          </div>

          {/* NÚT BẮT ĐẦU CHƠI DUY NHẤT */}
          <button
            type="button"
            onClick={() => onStartGame(controlMode)}
            className="pinch-host px-5 sm:px-7 py-2 sm:py-2.5 rounded-xl font-black text-xs sm:text-body-sm flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-400 via-tertiary to-emerald-300 text-[#032117] shadow-[0_6px_20px_rgba(23,219,229,0.45)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer uppercase tracking-wider"
          >
            <PinchMark live />
            <span>BẮT ĐẦU</span>
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 03 - TRANG ĐẤU TRƯỜNG KÉO CO (GAMEPLAY PAGE)
 * Thiết kế lại dễ nhìn, dễ tương tác, cố định chế độ đã chọn (không có nút bật/tắt AR)
 * ============================================================================ */
function GameplayPage({
  controlMode,
  onSelectControlMode,
  playerProfile,
  onFinish,
}: {
  controlMode: ControlMode;
  onSelectControlMode?: (mode: ControlMode) => void;
  playerProfile: PlayerProfile | null;
  onFinish: (stats: MatchStats) => void;
}) {
  const [questions] = useState<TugQuestion[]>(() => getShuffledQuestions());
  const [qIndex, setQIndex] = useState(0);
  const [selectedSide, setSelectedSide] = useState<'LEFT' | 'RIGHT' | null>(null);
  const [hoverSide, setHoverSide] = useState<GestureSide>(null);
  const [hoverProgress, setHoverProgress] = useState(0);
  const [hoverSource, setHoverSource] = useState<'hand' | 'face' | null>(null);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    message: string;
    sourceLabel: string;
    isTimeout?: boolean;
  } | null>(null);
  const [pedagogicalPopupOpen, setPedagogicalPopupOpen] = useState(false);

  const [humanScore, setHumanScore] = useState(150);
  const [aiScore, setAiScore] = useState(100);
  const [ropeMeters, setRopeMeters] = useState(1.2);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);

  // Hệ thống Chuỗi Thắng / Chuỗi Thua (Win / Lose Streaks)
  const [winStreak, setWinStreak] = useState(0);
  const [loseStreak, setLoseStreak] = useState(0);
  const [maxWinStreak, setMaxWinStreak] = useState(0);
  const [arenaShake, setArenaShake] = useState<'win' | 'lose' | null>(null);
  const [roundCountdown, setRoundCountdown] = useState<3 | 2 | 1 | null>(3);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [streakCallout, setStreakCallout] = useState<{
    id: number;
    type: 'win' | 'lose';
    count: number;
    title: string;
    subtitle: string;
    badge: string;
  } | null>(null);

  const questionStartRef = useRef<number>(performance.now());
  const matchStartRef = useRef<number>(performance.now());
  const reactionTimesRef = useRef<number[]>([]);
  const answeredListRef = useRef<AnswerRecord[]>([]);

  const currentQ = questions[qIndex] ?? questions[0];
  const isArMode = controlMode === 'ar';

  // Reset trạng thái và kích hoạt Overlay đếm ngược 3, 2, 1 trước khi bắt đầu chơi hoặc qua câu mới
  useEffect(() => {
    setTimeLeft(20);
    setSelectedSide(null);
    setHoverSide(null);
    setHoverProgress(0);
    setLocked(false);
    setFeedback(null);
    setPedagogicalPopupOpen(false);
    setArenaShake(null);
    setRoundCountdown(3);
    audio.playRoundCountdown(3);

    // Nhịp đếm ngược 3, 2, 1 đúng thời gian thực (1 giây/số)
    const t2 = window.setTimeout(() => {
      setRoundCountdown(2);
      audio.playRoundCountdown(2);
    }, 1000);

    const t1 = window.setTimeout(() => {
      setRoundCountdown(1);
      audio.playRoundCountdown(1);
    }, 2000);

    const tGo = window.setTimeout(() => {
      setRoundCountdown(null);
      audio.playRoundCountdown('GO');
      questionStartRef.current = performance.now();
    }, 3000);

    return () => {
      window.clearTimeout(t2);
      window.clearTimeout(t1);
      window.clearTimeout(tGo);
    };
  }, [qIndex]);

  // Điều chỉnh nhịp nhạc nền theo độ dài chuỗi hiện tại
  useEffect(() => {
    const baseIntensity = Math.min(0.85, 0.35 + Math.max(winStreak, loseStreak) * 0.14);
    audio.setIntensity(baseIntensity);
  }, [winStreak, loseStreak]);

  // Đếm ngược 20s mỗi câu (chỉ chạy sau khi hoàn tất đếm ngược 3, 2, 1) + Hiệu ứng âm thanh dồn dập 5 giây cuối
  useEffect(() => {
    if (locked || roundCountdown !== null) return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleLockAnswer(null, 'timeout');
          return 0;
        }
        const next = prev - 1;
        if (next <= 5) {
          audio.playUrgentTick(next);
          audio.setIntensity(Math.min(1, 0.72 + (5 - next) * 0.07));
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, roundCountdown, qIndex]);

  const handleLockAnswer = (
    choiceSide: 'LEFT' | 'RIGHT' | null,
    source: 'mouse' | 'hand' | 'face' | 'timeout'
  ) => {
    if (locked || roundCountdown !== null) return;
    setLocked(true);
    setSelectedSide(choiceSide);

    const elapsedSec = Math.max(0.8, (performance.now() - questionStartRef.current) / 1000);
    reactionTimesRef.current.push(Math.min(20, elapsedSec));

    // LEFT = KHÔNG CÓ AI (hasAI === false)
    // RIGHT = CÓ SỬ DỤNG AI (hasAI === true)
    const chosenHasAI = choiceSide === 'RIGHT';
    const isCorrect = choiceSide !== null && chosenHasAI === currentQ.hasAI;

    // Ghi nhận lịch sử câu hỏi phục vụ thống kê chi tiết sau trận đấu
    const userChoiceText =
      choiceSide === 'LEFT'
        ? 'Không có AI'
        : choiceSide === 'RIGHT'
        ? 'Có sử dụng AI'
        : 'Hết giờ (Không chọn)';
    const correctSideText = currentQ.hasAI ? 'Có sử dụng AI' : 'Không có AI';

    answeredListRef.current.push({
      questionId: currentQ.id,
      questionIndex: qIndex + 1,
      question: currentQ.question,
      topic: currentQ.topic,
      toolName: currentQ.toolName,
      image: currentQ.image,
      userChoice: choiceSide,
      userChoiceText,
      correctSide: currentQ.hasAI ? 'RIGHT' : 'LEFT',
      correctSideText,
      isCorrect,
      insight: currentQ.insight,
      timeSpentSec: +elapsedSec.toFixed(1),
    });

    const sourceLabel =
      source === 'hand'
        ? '✋ Vẫy tay AR'
        : source === 'face'
        ? '😊 Khuôn mặt AR'
        : source === 'mouse'
        ? '🖱️ Click chuột'
        : '⏰ Hết giờ';

    if (isCorrect) {
      const nextWin = winStreak + 1;
      const isWinStreak = nextWin >= 3;
      const comboBonusPts = isWinStreak ? (nextWin - 2) * 50 : 0;
      const gainedPts = 150 + comboBonusPts;
      const pullDelta = isWinStreak
        ? +(1.8 + Math.min(1.2, (nextWin - 2) * 0.4)).toFixed(1)
        : 1.8;

      setWinStreak(nextWin);
      setLoseStreak(0);
      setMaxWinStreak((m) => Math.max(m, nextWin));
      setArenaShake('win');
      window.setTimeout(() => setArenaShake(null), 650);
      audio.setIntensity(isWinStreak ? Math.min(1, 0.55 + (nextWin - 2) * 0.15) : 0.42);
      audio.playPullSuccess(nextWin);

      setHumanScore((s) => s + gainedPts);
      setRopeMeters((m) => Math.min(8, +(m + pullDelta).toFixed(1)));
      setCorrectCount((c) => c + 1);

      if (isWinStreak) {
        const streakLabel =
          nextWin >= 5
            ? `🌟 HUYỀN THOẠI CHUỖI THẮNG x${nextWin} • UNSTOPPABLE!`
            : nextWin === 4
            ? `⚡ SIÊU CHUỖI THẮNG x4 • ĐỒNG ĐỘI BỨT PHÁ!`
            : `🔥 CHUỖI THẮNG x3 • HAT-TRICK BÙNG NỔ!`;

        setStreakCallout({
          id: Date.now(),
          type: 'win',
          count: nextWin,
          title: streakLabel,
          subtitle: `Chuỗi ${nextWin} câu đúng liên tiếp! Thưởng +${comboBonusPts} PTS • Kéo mạnh +${pullDelta}m!`,
          badge: `🔥 STREAK x${nextWin}`,
        });
      } else {
        setStreakCallout(null);
      }

      setFeedback({
        correct: true,
        message: isWinStreak
          ? `CHUỖI THẮNG x${nextWin}! Kéo mạnh +${pullDelta}m (+${gainedPts} PTS gồm +${comboBonusPts} thưởng Streak)`
          : `CHÍNH XÁC! Đội Con Người kéo dây thêm +${pullDelta}m (+${gainedPts} PTS)`,
        sourceLabel,
        isTimeout: false,
      });
    } else {
      const nextLose = loseStreak + 1;
      const isLoseStreak = nextLose >= 3;
      const aiGainPts = isLoseStreak ? 120 + (nextLose - 2) * 40 : 120;
      const aiPullDelta = isLoseStreak
        ? +(1.5 + Math.min(0.9, (nextLose - 2) * 0.35)).toFixed(1)
        : 1.5;

      setLoseStreak(nextLose);
      setWinStreak(0);
      setArenaShake('lose');
      window.setTimeout(() => setArenaShake(null), 650);
      audio.setIntensity(isLoseStreak ? Math.min(1, 0.65 + (nextLose - 2) * 0.15) : 0.45);
      audio.playPullFail(nextLose);

      setAiScore((s) => s + aiGainPts);
      setRopeMeters((m) => Math.max(-8, +(m - aiPullDelta).toFixed(1)));

      if (isLoseStreak) {
        setStreakCallout({
          id: Date.now(),
          type: 'lose',
          count: nextLose,
          title: `🚨 BÁO ĐỘNG ĐỎ: CHUỖI THUA x${nextLose}!`,
          subtitle: `Đội AI thắng ${nextLose} câu liên tiếp (-${aiPullDelta}m) • Hãy bình tĩnh lật ngược thế cờ!`,
          badge: `⚡ AI STREAK x${nextLose}`,
        });
      } else {
        setStreakCallout(null);
      }

      setFeedback({
        correct: false,
        message: isLoseStreak
          ? `CHUỖI THUA x${nextLose}! Đội AI áp đảo kéo dây -${aiPullDelta}m`
          : choiceSide === null
          ? `HẾT GIỜ! Đội AI kéo dây lùi -${aiPullDelta}m`
          : `CHƯA CHÍNH XÁC! Đội AI phản công kéo dây -${aiPullDelta}m`,
        sourceLabel,
        isTimeout: choiceSide === null,
      });
    }

    // Mở PopUp giải nghĩa sư phạm sau 450ms (để người chơi kịp nhìn hiệu ứng giật dây kéo co sống động)
    window.setTimeout(() => {
      setPedagogicalPopupOpen(true);
    }, 450);
  };

  const handleNextQuestion = () => {
    audio.playClick();
    setPedagogicalPopupOpen(false);
    if (qIndex + 1 < questions.length) {
      setQIndex((i) => i + 1);
    } else {
      const matchElapsed = +(
        (performance.now() - matchStartRef.current) / 1000
      ).toFixed(1);
      const avgReact =
        reactionTimesRef.current.length > 0
          ? +(
              reactionTimesRef.current.reduce((a, b) => a + b, 0) /
              reactionTimesRef.current.length
            ).toFixed(1)
          : 3.5;
      onFinish({
        humanScore,
        aiScore,
        ropeMeters,
        correctCount,
        totalQuestions: questions.length,
        avgReactionSec: avgReact,
        maxWinStreak: Math.max(maxWinStreak, winStreak),
        totalDurationSec: matchElapsed,
        controlMode,
        sessionId: 'session-' + Date.now(),
        answers: answeredListRef.current,
        playerName: playerProfile?.playerName,
        characterId: playerProfile?.characterId,
        characterImage: playerProfile?.characterImage,
        characterName: playerProfile?.characterName,
      });
    }
  };

  // Phím tắt bàn phím: Chuyển câu khi mở PopUp Sư phạm (Enter / Phím cách / Mũi tên phải)
  useEffect(() => {
    if (!pedagogicalPopupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        setPedagogicalPopupOpen(false);
        handleNextQuestion();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pedagogicalPopupOpen]);

  // Phím tắt bàn phím: Chọn Trái (A/Left) hoặc Phải (D/Right) khi chơi chuột/phím
  useEffect(() => {
    if (locked || roundCountdown !== null || pedagogicalPopupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleLockAnswer('LEFT', 'mouse');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleLockAnswer('RIGHT', 'mouse');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, roundCountdown, pedagogicalPopupOpen, qIndex]);

  // Không tự động nhảy câu hỏi - chờ người dùng bấm nút "CÂU TIẾP THEO" để có thời gian đọc giải thích sư phạm
  const humanBarPercent = Math.max(15, Math.min(85, Math.round(50 + (ropeMeters / 8) * 38)));
  const ribbonTranslatePx = Math.round(-(ropeMeters / 8) * 165);

  return (
    <div className="relative flex flex-col w-full h-full max-h-full justify-between gap-1.5 sm:gap-2 select-none ppt-page-enter">
      {/* OVERLAY ĐẾM NGƯỢC 3, 2, 1 TRƯỚC KHI BẮT ĐẦU CHƠI HOẶC QUA CÂU MỚI */}
      {roundCountdown !== null && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[#060913]/85 backdrop-blur-md p-4"
          role="status"
          aria-live="assertive"
        >
          <div className="relative w-full max-w-lg rounded-3xl bg-surface-container-low/95 border-2 border-tertiary/50 shadow-[0_0_60px_rgba(23,219,229,0.35)] p-5 sm:p-7 flex flex-col items-center text-center gap-3.5 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(23,219,229,0.22),transparent_70%)] pointer-events-none" />

            {/* Badge trạng thái trận đấu / câu hỏi */}
            <div className="relative z-10 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary-container/40 border border-primary/40 text-primary text-label-caps uppercase">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-ping" />
              <span>
                {qIndex === 0
                  ? 'SẴN SÀNG BẮT ĐẦU TRÒ CHƠI'
                  : `CHUYỂN SANG CÂU MỚI • CÂU ${String(qIndex + 1).padStart(2, '0')} / ${String(
                      questions.length
                    ).padStart(2, '0')}`}
              </span>
            </div>

            {/* Hiển thị người chơi & nhân vật đồng hành đã chọn trong màn hình chờ */}
            {playerProfile && (
              <div className="relative z-10 inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-[#241354]/90 border border-emerald-400/50 shadow-md">
                <img
                  src={playerProfile.characterImage}
                  alt={playerProfile.characterName}
                  className="w-8 h-8 rounded-xl object-contain bg-[#180c3a] border border-white/15 shrink-0"
                />
                <div className="flex flex-col text-left">
                  <span className="text-xs font-black text-white leading-tight">
                    {playerProfile.playerName}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-300 leading-tight">
                    {playerProfile.characterName}
                  </span>
                </div>
              </div>
            )}

            {/* Chủ đề câu hỏi sắp tới */}
            <div className="relative z-10 flex flex-col gap-1">
              <span className="text-label-kicker text-tertiary uppercase font-bold">{currentQ.topic}</span>
              <p className="text-body-sm sm:text-body-base text-on-surface font-bold line-clamp-2 max-w-md">
                {currentQ.question}
              </p>
            </div>

            {/* Số đếm ngược 3 - 2 - 1 cỡ lớn */}
            <div className="relative z-10 my-1 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-surface-container-lowest/90 border-4 border-tertiary shadow-[0_0_40px_rgba(23,219,229,0.55)] flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-tertiary/40 animate-ping pointer-events-none" />
              <span
                key={roundCountdown}
                className="countdown-digit-anim font-metric-display text-[72px] sm:text-[80px] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-tertiary-fixed to-tertiary"
              >
                {roundCountdown}
              </span>
            </div>

            {/* Hướng dẫn ngắn theo chế độ đã chọn */}
            <div className="relative z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-container-high/80 border border-white/10 text-xs sm:text-body-sm text-on-surface-variant">
              <img
                src={playerProfile?.characterImage || BRAND_MASCOTS.welcomeAnimated}
                alt="Avatar"
                className="w-6 h-6 rounded-md object-contain shrink-0"
              />
              <span>
                {isArMode
                  ? 'Con trỏ ở giữa • Đưa bàn tay sang Trái (Không AI) / Phải (Có AI)'
                  : 'Chuẩn bị chọn đáp án: KHÔNG CÓ AI hoặc CÓ SỬ DỤNG AI'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KHUNG ĐẤU TRƯỜNG TOÀN DIỆN: BỌC TOÀN BỘ CÁC COMPONENT TRONG 1 KHUNG DUY NHẤT */}
      <section
        className={`w-full h-full max-h-full bg-surface-container-low/95 backdrop-blur-xl rounded-2xl p-2.5 sm:p-3.5 shadow-2xl flex flex-col justify-between gap-2 border transition-colors overflow-hidden ${
          arenaShake === 'win'
            ? 'arena-shake-win border-emerald-400/60'
            : arenaShake === 'lose'
            ? 'arena-shake-lose border-error/60'
            : timeLeft <= 5 && !locked
            ? 'border-error/70 shadow-[0_0_20px_rgba(255,180,171,0.28)]'
            : 'border-white/10'
        }`}
      >
        {/* HÀNG 1: HUD TỈ SỐ & ĐỒNG HỒ ĐẾM NGƯỢC */}
        <div className="flex items-center justify-between gap-2 px-1 shrink-0">
          {/* Đội Con Người + Avatar Nhân vật & Tên Người chơi */}
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={playerProfile?.characterImage || BRAND_MASCOTS.welcomeAnimated}
              alt={playerProfile?.characterName || 'Người chơi'}
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain rounded-xl bg-[#1e1148] border-2 border-emerald-400/70 p-0.5 shrink-0 shadow-[0_0_12px_rgba(52,211,153,0.35)]"
            />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] sm:text-xs text-white font-black uppercase tracking-wide truncate max-w-[130px] sm:max-w-[180px]">
                  {playerProfile ? playerProfile.playerName : 'ĐỘI NGƯỜI'}
                </span>
                {playerProfile && (
                  <span className="hidden md:inline-block px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-purple-500/30 text-purple-200 border border-purple-400/30 truncate max-w-[110px]">
                    {playerProfile.characterName}
                  </span>
                )}
                {winStreak >= 3 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-black bg-emerald-400 text-[#032117]">
                    🔥 x{winStreak}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-sm sm:text-base font-black text-tertiary leading-none">{humanScore}</span>
                <span className="text-[9px] text-tertiary/75 font-bold">PTS</span>
                <span className="text-[10px] text-tertiary font-bold ml-1">
                  ({ropeMeters >= 0 ? `+${ropeMeters}m` : `${ropeMeters}m`})
                </span>
              </div>
            </div>
          </div>

          {/* Vạch Trung Tâm: Tiến Độ & Đồng Hồ Đếm Ngược */}
          <div className="flex flex-col items-center gap-0.5 px-2 flex-1 max-w-xs sm:max-w-sm">
            <div className="flex items-center justify-between w-full text-[9.5px] font-bold">
              <span className="text-tertiary font-mono">CÂU {qIndex + 1}/{questions.length}</span>
              <div
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10.5px] font-black font-mono transition-all ${
                  timeLeft <= 5 && !locked
                    ? 'bg-error-container text-error border-error animate-bounce'
                    : 'bg-surface-container-lowest text-tertiary border-tertiary/40'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">timer</span>
                <span>{timeLeft}s</span>
              </div>
            </div>

            {/* Thanh Kéo Co Cân Bằng */}
            <div className="w-full h-2.5 bg-surface-container-lowest rounded-full p-0.5 relative overflow-hidden flex items-center border border-white/10">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/70 -translate-x-1/2 z-10" />
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-tertiary to-primary-container rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(23,219,229,0.5)]"
                style={{ width: `${humanBarPercent}%` }}
              />
            </div>
          </div>

          {/* Đội AI */}
          <div className="flex items-center gap-2 min-w-0 justify-end">
            <div className="flex flex-col text-right">
              <div className="flex items-center justify-end gap-1">
                {loseStreak >= 3 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[8.5px] font-black bg-rose-500 text-white">
                    ⚡ x{loseStreak}
                  </span>
                )}
                <span className="text-[9.5px] sm:text-[10.5px] text-secondary font-black uppercase tracking-wider">
                  ĐỘI AI BOTS
                </span>
              </div>
              <div className="flex items-baseline justify-end gap-1 font-mono">
                <span className="text-sm sm:text-base font-black text-secondary leading-none">{aiScore}</span>
                <span className="text-[9px] text-secondary/75 font-bold">PTS</span>
              </div>
            </div>
            <img
              src={BRAND_MASCOTS.aiAssistant3d}
              alt="AI"
              className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-xl bg-secondary-container/40 p-1 shrink-0"
            />
            {/* Nút nhỏ popup xem lại hướng dẫn */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setGuideModalOpen(true);
              }}
              className="ml-1 w-8 h-8 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-tertiary hover:text-white border border-tertiary/30 hover:border-tertiary flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Xem lại hướng dẫn cách chơi"
            >
              <span className="material-symbols-outlined text-[16px]">help_outline</span>
            </button>
          </div>
        </div>

        {/* HÀNG 2: SÂN KÉO CO PHÓNG TO RÕ NÉT (MỞ RỘNG DIỆN TÍCH, KHÔNG BỊ CO NHỎ) */}
        <div className="relative flex-1 min-h-[140px] max-h-[220px] rounded-xl bg-surface-container-lowest/80 overflow-hidden flex items-center justify-center px-2 sm:px-4 py-1.5 shadow-inner border border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_75%,rgba(57,90,210,0.25),transparent)] pointer-events-none" />

          {/* Nhãn Sân Người & Sân AI cố định ở mép trên */}
          <div className="absolute top-2 left-3 z-20 text-[9px] sm:text-[10.5px] font-black text-tertiary uppercase tracking-wider bg-surface-container-high/80 px-2.5 py-0.5 rounded-full border border-white/10 shadow-sm flex items-center gap-1.5">
            <span>◄ {playerProfile ? playerProfile.playerName : 'SÂN NGƯỜI'}</span>
          </div>

          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-0.5 rounded-full bg-surface-container-high/90 border border-white/15 text-on-surface font-mono text-[10px] sm:text-xs font-bold shadow-md">
            {ropeMeters > 0
              ? `NGƯỜI +${ropeMeters}M`
              : ropeMeters < 0
              ? `AI ${Math.abs(ropeMeters)}M`
              : 'VẠCH TÂM 0.0M'}
          </div>

          <div className="absolute top-2 right-3 z-20 text-[9px] sm:text-[10.5px] font-black text-secondary uppercase tracking-wider bg-surface-container-high/80 px-2.5 py-0.5 rounded-full border border-white/10 shadow-sm">
            SÂN AI ►
          </div>

          {/* Vạch laser đỏ cố định 0.0m */}
          <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-error/75 z-10 pointer-events-none" />

          {/* Nhân vật kéo co phóng to rõ nét, rung lắc kéo dây sống động */}
          <div className="relative z-20 w-full h-full flex items-center justify-center overflow-visible pointer-events-none">
            <div
              className="transition-transform duration-500 ease-out flex items-center justify-center"
              style={{ transform: `translateX(${ribbonTranslatePx}px)` }}
            >
              <div
                key={locked ? `jerk-${feedback?.correct ? 'win' : 'lose'}-${qIndex}` : `live-${qIndex}`}
                className={
                  locked
                    ? feedback?.correct
                      ? 'tug-scene-jerk-left'
                      : 'tug-scene-jerk-right'
                    : 'tug-scene-live'
                }
              >
                <img
                  src={BRAND_MASCOTS.tugOfWarScene}
                  alt="Hoạt cảnh Kéo co"
                  className="h-28 sm:h-36 md:h-44 max-h-full w-auto max-w-none object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* HÀNG 3: CÂU HỎI & ẢNH CÔNG CỤ 3D PHÓNG TO (BỌC TRỰC TIẾP TRONG KHUNG) */}
        <div className="border-t border-white/10 pt-2 pb-1 flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Ảnh 3D công cụ phóng to rõ nét */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-22 md:h-22 shrink-0 flex items-center justify-center group">
            <div className="absolute inset-1.5 bg-tertiary/20 rounded-full blur-xl pointer-events-none" />
            <img
              src={currentQ.image}
              alt={currentQ.toolName}
              className="w-full h-full object-contain relative z-10 filter drop-shadow-[0_6px_20px_rgba(0,0,0,0.65)] group-hover:scale-105 transition-transform"
            />
          </div>

          {/* Tiêu đề công cụ & Nội dung câu hỏi */}
          <div className="flex flex-col min-w-0 flex-1 justify-center gap-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary-container/50 border border-primary/40 text-primary text-[10px] sm:text-xs font-black uppercase tracking-wider">
                CÔNG CỤ {qIndex + 1}/{questions.length}: {currentQ.toolName}
              </span>
            </div>
            <h2 className="text-xs sm:text-sm md:text-base lg:text-lg text-white font-bold leading-snug line-clamp-2">
              {currentQ.question}
            </h2>
          </div>
        </div>

        {/* HÀNG 4: KHU VỰC TƯƠNG TÁC ĐÁP ÁN (BỌC CHUNG TRONG KHUNG - CHUỘT HOẶC AR, ĐÃ BỎ DESC) */}
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          {isArMode ? (
            <div className="w-full h-full min-h-[170px] max-h-[250px]">
              <ARGestureTracker
                enabled={true}
                mode="quiz"
                hideCamera={true}
                locked={locked || roundCountdown !== null}
                selectedSide={selectedSide}
                hasAI={currentQ.hasAI}
                pointerImage={playerProfile?.characterImage}
                pointerName={playerProfile?.characterName}
                onSelectSide={(side, source) => handleLockAnswer(side, source)}
                onFallbackToMouse={() => {
                  audio.playClick();
                  onSelectControlMode?.('mouse');
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 h-full max-h-[85px] sm:max-h-[105px]" role="radiogroup">
              {/* NÚT 1: KHÔNG CÓ AI (BÊN TRÁI - ĐÃ BỎ DESC) */}
              <button
                type="button"
                disabled={locked || roundCountdown !== null}
                onClick={() => handleLockAnswer('LEFT', 'mouse')}
                className={`lux-card group text-left relative rounded-xl p-2.5 sm:p-3 transition-all duration-300 flex items-center justify-between gap-2.5 cursor-pointer border-2 overflow-hidden ${
                  selectedSide === 'LEFT'
                    ? !currentQ.hasAI
                      ? 'bg-emerald-500/20 border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.45)]'
                      : 'bg-error-container/40 border-error shadow-[0_0_20px_rgba(255,180,171,0.4)]'
                    : hoverSide === 'LEFT'
                    ? 'bg-surface-container-highest border-tertiary shadow-[0_0_20px_rgba(23,219,229,0.35)] scale-[1.01]'
                    : 'bg-surface-container-high/65 hover:bg-surface-container-highest border-white/15 hover:border-white/35'
                }`}
              >
                {hoverSide === 'LEFT' && !locked && (
                  <div
                    className="absolute bottom-0 left-0 h-1 bg-tertiary transition-all duration-100"
                    style={{ width: `${hoverProgress}%` }}
                  />
                )}

                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-surface-container-highest/80 flex items-center justify-center text-secondary font-black text-sm border border-white/10 shrink-0">
                    👈
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs sm:text-base md:text-lg text-white font-black group-hover:text-tertiary transition-colors truncate">
                      KHÔNG CÓ AI
                    </span>
                    <span className="text-[10px] sm:text-xs text-on-surface-variant font-semibold truncate">
                      Click chọn hoặc bấm phím A
                    </span>
                  </div>
                </div>

                <div
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shrink-0 ${
                    selectedSide === 'LEFT'
                      ? !currentQ.hasAI
                        ? 'bg-emerald-400 text-[#032117]'
                        : 'bg-error text-on-error'
                      : 'bg-surface-variant text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px] font-bold">
                    {selectedSide === 'LEFT'
                      ? !currentQ.hasAI
                        ? 'check'
                        : 'close'
                      : 'radio_button_unchecked'}
                  </span>
                </div>
              </button>

              {/* NÚT 2: CÓ SỬ DỤNG AI (BÊN PHẢI - ĐÃ BỎ DESC) */}
              <button
                type="button"
                disabled={locked || roundCountdown !== null}
                onClick={() => handleLockAnswer('RIGHT', 'mouse')}
                className={`lux-card group text-right relative rounded-xl p-2.5 sm:p-3 transition-all duration-300 flex items-center justify-between gap-2.5 cursor-pointer border-2 overflow-hidden ${
                  selectedSide === 'RIGHT'
                    ? currentQ.hasAI
                      ? 'bg-emerald-500/20 border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.45)]'
                      : 'bg-error-container/40 border-error shadow-[0_0_20px_rgba(255,180,171,0.4)]'
                    : hoverSide === 'RIGHT'
                    ? 'bg-surface-container-highest border-tertiary shadow-[0_0_20px_rgba(23,219,229,0.35)] scale-[1.01]'
                    : 'bg-surface-container-high/65 hover:bg-surface-container-highest border-white/15 hover:border-white/35'
                }`}
              >
                <div
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shrink-0 ${
                    selectedSide === 'RIGHT'
                      ? currentQ.hasAI
                        ? 'bg-emerald-400 text-[#032117]'
                        : 'bg-error text-on-error'
                      : 'bg-surface-variant text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px] font-bold">
                    {selectedSide === 'RIGHT'
                      ? currentQ.hasAI
                        ? 'check'
                        : 'close'
                      : 'radio_button_unchecked'}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 min-w-0 justify-end">
                  <div className="flex flex-col min-w-0 text-right">
                    <span className="text-xs sm:text-base md:text-lg text-white font-black group-hover:text-tertiary transition-colors truncate">
                      CÓ SỬ DỤNG AI
                    </span>
                    <span className="text-[10px] sm:text-xs text-on-surface-variant font-semibold truncate">
                      Click chọn hoặc bấm phím D
                    </span>
                  </div>
                  <span className="w-8 h-8 rounded-lg bg-surface-container-highest/80 flex items-center justify-center text-tertiary font-black text-sm border border-white/10 shrink-0">
                    👉
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* POPUP GIẢI THÍCH SƯ PHẠM SAU KHI TRẢ LỜI / HẾT THỜI GIAN THEO YÊU CẦU */}
      {pedagogicalPopupOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 ppt-page-enter"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-2xl md:max-w-[720px] rounded-2xl bg-surface-container-lowest/95 border-2 border-tertiary/40 p-4 sm:p-5 md:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.9)] flex flex-col gap-3.5 sm:gap-4 max-h-[94vh] overflow-y-auto">
            {/* Banner trạng thái kết quả */}
            <div
              className={`p-3 sm:p-3.5 rounded-xl flex items-center justify-between gap-3 border ${
                feedback?.correct
                  ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'
                  : feedback?.isTimeout
                  ? 'bg-amber-950/50 border-amber-500/50 text-amber-300'
                  : 'bg-rose-950/50 border-rose-500/50 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <span className="material-symbols-outlined text-[28px] sm:text-[34px] shrink-0">
                  {feedback?.correct
                    ? 'check_circle'
                    : feedback?.isTimeout
                    ? 'schedule'
                    : 'cancel'}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm md:text-base font-black uppercase tracking-wide truncate">
                    {feedback?.message}
                  </span>
                  <span className="text-[11px] sm:text-xs opacity-85">
                    {feedback?.correct
                      ? 'Đội Con Người kéo dây +1.8m (+150 PTS)'
                      : 'Đội AI phản công kéo dây -1.5m'}
                  </span>
                </div>
              </div>
              <img
                src={feedback?.correct ? BRAND_MASCOTS.actionAnimated : BRAND_MASCOTS.giangGiai}
                alt="Mana Mascot"
                className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 object-contain shrink-0"
              />
            </div>

            {/* Thẻ Công cụ & Phân tích bản chất AI */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-surface-container-high/60 border border-white/10 flex items-center gap-3 sm:gap-3.5">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-container-highest p-1.5 shrink-0 flex items-center justify-center border border-white/10 shadow-sm">
                <img
                  src={currentQ.image}
                  alt={currentQ.toolName}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded bg-surface-container text-tertiary font-bold">
                    CÂU {qIndex + 1}/{questions.length}
                  </span>
                  <span className="text-sm sm:text-base font-bold text-white truncate">
                    {currentQ.toolName}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm">
                  <span className="text-on-surface-variant font-medium">Bản chất công cụ:</span>
                  <span
                    className={`font-black px-2.5 py-0.5 rounded-full text-xs sm:text-sm ${
                      currentQ.hasAI
                        ? 'bg-tertiary-container/50 text-tertiary border border-tertiary/40'
                        : 'bg-secondary-container/50 text-secondary border border-secondary/40'
                    }`}
                  >
                    {currentQ.hasAI ? '👉 CÓ SỬ DỤNG AI' : '👈 KHÔNG CÓ AI (TỰ ĐỘNG HÓA)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Phần giải nghĩa sư phạm cốt lõi - TẬP TRUNG TỐI ĐA (FOCUS NHẤT) */}
            <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-surface-container/95 via-surface-container to-surface-container/85 border-2 border-tertiary/40 shadow-[0_0_30px_rgba(23,219,229,0.15)] flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-tertiary text-xs sm:text-sm font-black uppercase tracking-wider">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#180c3a] border-2 border-emerald-400/60 p-0.5 flex items-center justify-center shrink-0 shadow-[0_0_14px_rgba(52,211,153,0.35)] overflow-hidden">
                  <img
                    src={playerProfile?.characterImage || BRAND_MASCOTS.welcomeAnimated}
                    alt={playerProfile?.characterName || 'Bạn đồng hành'}
                    className="w-full h-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
                  />
                </div>
                <span className="font-extrabold text-white text-xs sm:text-sm">GIẢI NGHĨA SƯ PHẠM</span>
                <span className="text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-400/30 font-bold ml-auto flex items-center gap-1">
                  <span>{playerProfile?.characterName || 'BẠN ĐỒNG HÀNH'}</span>
                </span>
              </div>
              <p className="text-sm sm:text-base md:text-[17px] font-semibold text-white/95 leading-relaxed sm:leading-loose tracking-wide">
                {currentQ.insight}
              </p>
            </div>

            {/* Nút bấm chuyển câu tiếp theo */}
            <button
              type="button"
              autoFocus
              onClick={() => {
                setPedagogicalPopupOpen(false);
                handleNextQuestion();
              }}
              className="pinch-host w-full py-2.5 sm:py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-400 via-tertiary to-emerald-300 text-[#032117] text-xs sm:text-sm md:text-base font-black uppercase tracking-wider shadow-[0_6px_25px_rgba(23,219,229,0.4)] hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/20"
            >
              <PinchMark live />
              <span>
                {qIndex + 1 < questions.length
                  ? 'CÂU TIẾP THEO (PHÍM SPACE / ENTER)'
                  : 'HOÀN THÀNH • XEM TỔNG KẾT TRẬN ĐẤU'}
              </span>
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}

      {/* POPUP XEM LẠI HƯỚNG DẪN CHƠI TRONG TRẬN ĐẤU */}
      {guideModalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
          onClick={() => setGuideModalOpen(false)}
        >
          <div
            className="bg-surface-container-high border border-white/20 rounded-2xl p-4 sm:p-6 max-w-lg w-full shadow-2xl flex flex-col gap-3.5 ppt-page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary text-[22px]">menu_book</span>
                <h3 className="text-headline-sm sm:text-headline-md text-on-surface font-bold">
                  HƯỚNG DẪN CHƠI AI TUG OF WAR
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGuideModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                title="Đóng"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2.5 text-body-sm text-on-surface-variant">
              <div className="p-2.5 rounded-xl bg-surface-container/70 border border-white/5 flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-lg bg-primary-container text-primary flex items-center justify-center text-label-caps font-bold shrink-0">
                  1
                </span>
                <div>
                  <strong className="text-on-surface block font-bold">Quan sát & Phân tích:</strong>
                  Đọc tình huống công cụ trên màn hình để xem công cụ đó có áp dụng Trí tuệ nhân tạo (AI) hay chỉ là Tự động hóa thông thường.
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-container/70 border border-white/5 flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-lg bg-secondary-container text-secondary flex items-center justify-center text-label-caps font-bold shrink-0">
                  2
                </span>
                <div>
                  <strong className="text-on-surface block font-bold">Chọn đáp án:</strong>
                  <span className="block text-secondary font-semibold">• TRÁI (👈): KHÔNG CÓ AI</span>
                  <span className="block text-tertiary font-semibold">• PHẢI (👉): CÓ SỬ DỤNG AI</span>
                  <span className="block text-outline text-[11px] mt-0.5">
                    {isArMode
                      ? 'Camera AR: Con trỏ đặt ở giữa trước mỗi câu, đưa bàn tay sang bên muốn chọn và giữ 1 giây.'
                      : 'Chuột: Click trực tiếp vào 1 trong 2 thẻ đáp án.'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-container/70 border border-white/5 flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-label-caps font-bold shrink-0">
                  3
                </span>
                <div>
                  <strong className="text-on-surface block font-bold">Kéo co & Tính điểm:</strong>
                  Trả lời đúng giúp Đội Con Người kéo dây <strong>+1.8m (+150 điểm)</strong>. Nếu sai hoặc hết giờ (20s), Đội AI sẽ giật dây ngược lại!
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setGuideModalOpen(false);
              }}
              className="mt-1 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-tertiary text-[#032117] font-bold text-body-base hover:brightness-110 transition-all cursor-pointer shadow-md"
            >
              ĐÃ HIỂU • TIẾP TỤC TRẬN ĐẤU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 04 - TRANG TỔNG KẾT CHUYÊN ĐỀ (SUMMARY PAGE)
 * Popup kết quả trận đấu ngay khi kết thúc trò chơi + Giao diện Tổng kết tối giản
 * ============================================================================ */
function SummaryPage({
  stats,
  playerProfile,
  onReplay,
  onHome,
}: {
  stats: MatchStats;
  playerProfile?: PlayerProfile | null;
  onReplay: () => void;
  onHome: () => void;
}) {
  const activeProfile =
    playerProfile ||
    (stats.playerName && stats.characterId
      ? {
          playerName: stats.playerName,
          characterId: stats.characterId,
          characterImage: stats.characterImage || getCharacterById(stats.characterId).image,
          characterName: stats.characterName || getCharacterById(stats.characterId).name,
        }
      : null);
  const activeChar = activeProfile ? getCharacterById(activeProfile.characterId) : null;
  const [victoryPopupOpen, setVictoryPopupOpen] = useState(true);
  const [summaryTab, setSummaryTab] = useState<'dashboard' | 'review'>('dashboard');
  const [filterMode, setFilterMode] = useState<'all' | 'correct' | 'wrong'>('all');

  // Cuộn trang lên đầu ngay khi vào trang Tổng kết và khóa cuộn nền khi Popup mở
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    if (victoryPopupOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [victoryPopupOpen]);

  const accuracy = Math.round((stats.correctCount / Math.max(1, stats.totalQuestions)) * 100);
  const humanWon = stats.humanScore >= stats.aiScore;
  const barWidth = Math.max(25, Math.min(85, Math.round(50 + (stats.ropeMeters / 8) * 35)));

  // Danh sách các câu hỏi đã làm (lấy từ lượt đấu thực hoặc câu hỏi mẫu ban đầu)
  const answersList: AnswerRecord[] =
    stats.answers && stats.answers.length > 0
      ? stats.answers
      : TUG_QUESTIONS.map((q, idx) => {
          const isCorrect = idx !== 2 && idx !== 6;
          const userChoice = (isCorrect
            ? (q.hasAI ? 'RIGHT' : 'LEFT')
            : (q.hasAI ? 'LEFT' : 'RIGHT')) as 'LEFT' | 'RIGHT';
          return {
            questionId: q.id,
            questionIndex: idx + 1,
            question: q.question,
            topic: q.topic,
            userChoice,
            userChoiceText: userChoice === 'RIGHT' ? 'Có sử dụng AI' : 'Không có AI',
            correctSide: (q.hasAI ? 'RIGHT' : 'LEFT') as 'LEFT' | 'RIGHT',
            correctSideText: q.hasAI ? 'Có sử dụng AI' : 'Không có AI',
            isCorrect,
            insight: q.insight,
            timeSpentSec: +(3.2 + (idx % 3) * 0.7).toFixed(1),
          };
        });

  const filteredAnswers = answersList.filter((a) => {
    if (filterMode === 'correct') return a.isCorrect;
    if (filterMode === 'wrong') return !a.isCorrect;
    return true;
  });

  const correctCount = answersList.filter((a) => a.isCorrect).length;
  const wrongCount = answersList.length - correctCount;

  return (
    <div className="flex flex-col w-full gap-3.5 sm:gap-4 relative ppt-page-enter">
      {/* POPUP KẾT QUẢ TRẬN ĐẤU HIỆN LÊN TRỰC TIẾP Ở GIỮA MÀN HÌNH (PORTAL RA DOCUMENT.BODY - KHÔNG BỊ TRÔI CUỘN) */}
      {victoryPopupOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-fadeIn"
            onClick={() => setVictoryPopupOpen(false)}
          >
            <div
              className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl sm:rounded-3xl bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-lowest p-4 sm:p-5 shadow-[0_32px_90px_rgba(0,0,0,0.75),0_0_50px_rgba(23,219,229,0.25)] border border-tertiary/40 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-tertiary/15 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col sm:flex-row items-center gap-3 mb-2.5 sm:mb-3">
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 flex items-center justify-center rounded-xl sm:rounded-2xl bg-[#180d33] border-2 border-emerald-400/50 p-1 overflow-hidden shadow-[0_0_20px_rgba(52,211,153,0.35)]">
                  {activeChar ? (
                    <CharacterAvatar
                      character={activeChar}
                      className="w-full h-full drop-shadow-[0_4px_10px_rgba(52,211,153,0.45)]"
                    />
                  ) : (
                    <img
                      src={BRAND_MASCOTS.welcomeAnimated}
                      alt="Mana Chúc mừng"
                      className="w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(23,219,229,0.4)]"
                    />
                  )}
                </div>

                <div className="text-center sm:text-left min-w-0">
                  <div className="inline-flex items-center gap-1.5 mb-0.5 text-tertiary">
                    <span className="material-symbols-outlined text-[16px]">emoji_events</span>
                    <span className="text-[10px] sm:text-label-caps uppercase truncate">
                      {activeProfile
                        ? `NGƯỜI CHƠI: ${activeProfile.playerName} • ${activeChar?.name}`
                        : 'KẾT QUẢ MÔ PHỎNG SƯ PHẠM'}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-on-surface uppercase leading-tight">
                    TỔNG KẾT:{' '}
                    <span className="text-tertiary">
                      {humanWon ? 'ĐỘI NGƯỜI CHIẾN THẮNG!' : 'TRẬN ĐẤU CÂN SỨC!'}
                    </span>
                  </h2>
                </div>
              </div>

              <p className="text-xs sm:text-body-sm text-on-surface-variant leading-snug mb-2.5 sm:mb-3">
                Tinh thần đồng đội và tư duy phản biện công nghệ đã làm chủ AI xuất sắc! Thầy cô luôn giữ vai trò định hướng sư phạm cốt lõi.
              </p>

              {/* Thanh kéo co kết quả trong Popup */}
              <div className="bg-surface-container-lowest/90 rounded-xl p-2.5 border border-white/10 mb-3">
                <div className="flex justify-between items-center mb-1 text-[9px] sm:text-label-kicker uppercase">
                  <span className="text-tertiary font-bold">
                    ĐỘI NGƯỜI ({stats.ropeMeters >= 0 ? `+${stats.ropeMeters}M` : `${stats.ropeMeters}M`})
                  </span>
                  <span className="text-on-surface-variant font-mono">VẠCH TÂM 0.0M</span>
                  <span className="text-secondary font-bold">ĐỘI AI</span>
                </div>
                <div className="h-2.5 w-full bg-surface-variant rounded-full relative overflow-hidden flex border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-tertiary to-primary-container rounded-full transition-all duration-1000"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/60 -translate-x-1/2" />
                </div>
              </div>

              {/* Nút đóng Popup để xem Dashboard hoặc Thống kê câu hỏi */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onReplay}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold transition-colors cursor-pointer border border-white/10 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">replay</span>
                  <span>Chơi lại</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setSummaryTab('review');
                    setVictoryPopupOpen(false);
                  }}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold transition-colors cursor-pointer border border-white/10 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">fact_check</span>
                  <span>Xem Thống kê</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setSummaryTab('dashboard');
                    setVictoryPopupOpen(false);
                  }}
                  className="pinch-host w-full sm:w-auto px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-tertiary to-emerald-300 text-[#032117] text-xs sm:text-body-sm font-black uppercase tracking-wide shadow-[0_0_20px_rgba(251,191,36,0.45)] hover:brightness-110 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">emoji_events</span>
                  <span>XEM DASHBOARD & TOP 1-2-3</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* THANH ĐIỀU HƯỚNG TỔNG KẾT VỚI TAB DASHBOARD & THỐNG KÊ CHI TIẾT */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-surface-container-low/85 backdrop-blur-xl px-3 sm:px-4 py-2 rounded-xl shadow-md border border-white/10 ppt-stagger-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary text-[9.5px] sm:text-label-kicker uppercase font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
            BƯỚC 04 / 04 • TỔNG KẾT & THỐNG KÊ
          </span>
        </div>

        {/* 2 TAB CHUYỂN ĐỔI: DASHBOARD GOLIVE & THỐNG KÊ CHI TIẾT CÂU HỎI */}
        <div className="flex items-center bg-surface-container-high/90 rounded-xl p-1 gap-1 border border-white/10">
          <button
            type="button"
            onClick={() => {
              audio.playClick();
              setSummaryTab('dashboard');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-bold transition-all cursor-pointer ${
              summaryTab === 'dashboard'
                ? 'bg-gradient-to-r from-amber-400 to-tertiary text-[#032117] shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">leaderboard</span>
            <span className="text-[11px] sm:text-body-sm">DASHBOARD GOLIVE & TOP 1-2-3</span>
          </button>

          <button
            type="button"
            onClick={() => {
              audio.playClick();
              setSummaryTab('review');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-bold transition-all cursor-pointer ${
              summaryTab === 'review'
                ? 'bg-primary-container text-on-primary-container shadow-[0_0_15px_rgba(57,90,210,0.4)]'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">fact_check</span>
            <span className="text-[11px] sm:text-body-sm">THỐNG KÊ CHI TIẾT CÂU HỎI</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setVictoryPopupOpen(true)}
          className="text-[10px] sm:text-label-kicker text-tertiary hover:underline uppercase cursor-pointer flex items-center gap-1 font-bold"
        >
          <span className="material-symbols-outlined text-[15px]">emoji_events</span>
          <span>Xem lại Popup</span>
        </button>
      </div>

      {/* NỘI DUNG CHÍNH THEO TAB ĐÃ CHỌN */}
      {summaryTab === 'dashboard' ? (
        <div className="flex flex-col gap-3.5 w-full">
          {/* COMPONENT DASHBOARD & BẢNG VINH DANH TOP 1-2-3 (ĐÃ LƯỢC BỎ CÁC BỤC TO) */}
          <DashboardLeaderboard currentStats={stats} />

          {/* Nút hành động chân trang */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-surface-container-low/90 border border-white/10 shadow-lg">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onReplay}
                className="pinch-host inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-tertiary text-[#032117] font-black text-body-sm sm:text-headline-sm hover:brightness-110 shadow-[0_6px_20px_rgba(23,219,229,0.35)] transition-all cursor-pointer"
              >
                <PinchMark live />
                <span>CHƠI LẠI TRẬN MỚI</span>
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">replay</span>
              </button>
              <button
                type="button"
                onClick={onHome}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-3 rounded-xl bg-surface-container-high text-on-surface text-body-sm sm:text-headline-sm hover:bg-surface-container-highest transition-all border border-white/10 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">home</span>
                <span>Về trang chủ</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setSummaryTab('review');
              }}
              className="text-tertiary hover:underline text-body-sm font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Xem Thống kê chi tiết từng câu hỏi</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 w-full ppt-stagger-2">
          {/* THANH THỐNG KÊ CHỈ SỐ GỌN GÀNG (ĐÃ THAY THẾ CÁC KHỐI TO TRƯỚC ĐÂY) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5 p-3 rounded-2xl bg-surface-container-low/95 border border-white/10 shadow-lg">
            <div className="flex flex-col p-2.5 rounded-xl bg-surface-container/60 border border-white/5">
              <span className="text-[9.5px] uppercase text-on-surface-variant font-bold">Điểm Con Người</span>
              <span className="text-headline-sm font-black text-tertiary font-mono">{stats.humanScore} pts</span>
              <span className="text-[10px] text-tertiary">
                Kéo dây: {stats.ropeMeters >= 0 ? `+${stats.ropeMeters}m` : `${stats.ropeMeters}m`}
              </span>
            </div>

            <div className="flex flex-col p-2.5 rounded-xl bg-surface-container/60 border border-white/5">
              <span className="text-[9.5px] uppercase text-on-surface-variant font-bold">Điểm AI Bots</span>
              <span className="text-headline-sm font-black text-secondary font-mono">{stats.aiScore} pts</span>
              <span className="text-[10px] text-on-surface-variant">Mô phỏng 12 tiết</span>
            </div>

            <div className="flex flex-col p-2.5 rounded-xl bg-surface-container/60 border border-white/5">
              <span className="text-[9.5px] uppercase text-on-surface-variant font-bold">Độ chính xác</span>
              <span className="text-headline-sm font-black text-primary font-mono">{accuracy}%</span>
              <span className="text-[10px] text-on-surface-variant">
                {stats.correctCount} / {stats.totalQuestions} câu đúng
              </span>
            </div>

            <div className="flex flex-col p-2.5 rounded-xl bg-surface-container/60 border border-white/5">
              <span className="text-[9.5px] uppercase text-on-surface-variant font-bold">Thời gian hoàn thành</span>
              <span className="text-headline-sm font-black text-amber-300 font-mono">{stats.totalDurationSec || 40.0}s</span>
              <span className="text-[10px] text-on-surface-variant">TB: {stats.avgReactionSec}s / câu</span>
            </div>

            <div className="col-span-2 sm:col-span-1 flex flex-col p-2.5 rounded-xl bg-surface-container/60 border border-white/5">
              <span className="text-[9.5px] uppercase text-on-surface-variant font-bold">Chuỗi thắng tối đa</span>
              <span className="text-headline-sm font-black text-emerald-400 font-mono">🔥 x{stats.maxWinStreak}</span>
              <span className="text-[10px] text-emerald-400 font-semibold">Streak bứt phá</span>
            </div>
          </div>

          {/* BANNER ĐỊNH HƯỚNG SƯ PHẠM MANABIE */}
          <div className="p-3 sm:p-4 rounded-xl bg-gradient-to-r from-surface-container-high/90 via-surface-container to-surface-container-lowest border border-tertiary/20 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-tertiary/20 text-tertiary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">psychology</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-tertiary tracking-wider block">
                  BẢNG THỐNG KÊ CHI TIẾT & ĐÁNH GIÁ SƯ PHẠM
                </span>
                <p className="text-xs sm:text-body-sm text-on-surface font-semibold">
                  Xem lại chi tiết từng tình huống đã trả lời để đối chiếu cách ứng dụng AI và phân tích sư phạm trong lớp học.
                </p>
              </div>
            </div>

            {/* BỘ LỌC CÂU HỎI */}
            <div className="flex items-center bg-surface-container-lowest/90 rounded-lg p-0.5 border border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded text-body-xs font-bold transition-all cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-surface-container-highest text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Tất cả ({answersList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('correct')}
                className={`px-2.5 py-1 rounded text-body-xs font-bold transition-all cursor-pointer ${
                  filterMode === 'correct'
                    ? 'bg-emerald-500/25 text-emerald-300 shadow-sm'
                    : 'text-on-surface-variant hover:text-emerald-300'
                }`}
              >
                ✅ Đúng ({correctCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('wrong')}
                className={`px-2.5 py-1 rounded text-body-xs font-bold transition-all cursor-pointer ${
                  filterMode === 'wrong'
                    ? 'bg-rose-500/25 text-rose-300 shadow-sm'
                    : 'text-on-surface-variant hover:text-rose-300'
                }`}
              >
                ❌ Chưa đúng ({wrongCount})
              </button>
            </div>
          </div>

          {/* DANH SÁCH CHI TIẾT TỪNG CÂU HỎI */}
          <div className="flex flex-col gap-3">
            {filteredAnswers.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-surface-container-low/70 border border-white/10 text-on-surface-variant">
                Không tìm thấy câu hỏi phù hợp với bộ lọc đã chọn.
              </div>
            ) : (
              filteredAnswers.map((ans) => {
                const isTimeout = ans.userChoice === null;
                return (
                  <div
                    key={ans.questionId}
                    className={`rounded-xl sm:rounded-2xl p-3.5 sm:p-4 border transition-all ${
                      ans.isCorrect
                        ? 'bg-emerald-950/15 border-emerald-500/35 shadow-[0_4px_16px_rgba(16,185,129,0.08)]'
                        : isTimeout
                        ? 'bg-amber-950/15 border-amber-500/35 shadow-[0_4px_16px_rgba(245,158,11,0.08)]'
                        : 'bg-rose-950/15 border-rose-500/35 shadow-[0_4px_16px_rgba(244,63,94,0.08)]'
                    }`}
                  >
                    {/* Header Thẻ Câu Hỏi */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-surface-container-high text-tertiary border border-white/10">
                          CÂU {String(ans.questionIndex).padStart(2, '0')} / {String(stats.totalQuestions).padStart(2, '0')}
                        </span>
                        <span className="text-[10.5px] sm:text-label-caps uppercase text-on-surface-variant tracking-wider font-bold">
                          {ans.topic}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {ans.timeSpentSec && (
                          <span className="text-[11px] font-mono text-on-surface-variant flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[13px]">timer</span>
                            {ans.timeSpentSec}s
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-black uppercase tracking-wide ${
                            ans.isCorrect
                              ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                              : isTimeout
                              ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                              : 'bg-rose-500/25 text-rose-300 border border-rose-400/50'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {ans.isCorrect ? 'check_circle' : isTimeout ? 'schedule' : 'cancel'}
                          </span>
                          <span>
                            {ans.isCorrect ? 'ĐÚNG (+150 PTS)' : isTimeout ? 'HẾT GIỜ (0 PTS)' : 'CHƯA ĐÚNG'}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Nội dung câu hỏi kèm hình minh họa công cụ */}
                    <div className="flex items-center gap-3 mb-2.5">
                      {ans.image && (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-highest/60 border border-white/10 p-1 shrink-0 flex items-center justify-center overflow-hidden">
                          <img
                            src={ans.image}
                            alt={ans.toolName || 'Minh họa công cụ'}
                            className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {ans.toolName && (
                          <span className="text-[10px] font-bold uppercase text-tertiary tracking-wider block mb-0.5">
                            {ans.toolName}
                          </span>
                        )}
                        <h4 className="text-body-sm sm:text-body-base font-bold text-on-surface leading-snug">
                          {ans.question}
                        </h4>
                      </div>
                    </div>

                    {/* So sánh Lựa chọn người chơi vs Đáp án chuẩn */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                      <div
                        className={`p-2.5 rounded-xl border flex items-center justify-between ${
                          ans.isCorrect
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-rose-500/10 border-rose-500/30'
                        }`}
                      >
                        <span className="text-[10.5px] uppercase text-on-surface-variant font-semibold">
                          Lựa chọn của bạn:
                        </span>
                        <span
                          className={`text-xs sm:text-body-sm font-black ${
                            ans.isCorrect ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {ans.userChoiceText}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl border bg-tertiary/10 border-tertiary/30 flex items-center justify-between">
                        <span className="text-[10.5px] uppercase text-on-surface-variant font-semibold">
                          Đáp án chuẩn sư phạm:
                        </span>
                        <span className="text-xs sm:text-body-sm font-black text-tertiary flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">verified</span>
                          {ans.correctSideText}
                        </span>
                      </div>
                    </div>

                    {/* Giải thích sư phạm (Manabie Insight) */}
                    <div className="p-2.5 sm:p-3 rounded-xl bg-surface-container-lowest/80 border border-white/10 flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-tertiary/20 text-tertiary flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[15px]">psychology</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-black uppercase text-tertiary tracking-wider">
                          GIẢI THÍCH SƯ PHẠM (MANABIE INSIGHT):
                        </span>
                        <p className="text-xs sm:text-body-sm text-on-surface-variant leading-relaxed">
                          {ans.insight}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Nút hành động chân trang của tab Thống kê */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-surface-container-low/90 border border-white/10 shadow-lg mt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onReplay}
                className="pinch-host inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-tertiary text-[#032117] font-black text-body-sm sm:text-headline-sm hover:brightness-110 shadow-[0_6px_20px_rgba(23,219,229,0.35)] transition-all cursor-pointer"
              >
                <PinchMark live />
                <span>CHƠI LẠI TRẬN MỚI</span>
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">replay</span>
              </button>
              <button
                type="button"
                onClick={onHome}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-3 rounded-xl bg-surface-container-high text-on-surface text-body-sm sm:text-headline-sm hover:bg-surface-container-highest transition-all border border-white/10 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">home</span>
                <span>Về trang chủ</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setSummaryTab('dashboard');
              }}
              className="text-tertiary hover:underline text-body-sm font-bold flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">leaderboard</span>
              <span>Xem Bảng xếp hạng Dashboard Golive</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
