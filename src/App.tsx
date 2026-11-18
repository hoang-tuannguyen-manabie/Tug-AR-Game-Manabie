import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ARGestureTracker, GestureSide } from './components/ARGestureTracker';
import { DashboardLeaderboard } from './components/DashboardLeaderboard';
import { HostDashboardPage } from './components/HostDashboardPage';
import { CharacterAvatar, PlayerSetupModal, SetupStep } from './components/PlayerSetupModal';
import { InteractionModePage } from './components/InteractionModePage';
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

export type PageStep = 'gioi-thieu' | 'che-do' | 'huong-dan' | 'tro-choi-keo-co' | 'tong-ket';
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
  'che-do': '02 • CHỌN PHƯƠNG THỨC TƯƠNG TÁC (AR / CHUỘT)',
  'huong-dan': '03 • QUY TẮC & LUẬT CHƠI KÉO CO CÙNG AI',
  'tro-choi-keo-co': '04 • ĐẤU TRƯỜNG KÉO CO CON NGƯỜI VS AI',
  'tong-ket': '05 • TỔNG KẾT & THỐNG KÊ CHI TIẾT',
};

const NAV_STEPS = [
  { id: 'gioi-thieu', num: '01', icon: 'flag', label: 'Giới thiệu', sub: 'Khởi động 12 tiết' },
  { id: 'che-do', num: '02', icon: 'tune', label: 'Chế độ', sub: 'AR / Chuột' },
  { id: 'huong-dan', num: '03', icon: 'menu_book', label: 'Hướng dẫn', sub: 'Luật chơi & Thử AR' },
  { id: 'tro-choi-keo-co', num: '04', icon: 'sports_kabaddi', label: 'Kéo co AI', sub: 'Người vs AI' },
  { id: 'tong-ket', num: '05', icon: 'emoji_events', label: 'Tổng kết', sub: 'Dashboard & Thống kê' },
] as const;

function PinchMark({ live }: { live?: boolean }) {
  return <span className={`pinch ${live ? 'pinch-live' : ''}`} aria-hidden="true" />;
}

/**
 * Kiểm tra xem URL hiện tại có đang trỏ đến trang /host (Dashboard tổng hợp cho admin/host) hay không.
 * Hỗ trợ linh hoạt cả path (/host), hash (#/host, #host) và query (?host, ?page=host)
 * nhằm hoạt động ổn định trên mọi môi trường máy chủ và static build.
 */
function checkIsHostRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  return (
    path === '/host' ||
    path.endsWith('/host') ||
    path.endsWith('/host/') ||
    hash === '#host' ||
    hash === '#/host' ||
    hash.startsWith('#/host') ||
    search.includes('page=host') ||
    search.includes('host=true') ||
    search === '?host'
  );
}

export default function App() {
  const [isHostView, setIsHostView] = useState<boolean>(() => checkIsHostRoute());
  const [page, setPage] = useState<PageStep>('gioi-thieu');
  const [controlMode, setControlMode] = useState<ControlMode>('ar');
  const [muted, setMuted] = useState(false);
  const [matchStats, setMatchStats] = useState<MatchStats>(INITIAL_STATS);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [gameSessionId, setGameSessionId] = useState(1);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // Quản lý hồ sơ người chơi & nhân vật đồng hành (36 nhân vật)
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(() =>
    loadSavedPlayerProfile()
  );
  // Tự động mở popup hồ sơ người chơi & nhân vật ngay từ khi mới vào đầu trang (bỏ qua nếu đang ở trang /host)
  const [playerSetupOpen, setPlayerSetupOpen] = useState(() => !checkIsHostRoute());
  const [playerSetupInitialStep, setPlayerSetupInitialStep] = useState<SetupStep>(() => {
    const saved = loadSavedPlayerProfile();
    return saved ? 'confirm' : 'name';
  });
  const [pendingGameLaunchMode, setPendingGameLaunchMode] = useState<ControlMode | null>(null);

  // Quản lý khóa các bước theo tuần tự (Mục 4 và Mục 5 ban đầu bị khóa)
  const [unlockedSteps, setUnlockedSteps] = useState<Record<PageStep, boolean>>({
    'gioi-thieu': true,
    'che-do': true,
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

  // Chuyển cảnh siêu nhẹ 1 lớp duy nhất (Lightweight Transition)
  const [transitionText, setTransitionText] = useState<string | null>(null);
  const [motionKey, setMotionKey] = useState(0);
  const transitionLockRef = useRef(false);

  const pageRef = useRef(page);
  pageRef.current = page;

  // Kích hoạt âm thanh nền nhẹ nhàng cho Trang 1, 2, 3 sau lần tương tác đầu tiên của người dùng
  useEffect(() => {
    const startAudioOnFirstInteraction = () => {
      audio.init();
      if (pageRef.current === 'gioi-thieu' || pageRef.current === 'che-do' || pageRef.current === 'huong-dan') {
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
    // Khi đã vào đấu trường kéo co, không cho phép bấm về các mục trước đó
    if (page === 'tro-choi-keo-co' && (target === 'gioi-thieu' || target === 'che-do' || target === 'huong-dan')) {
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
      } else if (target === 'gioi-thieu' || target === 'che-do' || target === 'huong-dan') {
        audio.playAmbientMusic();
      } else if (target === 'tong-ket') {
        audio.stopMusic();
        audio.playWin();
      } else {
        audio.stopMusic();
      }
    };

    setTransitionText(options?.customLabel ?? BRIDGE_LABELS[target]);
    window.setTimeout(() => {
      applyPageChange();
    }, 120);
    window.setTimeout(() => {
      setTransitionText(null);
      transitionLockRef.current = false;
    }, 380);
  };

  const replayCurrentPageMotion = () => {
    audio.init();
    audio.playClick();
    setTransitionText('XEM LẠI HIỆU ỨNG TRÌNH CHIẾU');
    window.setTimeout(() => {
      setMotionKey((k) => k + 1);
    }, 100);
    window.setTimeout(() => {
      setTransitionText(null);
    }, 380);
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

  const navigateToHost = () => {
    audio.init();
    audio.playClick();
    try {
      window.history.pushState(null, '', '/host');
    } catch {
      window.location.hash = '#/host';
    }
    setIsHostView(true);
  };

  const navigateToGame = () => {
    audio.init();
    audio.playClick();
    try {
      window.history.pushState(null, '', '/');
    } catch {
      window.location.hash = '';
    }
    setIsHostView(false);
  };

  // Đồng bộ trạng thái khi người dùng nhấn nút Back/Forward của trình duyệt hoặc đổi hash
  useEffect(() => {
    const handleLocationChange = () => {
      const isHost = checkIsHostRoute();
      setIsHostView(isHost);
      if (isHost) {
        setPlayerSetupOpen(false);
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // MÀN HÌNH HOST / ADMIN DASHBOARD ĐỘC LẬP TẠI ROUTE /host
  if (isHostView) {
    return <HostDashboardPage onNavigateToGame={navigateToGame} />;
  }

  return (
    <div
      className={`min-h-[100dvh] h-[100dvh] w-full flex flex-col justify-between relative selection:bg-primary selection:text-on-primary overflow-x-hidden ${
        page !== 'tong-ket' ? 'max-h-[100dvh] overflow-hidden' : ''
      }`}
    >
      {/* LỚP NỀN ATMOSPHERE ĐỒNG BỘ REPO THAM CHIẾU */}
      <div className="workshop-atmosphere" aria-hidden="true">
        <span className="workshop-grid" />
        <span className="workshop-scanline" />
      </div>

      {/* OVERLAY CHUYỂN CẢNH SIÊU NHẸ 1 LỚP DUY NHẤT */}
      {transitionText && (
        <div className="page-fade-overlay" aria-hidden="true">
          <b>{transitionText}</b>
        </div>
      )}

      {/* CỤM NÚT CÀI ĐẶT GÓC TRÊN BÊN PHẢI (ÂM THANH & TOÀN MÀN HÌNH) */}
      <div
        role="toolbar"
        aria-label="Cài đặt hệ thống"
        className="fixed top-2 right-2 sm:top-3.5 sm:right-3.5 z-50 flex items-center gap-1 sm:gap-1.5 p-0.5 sm:p-1.5 bg-white/95 backdrop-blur-md rounded-xl sm:rounded-2xl border border-[#bfdbfe] sm:border-2 shadow-[0_4px_14px_rgba(27,58,138,0.12)] select-none"
      >
        {/* Nút Bật/Tắt Âm thanh */}
        <button
          type="button"
          onClick={toggleMute}
          className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${
            muted ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'btn-mana-blue'
          }`}
          title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        >
          <span className="material-symbols-outlined text-[15px] sm:text-[19px]">
            {muted ? 'volume_off' : 'volume_up'}
          </span>
        </button>

        {/* Nút Toàn màn hình */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-white hover:bg-[#eaf2ff] text-on-surface border border-[#bfdbfe] flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-xs"
          title="Toàn màn hình"
        >
          <span className="material-symbols-outlined text-[15px] sm:text-[19px]">fullscreen</span>
        </button>
      </div>

      {/* NỘI DUNG TỪNG TRANG TOÀN MÀN HÌNH - KHÔNG BO VIỀN NGOÀI, KHÔNG PADDING TRỐNG */}
      <main
        key={motionKey}
        className={`w-full h-full flex-1 ${
          page === 'tong-ket'
            ? 'pt-3 pb-8 overflow-y-auto px-2 sm:px-4'
            : 'overflow-hidden p-0'
        } flex flex-col justify-between`}
      >
        <div className="w-full h-full flex flex-col">
          {page === 'gioi-thieu' && (
            <WelcomePage
              playerProfile={playerProfile}
              onOpenPlayerSetup={(step = 'name') => {
                setPendingGameLaunchMode(controlMode);
                setPlayerSetupInitialStep(step);
                setPlayerSetupOpen(true);
              }}
              onNext={() => {
                unlockStep('che-do');
                triggerPageTransition('che-do');
              }}
              onOpenQr={() => setQrModalOpen(true)}
            />
          )}

          {page === 'che-do' && (
            <InteractionModePage
              controlMode={controlMode}
              onSelectControlMode={setControlMode}
              playerProfile={playerProfile}
              onOpenPlayerSetup={() => {
                setPendingGameLaunchMode(controlMode);
                setPlayerSetupInitialStep('confirm');
                setPlayerSetupOpen(true);
              }}
              onBack={() => triggerPageTransition('gioi-thieu')}
              onNext={() => {
                unlockStep('huong-dan');
                triggerPageTransition('huong-dan');
              }}
              onDirectPlay={() => {
                unlockStep('tro-choi-keo-co');
                triggerPageTransition('tro-choi-keo-co', {
                  modeOverride: controlMode,
                  isLaunchGame: true,
                  forceUnlock: true,
                });
              }}
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
              onBack={() => triggerPageTransition('che-do')}
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
          className="fixed inset-0 z-50 bg-[#1b3a8a]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className="bg-white border-3 sm:border-4 border-[#2563eb] rounded-2xl sm:rounded-3xl p-4 sm:p-5 max-w-md w-full max-h-[96dvh] overflow-hidden text-center shadow-2xl flex flex-col items-center gap-2.5 ppt-page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={BRAND_MASCOTS.welcomeAnimated}
              alt="Mana Mascot"
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
            />
            <span className="mana-keep-white text-[10px] sm:text-label-caps text-white px-2.5 py-0.5 rounded-full bg-[#2563eb] font-black uppercase">
              HỆ THỐNG TƯƠNG TÁC LỚP HỌC
            </span>
            <h3 className="text-sm sm:text-base md:text-lg font-black text-[#1b3a8a]">
              Hai chế độ điều khiển linh hoạt
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-semibold">
              • <strong>Camera AR (Cử chỉ bàn tay)</strong>: Đưa bàn tay sang trái hoặc phải trước webcam để điều khiển.<br />
              • <strong>Chế độ Chuột & Cảm ứng</strong>: Click trực tiếp vào màn hình tương tác hoặc chuột máy chiếu.
            </p>
            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="mt-1 px-6 py-2 rounded-full btn-mana-orange text-xs sm:text-sm font-black cursor-pointer uppercase"
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
  playerProfile,
  onOpenPlayerSetup,
  onNext,
  onOpenQr,
}: {
  playerProfile: PlayerProfile | null;
  onOpenPlayerSetup: (step?: SetupStep) => void;
  onNext: () => void;
  onOpenQr: () => void;
}) {
  return (
    <div className="relative w-full h-full flex flex-col justify-between gap-2 sm:gap-3 landscape:gap-1.5 p-3 sm:p-5 md:p-6 landscape:p-2 overflow-hidden ppt-page-enter">
      {/* Cổng Morph Portal */}
      <div className="workshop-morph-gate" aria-hidden="true">
        <i>AI</i>
        <b>ĐẤU TRƯỜNG KÉO CO</b>
      </div>

      {/* Top bar chip */}
      <div className="flex items-center justify-between pb-0.5 ppt-stagger-1 shrink-0 pr-[76px] sm:pr-28">
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#ebf9f1] border-2 border-[#16a34a] shadow-xs">
          <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
          <span className="text-[10px] sm:text-label-caps text-[#15803d] uppercase font-black">
            BƯỚC 01 / 05 • KHỞI ĐỘNG
          </span>
        </div>
        <div className="flex items-center gap-2">
          {playerProfile && (
            <button
              type="button"
              onClick={() => onOpenPlayerSetup?.('confirm')}
              className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#ebf9f1] hover:bg-[#dcfce7] border-2 border-[#16a34a] text-[#1b3a8a] text-[10px] font-black cursor-pointer transition-all shadow-xs"
              title="Nhấn để đổi tên hoặc chọn lại nhân vật"
            >
              <img
                src={playerProfile.characterImage}
                alt={playerProfile.characterName}
                className="w-4 h-4 rounded-full object-contain bg-white border border-[#86efac]"
              />
              <span className="truncate max-w-[100px] sm:max-w-[140px] text-[#15803d]">{playerProfile.playerName}</span>
              <span className="material-symbols-outlined text-[13px] text-[#16a34a]">tune</span>
            </button>
          )}
          <span className="hidden sm:inline-block text-[10px] sm:text-label-kicker text-secondary uppercase tracking-[0.12em] font-black">
            SỞ GD&ĐT • MANABIE EDTECH
          </span>
        </div>
      </div>

      {/* Tiêu đề chương trình */}
      <div className="flex flex-col gap-0.5 ppt-stagger-1 shrink-0">
        <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl landscape:text-sm font-black text-on-surface uppercase leading-tight">
          CHƯƠNG TRÌNH BỒI DƯỠNG{' '}
          <span className="text-[#2563eb]">
            GIÁO VIÊN PHỔ THÔNG
          </span>
        </h1>
        <p className="text-xs sm:text-sm md:text-base lg:text-lg landscape:text-[10px] text-on-surface-variant font-bold">
          Triển khai thực hiện 12 tiết giáo dục trí tuệ nhân tạo cốt lõi
        </p>
      </div>

      {/* Mascot + Lời chào sư phạm + Hoạt cảnh kéo co với AI trên nền chia đôi Pastel Mana */}
      <div className="flex-1 min-h-0 p-3 sm:p-5 md:p-6 landscape:p-2 rounded-3xl mana-split-arena flex flex-col justify-between gap-3 sm:gap-4 ppt-stagger-2 overflow-hidden">
        {/* Lời chào & thông tin sư phạm phía trên */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <img
            alt="Mascot Mana chào đón giáo viên"
            className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 landscape:w-10 landscape:h-10 object-contain shrink-0 drop-shadow-[0_6px_14px_rgba(27,58,138,0.22)] ppt-mascot-enter"
            src={BRAND_MASCOTS.welcomeAnimated}
          />
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-label-caps text-[#15803d] uppercase text-xs sm:text-sm font-black px-3 py-0.5 rounded-full bg-white/80 border border-[#86efac] shadow-xs">
                MANA TRỢ LÝ SƯ PHẠM
              </span>
              <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-ping" />
            </div>
            <p className="text-xs sm:text-base md:text-lg lg:text-xl landscape:text-xs text-on-surface font-semibold leading-snug">
              Cùng khám phá cách đưa giáo dục AI vào lớp học thông qua trò chơi kéo co đối kháng giữa{' '}
              <strong className="text-[#15803d] font-black underline decoration-2 decoration-[#16a34a]">Đội Con người</strong> và{' '}
              <strong className="text-[#2563eb] font-black underline decoration-2 decoration-[#2563eb]">Đội AI</strong>!
            </p>
          </div>
        </div>

        {/* KHUNG HOẠT CẢNH KÉO CO CỠ LỚN NỔI BẬT Ở TRUNG TÂM */}
        <div className="flex-1 min-h-0 flex items-center justify-center relative p-2 sm:p-3 md:p-4 rounded-2xl bg-white/70 backdrop-blur-xs border border-white/80 shadow-inner overflow-hidden">
          <img
            src={BRAND_MASCOTS.tugOfWarScene}
            alt="Hoạt cảnh Kéo co giữa Con người và AI"
            className="w-full max-w-[620px] h-auto max-h-full object-contain drop-shadow-[0_8px_20px_rgba(27,58,138,0.2)] tug-scene-live"
          />
        </div>

        {/* Chú thích thông tin 2 đội */}
        <div className="flex items-center justify-between text-[11px] sm:text-xs md:text-sm lg:text-base font-bold text-slate-600 px-2 shrink-0">
          <span className="flex items-center gap-1.5 text-[#15803d]">
            <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
            Đội Con Người: Vận dụng kiến thức nhận diện AI
          </span>
          <span className="flex items-center gap-1.5 text-[#1d4ed8]">
            <span className="w-2 h-2 rounded-full bg-[#2563eb]" />
            Đội AI: Đối thủ máy tính với sức kéo tự động
          </span>
        </div>
      </div>

      {/* Action CTA Bar - Nút Cam 3D kiểu Mana Oẳn Tù Xì */}
      <div className="pt-0.5 ppt-stagger-4 shrink-0">
        <button
          type="button"
          onClick={onNext}
          className="btn-mana-orange group w-full py-3 sm:py-3.5 lg:py-4 landscape:py-2 px-5 rounded-full text-xs sm:text-base lg:text-lg font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
        >
          <PinchMark live />
          <span>TIẾP TỤC: CHỌN PHƯƠNG THỨC TƯƠNG TÁC (BƯỚC 02)</span>
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
    <div className="relative w-full h-full flex flex-col justify-between gap-2 sm:gap-2.5 landscape:gap-1.5 p-2.5 sm:p-4 md:p-5 landscape:p-2 overflow-hidden ppt-page-enter">
      {/* Header & Telemetry */}
      <div className="flex flex-row items-center justify-between gap-2 pb-0.5 ppt-stagger-1 shrink-0 pr-[76px] sm:pr-28">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#eaf2ff] border-2 border-[#2563eb] mb-0.5 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563eb]" />
            <span className="text-[10px] sm:text-xs md:text-sm text-[#1b3a8a] uppercase font-black">
              BƯỚC 03 / 05 • QUY TẮC & LUẬT CHƠI
            </span>
          </div>
          <h1 className="text-base sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl landscape:text-sm font-black text-on-surface uppercase leading-tight">
            HƯỚNG DẪN CHƠI{' '}
            <span className="text-[#f47920]">
              KÉO CO CÙNG AI
            </span>
          </h1>
        </div>

        {/* Telemetry gọn nhẹ */}
        <div className="hidden sm:flex items-center gap-2 sm:gap-3 bg-surface-container px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-2xl shadow-xs border-2 border-[#bfdbfe] shrink-0">
          <div className="flex flex-col items-start">
            <span className="text-[8.5px] sm:text-[9.5px] text-on-surface-variant uppercase font-bold">Thời lượng</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-black font-mono text-[#16a34a] leading-none">30</span>
              <span className="text-[9px] text-on-surface-variant font-bold">GIÂY/CÂU</span>
            </div>
          </div>
          <div className="w-px h-6 bg-[#cbd5e1]" />
          <div className="flex flex-col items-start">
            <span className="text-[8.5px] sm:text-[9.5px] text-on-surface-variant uppercase font-bold">Lực kéo</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-black font-mono text-[#2563eb] leading-none">+1.8</span>
              <span className="text-[9px] text-on-surface-variant font-bold">MÉT/ĐÚNG</span>
            </div>
          </div>
        </div>
      </div>

      {/* BỐ CỤC 2 BÊN: CỘT 1 (GOM 3 BƯỚC XẾP DỌC) & CỘT 2 (TEST CAMERA AR / SÂN KHẤU MÔ PHỎNG) */}
      <div className="relative grid grid-cols-1 md:grid-cols-12 landscape:grid-cols-12 gap-2 sm:gap-3 landscape:gap-2 flex-1 min-h-0 overflow-y-auto md:overflow-hidden landscape:overflow-hidden">
        {/* CỘT 1 (5 PHẦN): GOM 2 BƯỚC HƯỚNG DẪN XẾP DỌC */}
        <div className="md:col-span-5 landscape:col-span-5 flex flex-col justify-center gap-3 sm:gap-4 landscape:gap-2 h-full min-h-0 ppt-stagger-2">
          {/* Step 1 */}
          <div className="rounded-2xl bg-[#eaf2ff] border-2 border-[#93c5fd] p-3 sm:p-3.5 landscape:p-2 flex items-center gap-3 sm:gap-3.5 shadow-xs">
            <div className="w-11 h-11 sm:w-12 sm:h-12 landscape:w-8 landscape:h-8 rounded-xl bg-white border-2 border-[#3b82f6] p-1 flex items-center justify-center shrink-0">
              <img
                src={BRAND_MASCOTS.inspectAnimated}
                alt="01"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="mana-keep-white text-[9.5px] sm:text-[10.5px] font-black text-white px-2.5 py-0.5 rounded-full bg-[#2563eb] uppercase">
                  01 • QUAN SÁT
                </span>
                <span className="text-xs sm:text-sm md:text-base landscape:text-[11px] font-black text-on-surface">ĐỌC TÌNH HUỐNG</span>
              </div>
              <p className="text-[11.5px] sm:text-xs md:text-body-sm landscape:text-[10px] text-on-surface-variant leading-snug font-medium">
                Phân tích xem công cụ có dùng <strong>Trí tuệ nhân tạo (AI)</strong> hay chỉ là <strong>Tự động hóa</strong>.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl bg-[#fff7ed] border-2 border-[#fdba74] p-3 sm:p-3.5 landscape:p-2 flex items-center gap-3 sm:gap-3.5 shadow-xs">
            <div className="w-11 h-11 sm:w-12 sm:h-12 landscape:w-8 landscape:h-8 rounded-xl bg-white border-2 border-[#f47920] p-1 flex items-center justify-center shrink-0">
              <img
                src={BRAND_MASCOTS.welcomeAnimated}
                alt="02"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="mana-keep-white text-[9.5px] sm:text-[10.5px] font-black text-white px-2.5 py-0.5 rounded-full bg-[#f47920] uppercase">
                  02 • RA QUYẾT ĐỊNH
                </span>
                <span className="text-xs sm:text-sm md:text-base landscape:text-[11px] font-black text-on-surface">CHỌN TRÁI / PHẢI</span>
              </div>
              <div className="text-[11.5px] sm:text-xs md:text-body-sm landscape:text-[10px] text-on-surface-variant leading-snug flex items-center gap-2 flex-wrap font-semibold">
                <span>• <strong className="text-[#15803d]">TRÁI (👈)</strong>: KHÔNG CÓ AI</span>
                <span className="text-slate-300">|</span>
                <span>• <strong className="text-[#2563eb]">PHẢI (👉)</strong>: CÓ DÙNG AI</span>
              </div>
            </div>
          </div>
        </div>

        {/* CỘT 2 (7 PHẦN): KHUNG THỬ NGHIỆM AR HOẶC SÂN KHẤU MÔ PHỎNG */}
        <div
          className={`${
            controlMode === 'ar' && isEnlarged
              ? 'absolute inset-0 z-30'
              : 'md:col-span-7 landscape:col-span-7'
          } flex flex-col h-full min-h-0 ppt-stagger-3 transition-all duration-300`}
        >
          {controlMode === 'ar' ? (
            <div className="relative rounded-2xl bg-surface-container border-2 border-[#f59e0b] p-2 sm:p-2.5 shadow-md flex flex-col gap-1.5 h-full min-h-0 overflow-hidden">
              {/* Header của Khung Test AR */}
              <div className="flex items-center justify-between pb-1 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full ${isTestingAR ? 'bg-[#16a34a] animate-ping' : 'bg-[#f59e0b]'}`} />
                  <span className="text-[10px] sm:text-label-caps text-on-surface font-black uppercase truncate">
                    {isTestingAR ? 'THỬ NGHIỆM AR • PHẢN XẠ 10 MỤC TIÊU' : 'THỬ NGHIỆM CAMERA AR TRỰC TIẾP'}
                  </span>
                </div>

                <div className="flex items-center gap-1 sm:gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      audio.playClick();
                      setIsEnlarged((prev) => !prev);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white hover:bg-surface-container-highest text-on-surface text-[10px] sm:text-xs font-bold transition-all cursor-pointer border border-[#93c5fd]"
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white hover:bg-red-50 text-red-600 text-[10px] sm:text-xs font-bold transition-all cursor-pointer border border-red-300"
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
                <div className="relative flex-1 min-h-0 rounded-2xl mana-split-arena flex flex-col items-center justify-center p-3 text-center gap-2.5 sm:gap-3">
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-[#f59e0b]/25 animate-ping opacity-60 pointer-events-none" />
                    <img
                      src={BRAND_MASCOTS.cameraWaitAnimated}
                      alt="Mana AR"
                      className="w-full h-full object-contain relative z-10 drop-shadow-[0_4px_10px_rgba(27,58,138,0.2)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1 max-w-sm">
                    <span className="text-xs sm:text-sm font-black text-on-surface uppercase tracking-wide">
                      BẠN ĐÃ CHỌN ĐIỀU KHIỂN BẰNG CAMERA AR
                    </span>
                    <p className="text-[11px] sm:text-xs text-on-surface-variant leading-snug font-medium">
                      Bấm nút bên dưới để thử đưa bàn tay ✋ bắt 10 mục tiêu làm quen, hoặc bấm nút <strong>BẮT ĐẦU</strong> ở góc dưới để vào thẳng trận đấu.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      audio.init();
                      audio.playClick();
                      setIsTestingAR(true);
                    }}
                    className="btn-mana-blue px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-black text-xs sm:text-body-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
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
            <div className="relative rounded-2xl mana-split-arena p-2.5 sm:p-3 overflow-hidden h-full min-h-0 flex flex-col justify-between">
              <div className="w-full flex justify-between items-center px-1 text-[8.5px] sm:text-[9.5px] relative z-20 font-black uppercase">
                <span className="mana-keep-white px-2.5 py-0.5 rounded-full bg-[#16a34a] text-white border border-white shadow-xs">
                  ◄ ĐỘI NGƯỜI (+1.8M)
                </span>
                <span className="mana-vs-badge px-2.5 py-0.5 rounded-full text-[9px] font-black">
                  VS • 0.0M
                </span>
                <span className="mana-keep-white px-2.5 py-0.5 rounded-full bg-[#2563eb] text-white border border-white shadow-xs">
                  ĐỘI AI (-1.5M) ►
                </span>
              </div>

              <div className="relative flex-1 flex items-center justify-center overflow-hidden rounded-xl py-1 my-1">
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-[#f47920] z-10 pointer-events-none" />
                <div
                  className="relative z-20 transition-transform duration-150 flex items-center justify-center"
                  style={{ transform: `translateX(${markerOffset}px)` }}
                >
                  <img
                    src={BRAND_MASCOTS.tugOfWarScene}
                    alt="Hoạt cảnh Kéo co Đội Con Người vs Đội AI"
                    className="h-24 sm:h-32 md:h-36 max-w-full w-auto object-contain drop-shadow-[0_6px_16px_rgba(27,58,138,0.25)] tug-scene-live"
                  />
                </div>
              </div>

              <div className="p-2 rounded-xl bg-white/90 border-2 border-[#bfdbfe] flex items-center justify-between text-[11px] text-on-surface font-medium">
                <span>🖱️ Chế độ Chuột: Click trực tiếp vào 1 trong 2 đáp án hoặc dùng phím <strong>A</strong> / <strong>D</strong>.</span>
                <span className="text-[#16a34a] font-black">Sẵn sàng!</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* THANH ĐIỀU HƯỚNG & NÚT BẮT ĐẦU */}
      <div className="bg-surface-container rounded-2xl p-2 sm:p-2.5 border-2 border-[#bfdbfe] flex items-center justify-between gap-2 ppt-stagger-4 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="btn-mana-blue flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-black cursor-pointer"
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
            className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#ebf9f1] hover:bg-[#dcfce7] border-2 border-[#16a34a] text-xs font-black text-[#1b3a8a] transition-all cursor-pointer shadow-xs"
            title="Thiết lập tên và chọn nhân vật đồng hành"
          >
            <img
              src={playerProfile?.characterImage || PLAYER_CHARACTERS[0].image}
              alt={playerProfile?.characterName || PLAYER_CHARACTERS[0].name}
              className="w-6 h-6 rounded-full object-contain bg-white border border-[#86efac] shrink-0"
            />
            <span className="max-w-[120px] truncate text-[#15803d]">
              {playerProfile ? playerProfile.playerName : 'Chọn nhân vật'}
            </span>
          </button>

          {/* Huy hiệu hiển thị phương thức chơi đã chọn ở Bước 2 */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border-2 border-[#93c5fd] text-on-surface-variant text-xs font-bold">
            <span className="uppercase text-[10px]">Chế độ:</span>
            <span
              className={`font-black flex items-center gap-1 ${
                controlMode === 'ar' ? 'text-[#15803d]' : 'text-[#2563eb]'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {controlMode === 'ar' ? 'videocam' : 'mouse'}
              </span>
              {controlMode === 'ar' ? 'Camera AR' : 'Chuột'}
            </span>
          </div>

          {/* NÚT BẮT ĐẦU CHƠI DUY NHẤT - NÚT CAM 3D */}
          <button
            type="button"
            onClick={() => onStartGame(controlMode)}
            className="btn-mana-orange px-6 sm:px-8 py-2 sm:py-2.5 rounded-full font-black text-xs sm:text-body-sm flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
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
  const [timeLeft, setTimeLeft] = useState(30);

  // Hệ thống Chuỗi Thắng / Chuỗi Thua (Win / Lose Streaks)
  const [winStreak, setWinStreak] = useState(0);
  const [loseStreak, setLoseStreak] = useState(0);
  const [maxWinStreak, setMaxWinStreak] = useState(0);
  const [arenaShake, setArenaShake] = useState<'win' | 'lose' | null>(null);
  const [roundCountdown, setRoundCountdown] = useState<3 | 2 | 1 | null>(null);
  const isArMode = controlMode === 'ar';
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ready' | 'error'>(
    isArMode ? 'loading' : 'ready'
  );
  const roundCountdownTimerRef = useRef<{ t2?: number; t1?: number; tGo?: number }>({});
  const initialCountdownStartedRef = useRef(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [streakCallout, setStreakCallout] = useState<{
    id: number;
    type: 'win' | 'lose';
    count: number;
    title: string;
    subtitle: string;
    badge: string;
  } | null>(null);
  const [isEnlarged, setIsEnlarged] = useState(false);

  // Khi người dùng chuyển sang chuột, đảm bảo trạng thái camera xem như ready để chơi ngay
  useEffect(() => {
    if (!isArMode) {
      setCameraStatus('ready');
    }
  }, [isArMode]);

  const triggerRoundCountdown = useCallback(() => {
    if (roundCountdownTimerRef.current.t2) window.clearTimeout(roundCountdownTimerRef.current.t2);
    if (roundCountdownTimerRef.current.t1) window.clearTimeout(roundCountdownTimerRef.current.t1);
    if (roundCountdownTimerRef.current.tGo) window.clearTimeout(roundCountdownTimerRef.current.tGo);

    setRoundCountdown(3);
    audio.playRoundCountdown(3);

    roundCountdownTimerRef.current.t2 = window.setTimeout(() => {
      setRoundCountdown(2);
      audio.playRoundCountdown(2);
    }, 1000);

    roundCountdownTimerRef.current.t1 = window.setTimeout(() => {
      setRoundCountdown(1);
      audio.playRoundCountdown(1);
    }, 2000);

    roundCountdownTimerRef.current.tGo = window.setTimeout(() => {
      setRoundCountdown(null);
      audio.playRoundCountdown('GO');
      questionStartRef.current = performance.now();
    }, 3000);
  }, []);

  // Dọn dẹp timer đếm ngược khi unmount
  useEffect(() => {
    return () => {
      if (roundCountdownTimerRef.current.t2) window.clearTimeout(roundCountdownTimerRef.current.t2);
      if (roundCountdownTimerRef.current.t1) window.clearTimeout(roundCountdownTimerRef.current.t1);
      if (roundCountdownTimerRef.current.tGo) window.clearTimeout(roundCountdownTimerRef.current.tGo);
    };
  }, []);

  // Phím Escape để thoát phóng to AR
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEnlarged) {
        setIsEnlarged(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnlarged]);

  const questionStartRef = useRef<number>(performance.now());
  const matchStartRef = useRef<number>(performance.now());
  const reactionTimesRef = useRef<number[]>([]);
  const answeredListRef = useRef<AnswerRecord[]>([]);

  const currentQ = questions[qIndex] ?? questions[0];

  // Reset trạng thái và kích hoạt đếm ngược khi sang câu mới
  useEffect(() => {
    setTimeLeft(30);
    setSelectedSide(null);
    setHoverSide(null);
    setHoverProgress(0);
    setLocked(false);
    setFeedback(null);
    setPedagogicalPopupOpen(false);
    setArenaShake(null);

    // Đối với các câu từ thứ 2 trở đi (qIndex > 0), camera đã kết nối xong, bắt đầu đếm ngược ngay
    if (qIndex > 0) {
      triggerRoundCountdown();
    }
  }, [qIndex, triggerRoundCountdown]);

  // Đối với câu đầu tiên (qIndex === 0):
  // Chỉ bắt đầu đếm ngược 3, 2, 1 khi Camera AR đã sẵn sàng (ready) hoặc đang ở chế độ Chuột
  useEffect(() => {
    if (qIndex === 0 && !initialCountdownStartedRef.current) {
      if (!isArMode || cameraStatus === 'ready') {
        initialCountdownStartedRef.current = true;
        triggerRoundCountdown();
      }
    }
  }, [qIndex, isArMode, cameraStatus, triggerRoundCountdown]);

  // Điều chỉnh nhịp nhạc nền theo độ dài chuỗi hiện tại
  useEffect(() => {
    const baseIntensity = Math.min(0.85, 0.35 + Math.max(winStreak, loseStreak) * 0.14);
    audio.setIntensity(baseIntensity);
  }, [winStreak, loseStreak]);

  // Đếm ngược 30s mỗi câu (chỉ chạy sau khi hoàn tất đếm ngược 3, 2, 1 và Camera đã sẵn sàng)
  useEffect(() => {
    if (locked || roundCountdown !== null || (isArMode && cameraStatus !== 'ready')) return;
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
  }, [locked, roundCountdown, isArMode, cameraStatus, qIndex]);

  const handleLockAnswer = (
    choiceSide: 'LEFT' | 'RIGHT' | null,
    source: 'mouse' | 'hand' | 'face' | 'timeout'
  ) => {
    if (locked || roundCountdown !== null || (isArMode && cameraStatus !== 'ready')) return;
    setLocked(true);
    setSelectedSide(choiceSide);

    const elapsedSec = Math.max(0.8, (performance.now() - questionStartRef.current) / 1000);
    reactionTimesRef.current.push(Math.min(30, elapsedSec));

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
    if (locked || roundCountdown !== null || pedagogicalPopupOpen || (isArMode && cameraStatus !== 'ready')) return;
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
      {/* MÀN HÌNH CHỜ: KHỞI ĐỘNG CAMERA AR KHI VÀO THẲNG TRẬN ĐẤU */}
      {isArMode && cameraStatus === 'loading' && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1b3a8a]/50 backdrop-blur-md p-4 overflow-hidden select-none ppt-page-enter"
          role="status"
          aria-live="polite"
        >
          <div className="relative rounded-3xl sm:rounded-4xl bg-white border-4 border-[#2563eb] shadow-[0_12px_0_#1d4ed8,0_30px_70px_rgba(27,58,138,0.35)] p-5 sm:p-7 md:p-8 max-w-md w-full flex flex-col items-center text-center gap-3 sm:gap-4 ppt-page-enter">
            {/* Badge tiêu đề */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#eaf2ff] border-2 border-[#2563eb] text-[#1b3a8a] text-[10.5px] sm:text-xs font-black uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] animate-ping" />
              <span>CHẾ ĐỘ CAMERA AR</span>
            </div>

            {/* Mascot động và hiệu ứng vòng xoay */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 flex items-center justify-center my-0.5">
              <div className="absolute inset-0 rounded-full bg-[#f47920]/20 animate-ping opacity-60 pointer-events-none" />
              <div
                className="absolute inset-[-6px] rounded-full border-3 border-dashed border-[#f47920]/40 animate-spin"
                style={{ animationDuration: '6s' }}
              />
              <img
                src={BRAND_MASCOTS.cameraWaitAnimated}
                alt="Khởi động Camera"
                className="w-full h-full object-contain relative z-10 drop-shadow-[0_6px_16px_rgba(244,121,32,0.3)]"
              />
            </div>

            {/* Tiêu đề & nội dung */}
            <div className="flex flex-col gap-1">
              <h2 className="text-lg sm:text-xl md:text-2xl font-black text-[#1b3a8a] uppercase tracking-tight">
                Khởi động Camera...
              </h2>
              <p className="text-[11.5px] sm:text-xs md:text-sm text-slate-600 font-semibold leading-relaxed">
                Đang kết nối Webcam và tải mô hình AI nhận diện bàn tay. Vui lòng giữ tư thế và cho phép camera để bắt đầu!
              </p>
            </div>

            {/* Thanh tiến trình trượt sóng động */}
            <div className="w-full max-w-[260px] h-2 rounded-full bg-slate-100 border border-[#93c5fd] overflow-hidden relative">
              <div className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-[#2563eb] via-[#16a34a] to-[#f47920] animate-camera-progress" />
            </div>

            {/* Mẹo nhận diện */}
            <div className="w-full p-2.5 rounded-2xl bg-[#ebf9f1] border border-[#86efac] text-[10.5px] sm:text-xs text-[#15803d] font-bold flex items-center gap-2 text-left">
              <span className="material-symbols-outlined text-[17px] text-[#16a34a] shrink-0">waving_hand</span>
              <span>Hãy xòe bàn tay trước camera. Đưa tay sang Trái (Không AI) hoặc Phải (Có AI) để kéo co.</span>
            </div>

            {/* Nút chuyển nhanh sang chuột nếu muốn */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                onSelectControlMode?.('mouse');
                setCameraStatus('ready');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-slate-50 border-2 border-slate-300 hover:border-[#2563eb] text-slate-700 hover:text-[#1b3a8a] text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <span className="material-symbols-outlined text-[15px] text-[#2563eb]">mouse</span>
              <span>Chuyển sang dùng Chuột ngay</span>
            </button>
          </div>
        </div>
      )}

      {/* MÀN HÌNH BÁO LỖI CAMERA NẾU BỊ TỪ CHỐI HOẶC KHÔNG CÓ WEBCAM */}
      {isArMode && cameraStatus === 'error' && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1b3a8a]/60 backdrop-blur-md p-4 overflow-hidden select-none ppt-page-enter"
          role="alertdialog"
        >
          <div className="relative rounded-3xl sm:rounded-4xl bg-white border-4 border-red-500 shadow-[0_12px_0_#991b1b,0_30px_70px_rgba(185,28,28,0.35)] p-5 sm:p-7 max-w-md w-full flex flex-col items-center text-center gap-3 ppt-page-enter">
            <div className="w-14 h-14 rounded-2xl bg-red-100 border-2 border-red-300 flex items-center justify-center text-red-600 shadow-sm">
              <span className="material-symbols-outlined text-[30px]">videocam_off</span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base sm:text-lg md:text-xl font-black text-[#1b3a8a] uppercase tracking-tight">
                Không thể kết nối Camera AR
              </h2>
              <p className="text-[11.5px] sm:text-xs text-slate-600 font-semibold leading-relaxed">
                Quyền truy cập Camera bị chặn hoặc máy tính không tìm thấy webcam. Bạn có thể cấp lại quyền hoặc chuyển sang chuột để chơi ngay!
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1 flex-wrap justify-center w-full">
              <button
                type="button"
                onClick={() => {
                  audio.playClick();
                  setCameraStatus('loading');
                }}
                className="btn-mana-blue flex-1 min-w-[130px] py-2 px-3 rounded-full text-xs font-black flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                <span>Thử lại Camera</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  audio.playClick();
                  onSelectControlMode?.('mouse');
                  setCameraStatus('ready');
                }}
                className="btn-mana-orange flex-1 min-w-[130px] py-2 px-3 rounded-full text-xs font-black flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">mouse</span>
                <span>Dùng Chuột / Phím</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY ĐẾM NGƯỢC 3, 2, 1 TRƯỚC KHI BẮT ĐẦU CHƠI HOẶC QUA CÂU MỚI - CHỈ DUY NHẤT SỐ ĐẾM RỰC RỠ */}
      {roundCountdown !== null && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[#1b3a8a]/45 backdrop-blur-md p-4 overflow-hidden select-none"
          role="status"
          aria-live="assertive"
        >
          <div className="relative rounded-3xl sm:rounded-4xl bg-white border-4 border-[#2563eb] shadow-[0_12px_0_#1d4ed8,0_25px_60px_rgba(27,58,138,0.35)] p-5 sm:p-7 md:p-8 flex flex-col items-center justify-center ppt-page-enter">
            {/* Vòng tròn đếm ngược 3D Mana rực rỡ, chữ trắng tương phản tuyệt đối */}
            <div className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full bg-gradient-to-b from-[#ff8a00] via-[#f47920] to-[#e05300] border-4 sm:border-6 border-white shadow-[0_8px_0_#9a3412,0_16px_36px_rgba(244,121,32,0.45)] flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full border-4 border-white/60 animate-ping opacity-75 pointer-events-none" />
              <span
                key={roundCountdown}
                className="countdown-digit-anim font-mono text-[76px] sm:text-[96px] md:text-[116px] leading-none font-black !text-white select-none"
                style={{ color: '#ffffff', textShadow: '0 4px 14px rgba(0,0,0,0.45)' }}
              >
                {roundCountdown}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ĐẤU TRƯỜNG KÉO CO TOÀN MÀN HÌNH - KHÔNG BO VIỀN NGOÀI */}
      <section
        className={`w-full h-full max-h-full p-2 sm:p-3 md:p-4 landscape:p-1.5 flex flex-col justify-between gap-1.5 sm:gap-2.5 landscape:gap-1 transition-colors overflow-hidden bg-transparent ${
          arenaShake === 'win'
            ? 'arena-shake-win'
            : arenaShake === 'lose'
            ? 'arena-shake-lose'
            : timeLeft <= 5 && !locked
            ? 'animate-pulse'
            : ''
        }`}
      >
        {/* HÀNG 1: HUD TỈ SỐ & ĐỒNG HỒ ĐẾM NGƯỢC (TỐI ƯU KHOẢNG CÁCH NÚT GÓC PHẢI TRÁNH TRÀN MOBILE) */}
        <div className="flex items-center justify-between gap-1 sm:gap-2 px-0.5 sm:px-1 shrink-0 pr-[76px] sm:pr-28">
          {/* Đội Con Người + Avatar Nhân vật & Tên Người chơi */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink">
            <img
              src={playerProfile?.characterImage || BRAND_MASCOTS.welcomeAnimated}
              alt={playerProfile?.characterName || 'Người chơi'}
              className="w-7 h-7 sm:w-10 sm:h-10 landscape:w-6 landscape:h-6 object-contain rounded-xl bg-[#ebf9f1] border-2 border-[#16a34a] p-0.5 shrink-0 shadow-[0_2px_0_#0b5626]"
            />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[9.5px] sm:text-xs landscape:text-[9px] text-on-surface font-black uppercase tracking-wide truncate max-w-[60px] xs:max-w-[90px] sm:max-w-[180px]">
                  {playerProfile ? playerProfile.playerName : 'ĐỘI NGƯỜI'}
                </span>
                {winStreak >= 3 && (
                  <span className="mana-keep-white px-1 py-0.2 rounded-full text-[7.5px] sm:text-[8.5px] font-black bg-[#16a34a] text-white shrink-0">
                    🔥{winStreak}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-0.5 sm:gap-1 font-mono">
                <span className="text-xs sm:text-base landscape:text-xs font-black text-[#15803d] leading-none">{humanScore}</span>
                <span className="text-[8px] sm:text-[9px] text-[#15803d] font-bold">PTS</span>
                <span className="hidden sm:inline-block text-[10px] text-[#15803d] font-bold ml-1">
                  ({ropeMeters >= 0 ? `+${ropeMeters}m` : `${ropeMeters}m`})
                </span>
              </div>
            </div>
          </div>

          {/* Vạch Trung Tâm: Tiến Độ & Đồng Hồ Đếm Ngược */}
          <div className="flex flex-col items-center justify-center gap-0.5 px-0.5 sm:px-2 flex-1 max-w-[115px] xs:max-w-[140px] sm:max-w-xs md:max-w-sm shrink-0">
            <div className="flex items-center justify-center gap-1 sm:justify-between w-full text-[8.5px] sm:text-[9.5px] font-black">
              <span className="hidden sm:inline-block text-[#1b3a8a] font-mono whitespace-nowrap">CÂU {qIndex + 1}/{questions.length}</span>
              <div
                className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 landscape:py-0.2 rounded-full text-[9px] sm:text-[10.5px] landscape:text-[9px] font-black font-mono transition-all shrink-0 ${
                  timeLeft <= 5 && !locked
                    ? 'btn-mana-red animate-bounce'
                    : 'mana-camera-pill'
                }`}
              >
                <span className="material-symbols-outlined text-[11px] sm:text-[14px]">timer</span>
                <span>{timeLeft}s</span>
              </div>
            </div>

            {/* Thanh Kéo Co Cân Bằng */}
            <div className="w-full h-1.5 sm:h-2.5 landscape:h-1.5 bg-[#e2e8f0] rounded-full p-0.2 relative overflow-hidden flex items-center border border-[#cbd5e1] sm:border-2">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-[#f47920] -translate-x-1/2 z-10" />
              <div
                className="h-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#2563eb] rounded-full transition-all duration-500"
                style={{ width: `${humanBarPercent}%` }}
              />
            </div>
          </div>

          {/* Đội AI */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 justify-end shrink">
            <div className="flex flex-col text-right min-w-0">
              <div className="flex items-center justify-end gap-1">
                {loseStreak >= 3 && (
                  <span className="mana-keep-white px-1 py-0.2 rounded-full text-[7.5px] sm:text-[8.5px] font-black bg-[#dc2626] text-white shrink-0">
                    ⚡{loseStreak}
                  </span>
                )}
                <span className="hidden xs:inline-block text-[9px] sm:text-[10.5px] text-[#2563eb] font-black uppercase tracking-wider truncate">
                  ĐỘI AI
                </span>
              </div>
              <div className="flex items-baseline justify-end gap-0.5 sm:gap-1 font-mono">
                <span className="text-xs sm:text-base landscape:text-xs font-black text-[#2563eb] leading-none">{aiScore}</span>
                <span className="text-[8px] sm:text-[9px] text-[#2563eb] font-bold">PTS</span>
              </div>
            </div>
            <img
              src={BRAND_MASCOTS.aiAssistant3d}
              alt="AI"
              className="w-7 h-7 sm:w-10 sm:h-10 landscape:w-6 landscape:h-6 object-contain rounded-xl bg-[#eaf2ff] border-2 border-[#2563eb] p-0.5 shrink-0 shadow-[0_2px_0_#133478]"
            />
            {/* Nút nhỏ popup xem lại hướng dẫn (ẩn trên mobile để không chèn toolbar) */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setGuideModalOpen(true);
              }}
              className="hidden md:flex w-6 h-6 sm:w-8 sm:h-8 landscape:w-6 landscape:h-6 rounded-full btn-mana-blue items-center justify-center cursor-pointer shrink-0"
              title="Xem lại hướng dẫn cách chơi"
            >
              <span className="material-symbols-outlined text-[13px] sm:text-[16px]">help_outline</span>
            </button>
          </div>
        </div>

        {/* HÀNG 2: CÂU HỎI & ẢNH CÔNG CỤ ĐƯỢC ĐƯA LÊN TRÊN CÙNG (IN TO RÕ NÉT) */}
        <div className="rounded-2xl sm:rounded-3xl bg-white/95 border-2 sm:border-3 border-[#93c5fd] px-3 sm:px-5 py-2 sm:py-2.5 md:py-3 landscape:py-1 flex items-center gap-3 sm:gap-4 md:gap-5 landscape:gap-2.5 shrink-0 shadow-sm">
          {/* Ảnh 3D công cụ phóng to rõ nét */}
          <div className="relative w-12 h-12 xs:w-14 xs:h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-22 lg:h-22 landscape:w-9 landscape:h-9 rounded-2xl bg-[#eff6ff] border-2 border-[#bfdbfe] p-1.5 landscape:p-0.5 shrink-0 flex items-center justify-center shadow-xs group">
            <img
              src={currentQ.image}
              alt={currentQ.toolName}
              className="w-full h-full object-contain relative z-10 group-hover:scale-105 transition-transform"
            />
          </div>

          {/* Tiêu đề công cụ & Nội dung câu hỏi phóng to rõ nét */}
          <div className="flex flex-col min-w-0 flex-1 justify-center gap-1 sm:gap-1.5 landscape:gap-0.5">
            <div className="flex items-center gap-2">
              <span className="mana-keep-white px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-[#2563eb] text-white text-[10px] sm:text-xs md:text-sm landscape:text-[8.5px] font-black uppercase tracking-wider shadow-2xs flex items-center gap-1">
                <span>CÔNG CỤ {qIndex + 1}/{questions.length}: {currentQ.toolName}</span>
              </span>
            </div>
            <h2
              className="text-sm xs:text-base sm:text-lg md:text-xl lg:text-2xl xl:text-[1.75rem] landscape:text-xs font-black text-[#1b3a8a] leading-tight sm:leading-snug md:leading-snug line-clamp-3 sm:line-clamp-none tracking-tight"
              style={{ color: '#1b3a8a' }}
            >
              {currentQ.question}
            </h2>
          </div>
        </div>

        {/* KHU VỰC THI ĐẤU: PHÂN TÁCH GIỮA CHẾ ĐỘ CAMERA AR VÀ CHẾ ĐỘ CHUỘT / CẢM ỨNG */}
        {isArMode ? (
          /* BỐ CỤC 2 CỘT CHIA ĐÔI NHƯ BÊN TRANG HƯỚNG DẪN */
          <div className="relative grid grid-cols-1 md:grid-cols-12 landscape:grid-cols-12 gap-2 sm:gap-3 landscape:gap-2 flex-1 min-h-0 overflow-y-auto md:overflow-hidden landscape:overflow-hidden">
            {/* CỘT 1 (5 PHẦN): ẢNH KÉO CO ĐƯỢC ĐƯA QUA GÓC TRÁI */}
            <div className="md:col-span-5 landscape:col-span-5 flex flex-col justify-between rounded-2xl mana-split-arena border-2 border-[#bfdbfe] p-2 sm:p-2.5 landscape:p-1.5 h-full min-h-0 relative overflow-hidden shadow-xs">
              {/* Hình tròn trang trí Pastel */}
              <div className="absolute -left-8 -top-8 w-24 h-24 rounded-full bg-[#d3f2df]/60 pointer-events-none" />
              <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-[#d6e6ff]/60 pointer-events-none" />

              {/* Header Sân Kéo co */}
              <div className="flex items-center justify-between w-full shrink-0 z-10 px-0.5">
                <span className="mana-keep-white text-[8.5px] sm:text-[9.5px] landscape:text-[8px] font-black text-white uppercase tracking-wider bg-[#16a34a] px-2 py-0.5 rounded-full border border-white shadow-xs">
                  ◄ {playerProfile ? playerProfile.playerName : 'ĐỘI NGƯỜI'}
                </span>

                <div className="mana-vs-badge px-2 py-0.5 rounded-full font-mono text-[9px] sm:text-[10.5px] landscape:text-[8px] font-black">
                  {ropeMeters > 0
                    ? `NGƯỜI +${ropeMeters}M`
                    : ropeMeters < 0
                    ? `AI ${Math.abs(ropeMeters)}M`
                    : 'VẠCH TÂM 0.0M'}
                </div>

                <span className="mana-keep-white text-[8.5px] sm:text-[9.5px] landscape:text-[8px] font-black text-white uppercase tracking-wider bg-[#2563eb] px-2 py-0.5 rounded-full border border-white shadow-xs">
                  ĐỘI AI ►
                </span>
              </div>

              {/* Vạch tâm phân chia */}
              <div className="absolute inset-y-4 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-[#f47920] z-0 pointer-events-none opacity-60" />

              {/* Hoạt cảnh Kéo co rung lắc theo nhịp */}
              <div className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden my-1">
                <div
                  className="transition-transform duration-500 ease-out flex items-center justify-center"
                  style={{ transform: `translateX(${Math.round(-(ropeMeters / 8) * 115)}px)` }}
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
                      className="h-auto max-h-[110px] xs:max-h-[130px] sm:max-h-[170px] md:max-h-[220px] landscape:max-h-[85px] w-full max-w-[340px] sm:max-w-[420px] object-contain drop-shadow-[0_6px_16px_rgba(27,58,138,0.22)]"
                    />
                  </div>
                </div>
              </div>

              {/* Chú thích thông tin 2 đội ở góc trái */}
              <div className="flex items-center justify-between text-[9.5px] sm:text-[11px] font-bold px-1 shrink-0 z-10 border-t border-[#bfdbfe]/60 pt-1">
                <span className="text-[#15803d]">Lực kéo: {ropeMeters >= 0 ? `+${ropeMeters}m` : `${ropeMeters}m`}</span>
                <span className="text-[#2563eb]">Cần +4.0m để thắng</span>
              </div>
            </div>

            {/* CỘT 2 (7 PHẦN): LAYOUT CHƠI AR NHƯ TRANG HƯỚNG DẪN */}
            <div
              className={`${
                isEnlarged ? 'absolute inset-0 z-30' : 'md:col-span-7 landscape:col-span-7'
              } flex flex-col h-full min-h-0 transition-all duration-300`}
            >
              <div className="relative rounded-2xl bg-surface-container border-2 border-[#f59e0b] p-1.5 sm:p-2 shadow-md flex flex-col gap-1 sm:gap-1.5 h-full min-h-0 overflow-hidden">
                {/* Header của Khung AR */}
                <div className="flex items-center justify-between pb-1 border-b border-white/10 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-ping" />
                    <span className="text-[10px] sm:text-label-caps text-on-surface font-black uppercase truncate">
                      CAMERA AR • NGHIÊNG TAY TRÁI (KHÔNG AI) / PHẢI (CÓ AI)
                    </span>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        audio.playClick();
                        setIsEnlarged((prev) => !prev);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-surface-container-highest text-on-surface text-[9.5px] sm:text-xs font-bold transition-all cursor-pointer border border-[#93c5fd]"
                      title={isEnlarged ? 'Thu nhỏ' : 'Phóng to'}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {isEnlarged ? 'close_fullscreen' : 'open_in_full'}
                      </span>
                      <span className="hidden sm:inline">{isEnlarged ? 'Thu nhỏ' : 'Phóng to'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        audio.playClick();
                        onSelectControlMode?.('mouse');
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-slate-100 text-slate-700 text-[9.5px] sm:text-xs font-bold border border-slate-300 cursor-pointer shadow-xs"
                      title="Chuyển sang dùng chuột"
                    >
                      <span className="material-symbols-outlined text-[13px]">mouse</span>
                      <span className="hidden sm:inline">Dùng chuột</span>
                    </button>
                  </div>
                </div>

                {/* AR Gesture Tracker Camera */}
                <div className="relative flex-1 min-h-0 w-full rounded-xl overflow-hidden">
                  <ARGestureTracker
                    enabled={true}
                    mode="quiz"
                    hideCamera={false}
                    locked={locked || roundCountdown !== null || cameraStatus !== 'ready'}
                    selectedSide={selectedSide}
                    hasAI={currentQ.hasAI}
                    pointerImage={playerProfile?.characterImage}
                    pointerName={playerProfile?.characterName}
                    onStatusChange={setCameraStatus}
                    onSelectSide={(side, source) => handleLockAnswer(side, source)}
                    onFallbackToMouse={() => {
                      audio.playClick();
                      onSelectControlMode?.('mouse');
                      setCameraStatus('ready');
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* BỐ CỤC CHẾ ĐỘ THAO TÁC BẰNG CHUỘT / CẢM ỨNG */
          <div className="flex-1 min-h-0 flex flex-col justify-between gap-1.5 sm:gap-2">
            {/* SÂN KÉO CO CHIA ĐÔI PASTEL XANH MINT & XANH SKY CHUẨN MANA OẲN TÙ XÌ */}
            <div className="relative flex-1 min-h-[75px] xs:min-h-[90px] sm:min-h-[110px] max-h-[180px] sm:max-h-[230px] landscape:min-h-[48px] landscape:max-h-[75px] rounded-2xl mana-split-arena overflow-hidden flex items-center justify-center px-2 sm:px-4 py-1">
              {/* Hình tròn trang trí & bệ đứng Pastel kiểu Mana Oẳn Tù Xì */}
              <div className="absolute -left-8 -top-8 w-28 h-28 rounded-full bg-[#d3f2df]/70 pointer-events-none" />
              <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-[#d6e6ff]/70 pointer-events-none" />
              <div className="absolute left-[18%] bottom-2 w-36 h-7 rounded-full bg-[#b8e6ca]/70 pointer-events-none" />
              <div className="absolute right-[18%] bottom-2 w-36 h-7 rounded-full bg-[#c6dcfa]/70 pointer-events-none" />

              {/* Nhãn Sân Người & Sân AI cố định ở mép trên */}
              <div className="mana-keep-white absolute top-2 left-3 z-20 text-[9px] sm:text-[10.5px] landscape:text-[8px] font-black text-white uppercase tracking-wider bg-[#16a34a] px-2.5 py-0.5 rounded-full border-2 border-white shadow-[0_2px_0_#0b5626] flex items-center gap-1.5">
                <span>◄ {playerProfile ? playerProfile.playerName : 'SÂN NGƯỜI'}</span>
              </div>

              <div className="mana-vs-badge absolute top-1.5 left-1/2 -translate-x-1/2 z-20 px-3 py-0.5 rounded-full font-mono text-[10px] sm:text-xs landscape:text-[8px] font-black">
                {ropeMeters > 0
                  ? `VS • NGƯỜI +${ropeMeters}M`
                  : ropeMeters < 0
                  ? `VS • AI ${Math.abs(ropeMeters)}M`
                  : 'VS • VẠCH TÂM 0.0M'}
              </div>

              <div className="mana-keep-white absolute top-2 right-3 z-20 text-[9px] sm:text-[10.5px] landscape:text-[8px] font-black text-white uppercase tracking-wider bg-[#2563eb] px-2.5 py-0.5 rounded-full border-2 border-white shadow-[0_2px_0_#133478]">
                SÂN AI ►
              </div>

              {/* Vạch tâm 0.0m */}
              <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-[#f47920] z-10 pointer-events-none" />

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
                      className="h-16 xs:h-20 sm:h-28 md:h-36 landscape:h-10 max-h-full w-auto max-w-none object-contain drop-shadow-[0_6px_16px_rgba(27,58,138,0.25)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2 NÚT BẤM CHUỘT (KHÔNG CÓ AI / CÓ SỬ DỤNG AI) */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 landscape:gap-1.5 h-full max-h-[64px] xs:max-h-[75px] sm:max-h-[95px] landscape:max-h-[44px]" role="radiogroup">
              {/* NÚT 1: KHÔNG CÓ AI (BÊN TRÁI - XANH LÁ 3D MANA) */}
              <button
                type="button"
                disabled={locked || roundCountdown !== null || (isArMode && cameraStatus !== 'ready')}
                onClick={() => handleLockAnswer('LEFT', 'mouse')}
                className={`group text-left relative rounded-xl sm:rounded-2xl landscape:rounded-xl p-2 sm:p-3 landscape:p-1 transition-all duration-150 flex items-center justify-between gap-2 landscape:gap-1.5 cursor-pointer border-3 overflow-hidden ${
                  selectedSide === 'LEFT'
                    ? !currentQ.hasAI
                      ? 'btn-mana-green scale-[1.01]'
                      : 'btn-mana-red'
                    : 'bg-[#ebf9f1] hover:bg-[#dcfce7] border-[#16a34a] shadow-[0_4px_0_#0b5626] landscape:shadow-[0_2px_0_#0b5626] hover:-translate-y-0.5 active:translate-y-0.5'
                }`}
              >
                <div className="flex items-center gap-2 landscape:gap-1.5 min-w-0">
                  <span className="mana-keep-white w-7 h-7 sm:w-9 sm:h-9 landscape:w-5 landscape:h-5 rounded-lg sm:rounded-xl bg-[#16a34a] border-2 border-white flex items-center justify-center text-white font-black text-sm sm:text-base landscape:text-xs shadow-xs shrink-0">
                    👈
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span
                      className={`text-xs sm:text-base md:text-lg landscape:text-[10px] font-black truncate ${
                        selectedSide === 'LEFT' ? 'text-white' : 'text-[#15803d]'
                      }`}
                    >
                      KHÔNG CÓ AI
                    </span>
                    <span
                      className={`text-[9.5px] sm:text-xs landscape:hidden font-bold truncate ${
                        selectedSide === 'LEFT' ? 'text-white/90' : 'text-slate-600'
                      }`}
                    >
                      Click hoặc phím A
                    </span>
                  </div>
                </div>

                <div
                  className={`w-6 h-6 sm:w-7 sm:h-7 landscape:w-5 landscape:h-5 rounded-full flex items-center justify-center shrink-0 border-2 ${
                    selectedSide === 'LEFT'
                      ? 'bg-white text-[#15803d] border-white'
                      : 'bg-white text-[#16a34a] border-[#86efac]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px] landscape:text-[13px] font-black">
                    {selectedSide === 'LEFT'
                      ? !currentQ.hasAI
                        ? 'check'
                        : 'close'
                      : 'radio_button_unchecked'}
                  </span>
                </div>
              </button>

              {/* NÚT 2: CÓ SỬ DỤNG AI (BÊN PHẢI - XANH DƯƠNG ROYAL 3D MANA) */}
              <button
                type="button"
                disabled={locked || roundCountdown !== null || (isArMode && cameraStatus !== 'ready')}
                onClick={() => handleLockAnswer('RIGHT', 'mouse')}
                className={`group text-right relative rounded-xl sm:rounded-2xl landscape:rounded-xl p-2 sm:p-3 landscape:p-1 transition-all duration-150 flex items-center justify-between gap-2 landscape:gap-1.5 cursor-pointer border-3 overflow-hidden ${
                  selectedSide === 'RIGHT'
                    ? currentQ.hasAI
                      ? 'btn-mana-green scale-[1.01]'
                      : 'btn-mana-red'
                    : 'bg-[#eaf2ff] hover:bg-[#dbeafe] border-[#2563eb] shadow-[0_4px_0_#133478] landscape:shadow-[0_2px_0_#133478] hover:-translate-y-0.5 active:translate-y-0.5'
                }`}
              >
                <div
                  className={`w-6 h-6 sm:w-7 sm:h-7 landscape:w-5 landscape:h-5 rounded-full flex items-center justify-center shrink-0 border-2 ${
                    selectedSide === 'RIGHT'
                      ? 'bg-white text-[#1b3a8a] border-white'
                      : 'bg-white text-[#2563eb] border-[#93c5fd]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px] landscape:text-[13px] font-black">
                    {selectedSide === 'RIGHT'
                      ? currentQ.hasAI
                        ? 'check'
                        : 'close'
                      : 'radio_button_unchecked'}
                  </span>
                </div>

                <div className="flex items-center gap-2 landscape:gap-1.5 min-w-0 justify-end">
                  <div className="flex flex-col min-w-0 text-right">
                    <span
                      className={`text-xs sm:text-base md:text-lg landscape:text-[10px] font-black truncate ${
                        selectedSide === 'RIGHT' ? 'text-white' : 'text-[#2563eb]'
                      }`}
                    >
                      CÓ SỬ DỤNG AI
                    </span>
                    <span
                      className={`text-[9.5px] sm:text-xs landscape:hidden font-bold truncate ${
                        selectedSide === 'RIGHT' ? 'text-white/90' : 'text-slate-600'
                      }`}
                    >
                      Click hoặc phím D
                    </span>
                  </div>
                  <span className="mana-keep-white w-7 h-7 sm:w-9 sm:h-9 landscape:w-5 landscape:h-5 rounded-lg sm:rounded-xl bg-[#2563eb] border-2 border-white flex items-center justify-center text-white font-black text-sm sm:text-base landscape:text-xs shadow-xs shrink-0">
                    👉
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* POPUP GIẢI THÍCH SƯ PHẠM SAU KHI TRẢ LỜI / HẾT THỜI GIAN - PHONG CÁCH SÁNG MANA OẲN TÙ XÌ */}
      {pedagogicalPopupOpen && (
        <div
          className="fixed inset-0 z-[70] bg-[#1b3a8a]/40 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 landscape:p-1.5 overflow-hidden select-none ppt-page-enter"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-xl md:max-w-2xl rounded-2xl sm:rounded-3xl bg-white border-3 sm:border-4 border-[#2563eb] p-3 sm:p-4 md:p-5 landscape:p-2 shadow-[0_8px_0_#133478,0_24px_60px_rgba(27,58,138,0.28)] flex flex-col gap-2 sm:gap-2.5 landscape:gap-1 max-h-[96dvh] overflow-hidden">
            {/* Banner trạng thái kết quả kiểu 3D */}
            <div
              className={`p-2 sm:p-2.5 landscape:py-1 landscape:px-2 rounded-xl flex items-center justify-between gap-2.5 ${
                feedback?.correct
                  ? 'btn-mana-green'
                  : 'btn-mana-red'
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-2.5 landscape:gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[24px] sm:text-[30px] landscape:text-[18px] shrink-0 text-white">
                  {feedback?.correct
                    ? 'check_circle'
                    : feedback?.isTimeout
                    ? 'schedule'
                    : 'cancel'}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm md:text-base landscape:text-[10.5px] font-black uppercase tracking-wide truncate text-white">
                    {feedback?.message}
                  </span>
                  <span className="text-[10.5px] sm:text-xs landscape:text-[9px] text-white/90 font-semibold truncate">
                    {feedback?.correct
                      ? 'Đội Con Người kéo dây +1.8m (+150 PTS)'
                      : 'Đội AI phản công kéo dây -1.5m'}
                  </span>
                </div>
              </div>
              <img
                src={feedback?.correct ? BRAND_MASCOTS.actionAnimated : BRAND_MASCOTS.giangGiai}
                alt="Mana Mascot"
                className="w-8 h-8 sm:w-10 sm:h-10 landscape:w-6 landscape:h-6 object-contain shrink-0 bg-white/20 rounded-lg p-0.5"
              />
            </div>

            {/* Thẻ Công cụ & Phân tích bản chất AI */}
            <div className="p-2 sm:p-2.5 landscape:py-1 landscape:px-2 rounded-xl bg-[#f4f8ff] border-2 border-[#bfdbfe] flex items-center gap-2.5 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 landscape:w-7 landscape:h-7 rounded-xl bg-white p-1 shrink-0 flex items-center justify-center border-2 border-[#93c5fd] shadow-xs">
                <img
                  src={currentQ.image}
                  alt={currentQ.toolName}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="mana-keep-white text-[9.5px] sm:text-[10.5px] font-mono px-2 py-0.2 rounded-full bg-[#1b3a8a] text-white font-black">
                    CÂU {qIndex + 1}/{questions.length}
                  </span>
                  <span className="text-xs sm:text-sm md:text-base font-black text-[#1b3a8a] truncate">
                    {currentQ.toolName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] sm:text-xs">
                  <span className="text-slate-600 font-bold">Bản chất:</span>
                  <span
                    className={`mana-keep-white font-black px-2 py-0.2 rounded-full text-[10.5px] sm:text-xs border border-white shadow-2xs ${
                      currentQ.hasAI
                        ? 'bg-[#2563eb] text-white'
                        : 'bg-[#16a34a] text-white'
                    }`}
                  >
                    {currentQ.hasAI ? '👉 CÓ SỬ DỤNG AI' : '👈 KHÔNG CÓ AI'}
                  </span>
                </div>
              </div>
            </div>

            {/* Phần giải nghĩa sư phạm cốt lõi */}
            <div className="p-2.5 sm:p-3.5 landscape:p-1.5 rounded-xl bg-[#ebf9f1] border-2 border-[#16a34a] shadow-xs flex flex-col gap-1 sm:gap-1.5">
              <div className="flex items-center gap-1.5 text-[#15803d] text-xs font-black uppercase tracking-wider">
                <div className="w-6 h-6 sm:w-7 sm:h-7 landscape:w-5 landscape:h-5 rounded-lg bg-white border border-[#16a34a] p-0.5 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                  <img
                    src={playerProfile?.characterImage || BRAND_MASCOTS.welcomeAnimated}
                    alt={playerProfile?.characterName || 'Bạn đồng hành'}
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="font-black text-[#1b3a8a] text-xs sm:text-sm landscape:text-[10px]">GIẢI NGHĨA SƯ PHẠM</span>
                <span className="text-[9.5px] sm:text-[10.5px] px-2 py-0.2 rounded-full bg-white text-[#15803d] border border-[#86efac] font-extrabold ml-auto flex items-center gap-1">
                  <span>{playerProfile?.characterName || 'BẠN ĐỒNG HÀNH'}</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm md:text-[15px] landscape:text-[10.5px] font-bold text-[#1b3a8a] leading-snug line-clamp-3 sm:line-clamp-4">
                {currentQ.insight}
              </p>
            </div>

            {/* Nút bấm chuyển câu tiếp theo - Nút Cam 3D */}
            <button
              type="button"
              autoFocus
              onClick={() => {
                setPedagogicalPopupOpen(false);
                handleNextQuestion();
              }}
              className="btn-mana-orange w-full py-2.5 sm:py-3.5 landscape:py-1.5 px-5 rounded-full text-xs sm:text-sm md:text-base landscape:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-0.5"
            >
              <PinchMark live />
              <span>
                {qIndex + 1 < questions.length
                  ? 'CÂU TIẾP THEO (PHÍM SPACE / ENTER)'
                  : 'HOÀN THÀNH • XEM TỔNG KẾT TRẬN ĐẤU'}
              </span>
              <span className="material-symbols-outlined text-[18px] sm:text-[20px] landscape:text-[15px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}

      {/* POPUP XEM LẠI HƯỚNG DẪN CHƠI TRONG TRẬN ĐẤU - PHONG CÁCH SÁNG */}
      {guideModalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-[#1b3a8a]/40 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-hidden select-none"
          onClick={() => setGuideModalOpen(false)}
        >
          <div
            className="bg-white border-3 sm:border-4 border-[#2563eb] rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 max-w-lg w-full max-h-[96dvh] overflow-hidden shadow-[0_8px_0_#133478,0_24px_60px_rgba(27,58,138,0.28)] flex flex-col gap-2 sm:gap-2.5 ppt-page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1.5 border-b-2 border-[#bfdbfe]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#2563eb] text-[20px] sm:text-[22px]">menu_book</span>
                <h3 className="text-xs sm:text-sm md:text-base text-[#1b3a8a] font-black uppercase">
                  HƯỚNG DẪN CHƠI KÉO CO CÙNG AI
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGuideModalOpen(false)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                title="Đóng"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 text-xs sm:text-sm text-slate-700 font-medium">
              <div className="p-2.5 sm:p-3 rounded-xl bg-[#ebf9f1] border border-[#86efac] flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-md bg-[#16a34a] text-white flex items-center justify-center text-[11px] font-black shrink-0">
                  1
                </span>
                <div>
                  <strong className="text-[#15803d] font-black">Quan sát & Phân tích: </strong>
                  Đọc tình huống xem công cụ có dùng <strong>Trí tuệ nhân tạo (AI)</strong> hay chỉ là <strong>Tự động hóa</strong>.
                </div>
              </div>

              <div className="p-2.5 sm:p-3 rounded-xl bg-[#eaf2ff] border border-[#93c5fd] flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-md bg-[#2563eb] text-white flex items-center justify-center text-[11px] font-black shrink-0">
                  2
                </span>
                <div>
                  <strong className="text-[#1b3a8a] font-black">Chọn đáp án: </strong>
                  <span className="text-[#15803d] font-bold">TRÁI (👈): KHÔNG AI</span> | <span className="text-[#2563eb] font-bold">PHẢI (👉): CÓ AI</span>.
                  <span className="block text-slate-500 text-[11px] mt-0.5">
                    {isArMode ? 'Camera AR: Đưa tay trái/phải trước webcam.' : 'Chuột/phím: Click thẻ hoặc nhấn A / D.'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setGuideModalOpen(false);
              }}
              className="mt-0.5 w-full py-2 sm:py-2.5 rounded-full btn-mana-green font-black text-xs sm:text-sm cursor-pointer shadow-md"
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
      {/* POPUP KẾT QUẢ TRẬN ĐẤU HIỆN LÊN TRỰC TIẾP Ở GIỮA MÀN HÌNH (PORTAL RA DOCUMENT.BODY - PHONG CÁCH SÁNG MANA) */}
      {victoryPopupOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-[#1b3a8a]/40 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 select-none animate-fadeIn overflow-hidden"
            onClick={() => setVictoryPopupOpen(false)}
          >
            <div
              className="relative w-full max-w-lg max-h-[96dvh] overflow-hidden rounded-2xl sm:rounded-3xl bg-white border-3 sm:border-4 border-[#2563eb] p-3.5 sm:p-5 landscape:p-2 shadow-[0_8px_0_#133478,0_24px_60px_rgba(27,58,138,0.28)] my-auto flex flex-col gap-2 sm:gap-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col sm:flex-row items-center gap-2.5 landscape:gap-1.5 mb-1 sm:mb-1.5">
                <div className="relative w-12 h-12 sm:w-14 sm:h-14 landscape:w-9 landscape:h-9 shrink-0 flex items-center justify-center rounded-2xl bg-[#ebf9f1] border-3 border-[#16a34a] p-1 overflow-hidden shadow-[0_3px_0_#0b5626]">
                  {activeChar ? (
                    <CharacterAvatar
                      character={activeChar}
                      className="w-full h-full"
                    />
                  ) : (
                    <img
                      src={BRAND_MASCOTS.welcomeAnimated}
                      alt="Mana Chúc mừng"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                <div className="text-center sm:text-left min-w-0">
                  <div className="inline-flex items-center gap-1.5 mb-0.5 text-[#15803d] font-black">
                    <span className="material-symbols-outlined text-[15px]">emoji_events</span>
                    <span className="text-[10px] sm:text-label-caps uppercase truncate">
                      {activeProfile
                        ? `NGƯỜI CHƠI: ${activeProfile.playerName} • ${activeChar?.name}`
                        : 'KẾT QUẢ MÔ PHỎNG SƯ PHẠM'}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg landscape:text-sm font-black text-[#1b3a8a] uppercase leading-tight">
                    TỔNG KẾT:{' '}
                    <span className="text-[#16a34a]">
                      {humanWon ? 'ĐỘI NGƯỜI CHIẾN THẮNG!' : 'TRẬN ĐẤU CÂN SỨC!'}
                    </span>
                  </h2>
                </div>
              </div>

              <p className="text-xs sm:text-body-sm landscape:text-[10px] text-slate-600 font-semibold leading-snug mb-1 sm:mb-1.5 line-clamp-2">
                Tinh thần đồng đội và tư duy phản biện công nghệ đã làm chủ AI xuất sắc! Thầy cô luôn giữ vai trò định hướng sư phạm cốt lõi.
              </p>

              {/* Thanh kéo co kết quả trong Popup */}
              <div className="mana-split-arena rounded-2xl p-2.5 sm:p-3 landscape:p-1.5 mb-1 sm:mb-2">
                <div className="flex justify-between items-center mb-1 text-[9px] sm:text-[10px] uppercase font-black">
                  <span className="text-[#15803d]">
                    ĐỘI NGƯỜI ({stats.ropeMeters >= 0 ? `+${stats.ropeMeters}M` : `${stats.ropeMeters}M`})
                  </span>
                  <span className="mana-vs-badge px-2 py-0.2 rounded-full text-[8.5px]">VS • 0.0M</span>
                  <span className="text-[#2563eb]">ĐỘI AI</span>
                </div>
                <div className="h-2.5 sm:h-3 w-full bg-white rounded-full relative overflow-hidden flex border-2 border-[#cbd5e1]">
                  <div
                    className="h-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#2563eb] rounded-full transition-all duration-1000"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-[#f47920] -translate-x-1/2" />
                </div>
              </div>

              {/* Nút đóng Popup để xem Dashboard hoặc Thống kê câu hỏi */}
              <div className="flex flex-col sm:flex-row landscape:flex-row items-center justify-end gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={onReplay}
                  className="btn-mana-green w-full sm:w-auto px-3.5 py-1.5 sm:py-2 landscape:py-1 rounded-full text-xs landscape:text-[10px] font-black cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">replay</span>
                  <span>Chơi lại</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setSummaryTab('review');
                    setVictoryPopupOpen(false);
                  }}
                  className="btn-mana-blue w-full sm:w-auto px-3.5 py-1.5 sm:py-2 landscape:py-1 rounded-full text-xs landscape:text-[10px] font-black cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">fact_check</span>
                  <span>Xem Thống kê</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setSummaryTab('dashboard');
                    setVictoryPopupOpen(false);
                  }}
                  className="btn-mana-orange w-full sm:w-auto px-4 py-2 sm:py-2.5 landscape:py-1 rounded-full text-xs sm:text-body-sm landscape:text-[10px] font-black uppercase tracking-wide cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px]">emoji_events</span>
                  <span>XEM DASHBOARD & TOP 1-2-3</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* THANH ĐIỀU HƯỚNG TỔNG KẾT VỚI TAB DASHBOARD & THỐNG KÊ CHI TIẾT */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mana-card-3d px-3.5 sm:px-4 py-2.5 rounded-2xl ppt-stagger-1 pr-18 sm:pr-28">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#ebf9f1] border-2 border-[#16a34a] text-[#15803d] text-[9.5px] sm:text-label-kicker uppercase font-black">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse" />
            BƯỚC 05 / 05 • TỔNG KẾT & THỐNG KÊ
          </span>
        </div>

        {/* 2 TAB CHUYỂN ĐỔI: DASHBOARD GOLIVE & THỐNG KÊ CHI TIẾT CÂU HỎI */}
        <div className="flex items-center bg-surface-container rounded-full p-1 gap-1.5 border-2 border-[#bfdbfe]">
          <button
            type="button"
            onClick={() => {
              audio.playClick();
              setSummaryTab('dashboard');
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-body-sm font-black transition-all cursor-pointer ${
              summaryTab === 'dashboard'
                ? 'btn-mana-orange'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-white'
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
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-body-sm font-black transition-all cursor-pointer ${
              summaryTab === 'review'
                ? 'btn-mana-blue'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-white'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">fact_check</span>
            <span className="text-[11px] sm:text-body-sm">THỐNG KÊ CHI TIẾT CÂU HỎI</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setVictoryPopupOpen(true)}
          className="text-[10px] sm:text-label-kicker text-primary hover:underline uppercase cursor-pointer flex items-center gap-1 font-black"
        >
          <span className="material-symbols-outlined text-[15px]">emoji_events</span>
          <span>Xem lại Popup</span>
        </button>
      </div>

      {/* NỘI DUNG CHÍNH THEO TAB ĐÃ CHỌN */}
      {summaryTab === 'dashboard' ? (
        <div className="flex flex-col gap-3.5 w-full">
          {/* COMPONENT DASHBOARD & BẢNG VINH DANH TOP 1-2-3 */}
          <DashboardLeaderboard currentStats={stats} />

          {/* Nút hành động chân trang */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl mana-card-3d">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onReplay}
                className="btn-mana-orange inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-full font-black text-body-sm sm:text-headline-sm cursor-pointer"
              >
                <PinchMark live />
                <span>CHƠI LẠI TRẬN MỚI</span>
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">replay</span>
              </button>
              <button
                type="button"
                onClick={onHome}
                className="btn-mana-blue inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-3 rounded-full text-body-sm sm:text-headline-sm font-black cursor-pointer"
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
              className="text-primary hover:underline text-body-sm font-black flex items-center gap-1 cursor-pointer"
            >
              <span>Xem Thống kê chi tiết từng câu hỏi</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 w-full ppt-stagger-2">
          {/* THANH THỐNG KÊ CHỈ SỐ GỌN GÀNG */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5 p-3 rounded-2xl mana-card-3d">
            <div className="flex flex-col p-2.5 rounded-xl bg-[#ebf9f1] border-2 border-[#86efac]">
              <span className="text-[9.5px] uppercase text-slate-600 font-bold">Điểm Con Người</span>
              <span className="text-headline-sm font-black text-[#15803d] font-mono">{stats.humanScore} pts</span>
              <span className="text-[10px] text-[#15803d] font-bold">
                Kéo dây: {stats.ropeMeters >= 0 ? `+${stats.ropeMeters}m` : `${stats.ropeMeters}m`}
              </span>
            </div>

            <div className="flex flex-col p-2.5 rounded-xl bg-[#eaf2ff] border-2 border-[#93c5fd]">
              <span className="text-[9.5px] uppercase text-slate-600 font-bold">Điểm AI Bots</span>
              <span className="text-headline-sm font-black text-[#2563eb] font-mono">{stats.aiScore} pts</span>
              <span className="text-[10px] text-slate-600 font-semibold">Mô phỏng 12 tiết</span>
            </div>

            <div className="flex flex-col p-2.5 rounded-xl bg-[#f4f8ff] border-2 border-[#bfdbfe]">
              <span className="text-[9.5px] uppercase text-slate-600 font-bold">Độ chính xác</span>
              <span className="text-headline-sm font-black text-[#1b3a8a] font-mono">{accuracy}%</span>
              <span className="text-[10px] text-slate-600 font-semibold">
                {stats.correctCount} / {stats.totalQuestions} câu đúng
              </span>
            </div>

            <div className="flex flex-col p-2.5 rounded-xl bg-[#fff7ed] border-2 border-[#fdba74]">
              <span className="text-[9.5px] uppercase text-slate-600 font-bold">Thời gian hoàn thành</span>
              <span className="text-headline-sm font-black text-[#f47920] font-mono">{stats.totalDurationSec || 40.0}s</span>
              <span className="text-[10px] text-slate-600 font-semibold">TB: {stats.avgReactionSec}s / câu</span>
            </div>

            <div className="col-span-2 sm:col-span-1 flex flex-col p-2.5 rounded-xl bg-[#ebf9f1] border-2 border-[#86efac]">
              <span className="text-[9.5px] uppercase text-slate-600 font-bold">Chuỗi thắng tối đa</span>
              <span className="text-headline-sm font-black text-[#15803d] font-mono">🔥 x{stats.maxWinStreak}</span>
              <span className="text-[10px] text-[#15803d] font-bold">Streak bứt phá</span>
            </div>
          </div>

          {/* BANNER ĐỊNH HƯỚNG SƯ PHẠM MANABIE */}
          <div className="p-3 sm:p-4 rounded-2xl mana-card-3d flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="mana-keep-white w-10 h-10 rounded-xl bg-[#2563eb] text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[22px]">psychology</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-[#2563eb] tracking-wider block">
                  BẢNG THỐNG KÊ CHI TIẾT & ĐÁNH GIÁ SƯ PHẠM
                </span>
                <p className="text-xs sm:text-body-sm text-on-surface font-semibold">
                  Xem lại chi tiết từng tình huống đã trả lời để đối chiếu cách ứng dụng AI và phân tích sư phạm trong lớp học.
                </p>
              </div>
            </div>

            {/* BỘ LỌC CÂU HỎI */}
            <div className="flex items-center bg-surface-container rounded-full p-1 border-2 border-[#bfdbfe] shrink-0">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 rounded-full text-body-xs font-black transition-all cursor-pointer ${
                  filterMode === 'all'
                    ? 'btn-mana-blue'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Tất cả ({answersList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('correct')}
                className={`px-3 py-1 rounded-full text-body-xs font-black transition-all cursor-pointer ${
                  filterMode === 'correct'
                    ? 'btn-mana-green'
                    : 'text-on-surface-variant hover:text-[#15803d]'
                }`}
              >
                ✅ Đúng ({correctCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('wrong')}
                className={`px-3 py-1 rounded-full text-body-xs font-black transition-all cursor-pointer ${
                  filterMode === 'wrong'
                    ? 'btn-mana-red'
                    : 'text-on-surface-variant hover:text-red-600'
                }`}
              >
                ❌ Chưa đúng ({wrongCount})
              </button>
            </div>
          </div>

          {/* DANH SÁCH CHI TIẾT TỪNG CÂU HỎI */}
          <div className="flex flex-col gap-3">
            {filteredAnswers.length === 0 ? (
              <div className="p-8 text-center rounded-2xl mana-card-3d text-on-surface-variant font-semibold">
                Không tìm thấy câu hỏi phù hợp với bộ lọc đã chọn.
              </div>
            ) : (
              filteredAnswers.map((ans) => {
                const isTimeout = ans.userChoice === null;
                return (
                  <div
                    key={ans.questionId}
                    className={`rounded-2xl p-3.5 sm:p-4 border-2 transition-all bg-white shadow-sm ${
                      ans.isCorrect
                        ? 'border-[#16a34a]'
                        : isTimeout
                        ? 'border-[#f59e0b]'
                        : 'border-red-400'
                    }`}
                  >
                    {/* Header Thẻ Câu Hỏi */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="mana-keep-white font-mono text-xs font-black px-2.5 py-0.5 rounded-full bg-[#1b3a8a] text-white">
                          CÂU {String(ans.questionIndex).padStart(2, '0')} / {String(stats.totalQuestions).padStart(2, '0')}
                        </span>
                        <span className="text-[10.5px] sm:text-label-caps uppercase text-slate-600 tracking-wider font-extrabold">
                          {ans.topic}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {ans.timeSpentSec && (
                          <span className="text-[11px] font-mono text-slate-600 font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[13px]">timer</span>
                            {ans.timeSpentSec}s
                          </span>
                        )}
                        <span
                          className={`mana-keep-white inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-black uppercase tracking-wide ${
                            ans.isCorrect
                              ? 'bg-[#16a34a] text-white'
                              : isTimeout
                              ? 'bg-[#f59e0b] text-white'
                              : 'bg-[#dc2626] text-white'
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
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#f4f8ff] border-2 border-[#bfdbfe] p-1 shrink-0 flex items-center justify-center overflow-hidden">
                          <img
                            src={ans.image}
                            alt={ans.toolName || 'Minh họa công cụ'}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {ans.toolName && (
                          <span className="text-[10px] font-black uppercase text-[#2563eb] tracking-wider block mb-0.5">
                            {ans.toolName}
                          </span>
                        )}
                        <h4 className="text-body-sm sm:text-body-base font-extrabold text-on-surface leading-snug">
                          {ans.question}
                        </h4>
                      </div>
                    </div>

                    {/* So sánh Lựa chọn người chơi vs Đáp án chuẩn */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                      <div
                        className={`p-2.5 rounded-xl border-2 flex items-center justify-between ${
                          ans.isCorrect
                            ? 'bg-[#ebf9f1] border-[#86efac]'
                            : 'bg-red-50 border-red-300'
                        }`}
                      >
                        <span className="text-[10.5px] uppercase text-slate-600 font-bold">
                          Lựa chọn của bạn:
                        </span>
                        <span
                          className={`text-xs sm:text-body-sm font-black ${
                            ans.isCorrect ? 'text-[#15803d]' : 'text-red-600'
                          }`}
                        >
                          {ans.userChoiceText}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl border-2 bg-[#eaf2ff] border-[#93c5fd] flex items-center justify-between">
                        <span className="text-[10.5px] uppercase text-slate-600 font-bold">
                          Đáp án chuẩn sư phạm:
                        </span>
                        <span className="text-xs sm:text-body-sm font-black text-[#2563eb] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">verified</span>
                          {ans.correctSideText}
                        </span>
                      </div>
                    </div>

                    {/* Giải thích sư phạm (Manabie Insight) */}
                    <div className="p-2.5 sm:p-3 rounded-xl bg-[#f8fbff] border border-[#bfdbfe] flex items-start gap-2.5">
                      <div className="mana-keep-white w-6 h-6 rounded-lg bg-[#2563eb] text-white flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[15px]">psychology</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-black uppercase text-[#2563eb] tracking-wider">
                          GIẢI THÍCH SƯ PHẠM (MANABIE INSIGHT):
                        </span>
                        <p className="text-xs sm:text-body-sm text-slate-700 font-medium leading-relaxed">
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
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl mana-card-3d mt-1">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onReplay}
                className="btn-mana-orange inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-full font-black text-body-sm sm:text-headline-sm cursor-pointer"
              >
                <PinchMark live />
                <span>CHƠI LẠI TRẬN MỚI</span>
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">replay</span>
              </button>
              <button
                type="button"
                onClick={onHome}
                className="btn-mana-blue inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-3 rounded-full text-body-sm sm:text-headline-sm font-black cursor-pointer"
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
              className="text-primary hover:underline text-body-sm font-black flex items-center gap-1 cursor-pointer"
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
