import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ARGestureTracker, GestureSide } from './components/ARGestureTracker';
import { DashboardLeaderboard } from './components/DashboardLeaderboard';
import { BRAND_MASCOTS, MANABIE_LOGO } from './data/brand';
import { TUG_QUESTIONS, getShuffledQuestions, TugQuestion } from './data/questions';
import { audio } from './utils/audio';

export type PageStep = 'gioi-thieu' | 'huong-dan' | 'tro-choi-keo-co' | 'tong-ket';
export type ControlMode = 'ar' | 'mouse';

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
};

const BRIDGE_LABELS: Record<PageStep, string> = {
  'gioi-thieu': '01 • KHỞI ĐỘNG CHUYÊN ĐỀ 12 TIẾT AI',
  'huong-dan': '02 • QUY TẮC & CHỌN CHẾ ĐỘ ĐIỀU KHIỂN',
  'tro-choi-keo-co': '03 • ĐẤU TRƯỜNG KÉO CO CON NGƯỜI VS AI',
  'tong-ket': '04 • TỔNG KẾT & GÓC SUY NGẪM SƯ PHẠM',
};

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
    <div className="min-h-screen flex flex-col justify-between relative selection:bg-primary selection:text-on-primary overflow-x-hidden">
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

      {/* HEADER CHUNG 4 TRANG (TỐI ƯU MOBILE FIRST: GỌN NHẸ, HẠN CHẾ CHIẾM DIỆN TÍCH) */}
      <header className="fixed top-0 w-full z-50 bg-surface-container-lowest/85 backdrop-blur-xl shadow-[0_2px_16px_rgba(0,0,0,0.35)] border-b border-white/10">
        <div className="h-14 sm:h-16 max-w-7xl mx-auto px-2.5 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            disabled={page === 'tro-choi-keo-co'}
            onClick={() => {
              if (page === 'tro-choi-keo-co') return;
              triggerPageTransition('gioi-thieu');
            }}
            className={`flex items-center gap-2 sm:gap-3 text-left shrink-0 ${
              page === 'tro-choi-keo-co' ? 'cursor-default opacity-85' : 'cursor-pointer group'
            }`}
          >
            <img
              alt="Manabie Logo"
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg object-contain shadow-md group-hover:scale-105 transition-transform"
              src={MANABIE_LOGO}
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-label-caps text-tertiary uppercase text-[10px] sm:text-[11px]">12 TIẾT AI</span>
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
              </div>
              <span className="text-label-kicker text-on-surface-variant uppercase hidden md:inline text-[9px]">
                AI TUG OF WAR • MANABIE
              </span>
            </div>
          </button>

          {/* THANH ĐIỀU HƯỚNG 4 BƯỚC */}
          <nav className="flex items-center bg-surface-container-high/75 backdrop-blur-md rounded-xl p-0.5 sm:p-1 gap-0.5 sm:gap-1 border border-white/10">
            {(
              [
                { id: 'gioi-thieu', num: '01', label: 'Giới thiệu' },
                { id: 'huong-dan', num: '02', label: 'Hướng dẫn' },
                { id: 'tro-choi-keo-co', num: '03', label: 'Đấu trường Kéo co' },
                { id: 'tong-ket', num: '04', label: 'Tổng kết' },
              ] as { id: PageStep; num: string; label: string }[]
            ).map((tab) => {
              const active = page === tab.id;
              // Khi đã từ mục 2 qua mục 3, không cho bấm về các mục trước đó (mục 1 và mục 2)
              const isPastStepLocked = page === 'tro-choi-keo-co' && (tab.id === 'gioi-thieu' || tab.id === 'huong-dan');
              const isLocked = !unlockedSteps[tab.id] || isPastStepLocked;

              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => {
                    if (isLocked) return;
                    triggerPageTransition(tab.id, {
                      isLaunchGame: tab.id === 'tro-choi-keo-co' && page !== 'tro-choi-keo-co',
                    });
                  }}
                  title={
                    isPastStepLocked
                      ? `Đang trong trận đấu. Bấm nút "Hướng dẫn" trên màn hình để xem lại luật chơi bất cứ lúc nào!`
                      : isLocked
                      ? `Mục ${tab.num} đang khóa. Vui lòng hoàn thành tuần tự các bước trước!`
                      : tab.label
                  }
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all ${
                    active
                      ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_0_14px_rgba(57,90,210,0.5)] cursor-default'
                      : isLocked
                      ? 'opacity-40 text-on-surface-variant cursor-not-allowed hover:bg-transparent'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest cursor-pointer'
                  }`}
                >
                  <span className="text-[11px] sm:text-label-caps opacity-90">{tab.num}</span>
                  <span className="text-body-sm font-semibold hidden md:inline">{tab.label}</span>
                  {isLocked && !active && (
                    <span className="material-symbols-outlined text-[12px] sm:text-[14px] text-on-surface-variant/80">
                      lock
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* NÚT TIỆN ÍCH PHẢI */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Hiển thị badge tĩnh báo chế độ đang dùng */}
            <div
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label-kicker uppercase border ${
                controlMode === 'ar'
                  ? 'bg-tertiary-container/30 text-tertiary border-tertiary/30'
                  : 'bg-surface-container-high text-secondary border-white/10'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  controlMode === 'ar' ? 'bg-tertiary animate-pulse' : 'bg-secondary'
                }`}
              />
              <span>{controlMode === 'ar' ? 'AR' : 'CHUỘT'}</span>
            </div>

            <button
              onClick={toggleMute}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer border border-white/5"
              title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                {muted ? 'volume_off' : 'volume_up'}
              </span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer border border-white/5"
              title="Toàn màn hình"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">fullscreen</span>
            </button>
          </div>
        </div>
      </header>

      {/* NỘI DUNG TỪNG TRANG VỚI KỸ THUẬT STAGGER & MORPH */}
      <main key={motionKey} className="w-full pt-16 sm:pt-18 pb-2 sm:pb-5 flex-1 flex flex-col justify-center">
        <div className="max-w-7xl w-full mx-auto px-2.5 sm:px-6">
          {page === 'gioi-thieu' && (
            <WelcomePage
              controlMode={controlMode}
              onSelectControlMode={setControlMode}
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
              onBack={() => triggerPageTransition('gioi-thieu')}
              onStartGame={(mode) => {
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
              onReplay={() =>
                triggerPageTransition('huong-dan', {
                  customLabel: 'CHUẨN BỊ TRẬN MỚI • CHỌN CHẾ ĐỘ CHƠI',
                })
              }
              onHome={() => triggerPageTransition('gioi-thieu')}
            />
          )}
        </div>
      </main>

      {/* FOOTER CHUNG */}
      <footer className="w-full bg-surface-container-lowest/90 backdrop-blur-md border-t border-white/10 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="text-label-caps uppercase text-tertiary">
              CHƯƠNG TRÌNH 12 TIẾT GIÁO DỤC TRÍ TUỆ NHÂN TẠO CỐT LÕI
            </span>
            <span className="text-outline-variant">•</span>
            <span className="text-body-sm text-on-surface-variant">Manabie AI EdTech Platform</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-label-kicker text-outline uppercase">Manabie Public School 2026</span>
            <span className="text-outline-variant">•</span>
            <span className="text-body-sm text-tertiary font-semibold">Made by Nguyen Hoang Tuan</span>
          </div>
        </div>
      </footer>

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
              • <strong>Camera AR (Vẫy tay & Khuôn mặt)</strong>: Giơ tay trái/phải hoặc nghiêng mặt trái/phải trước webcam.<br />
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
 * 01 - TRANG CHÀO MỪNG (WELCOME PAGE) — CÓ CỔNG MORPH PORTAL & CHỌN CHẾ ĐỘ TRƯỚC KHI CHƠI
 * ============================================================================ */
function WelcomePage({
  controlMode,
  onSelectControlMode,
  onNext,
  onOpenQr,
}: {
  controlMode: ControlMode;
  onSelectControlMode: (mode: ControlMode) => void;
  onNext: () => void;
  onOpenQr: () => void;
}) {
  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-2xl bg-surface-container-lowest/90 backdrop-blur-xl p-3.5 sm:p-5 md:p-7 overflow-hidden shadow-2xl border border-white/10 ppt-page-enter">
      {/* Cổng Morph Portal giống repo tham chiếu */}
      <div className="workshop-morph-gate" aria-hidden="true">
        <i>AI</i>
        <b>ĐẤU TRƯỜNG KÉO CO</b>
      </div>

      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary-container/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-tertiary-container/25 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-3 sm:gap-4.5">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pb-0.5 ppt-stagger-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high border border-white/10 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse shadow-[0_0_8px_currentColor]" />
            <span className="text-[10px] sm:text-label-caps text-tertiary uppercase">
              BƯỚC 01 / 04 • KHỞI ĐỘNG
            </span>
          </div>
        </div>

        {/* Nội dung chính gọn gàng, co giãn mobile-first */}
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-1 sm:gap-1.5 ppt-stagger-1">
            <span className="text-label-kicker text-secondary uppercase tracking-[0.16em]">
              SỞ GIÁO DỤC VÀ ĐÀO TẠO • MANABIE EDTECH
            </span>
            <h1 className="text-display-lg md:text-display-xl text-on-surface uppercase">
              CHƯƠNG TRÌNH BỒI DƯỠNG{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-fixed via-tertiary to-emerald-300">
                GIÁO VIÊN PHỔ THÔNG
              </span>
            </h1>
            <p className="text-headline-sm text-secondary-fixed-dim font-semibold max-w-3xl">
              Triển khai thực hiện 12 tiết giáo dục trí tuệ nhân tạo cốt lõi
            </p>
          </div>

          {/* Mascot + Intro Box */}
          <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-surface-container/85 border border-white/10 shadow-lg flex items-center justify-between gap-3 sm:gap-4 ppt-stagger-2">
            <div className="flex items-center gap-3">
              <img
                alt="Mascot Mana chào đón giáo viên"
                className="w-13 h-13 sm:w-16 sm:h-16 object-contain shrink-0 drop-shadow-[0_4px_12px_rgba(23,219,229,0.4)] ppt-mascot-enter"
                src={BRAND_MASCOTS.welcomeAnimated}
              />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-label-caps text-tertiary uppercase text-[10.5px]">
                    MANA TRỢ LÝ SƯ PHẠM
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-ping" />
                </div>
                <p className="text-body-base text-on-surface leading-snug">
                  Cùng khám phá cách đưa giáo dục AI vào lớp học thông qua trò chơi kéo co giữa{' '}
                  <strong className="text-tertiary font-bold">Đội Con người</strong> và{' '}
                  <strong className="text-primary font-bold">Đội AI</strong>!
                </p>
              </div>
            </div>

            <img
              src={BRAND_MASCOTS.tugOfWarScene}
              alt="Hoạt cảnh Kéo co Đội Con Người vs Đội AI"
              className="hidden sm:block h-20 md:h-24 w-auto object-contain shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)] tug-scene-live"
            />
          </div>

          {/* BỘ CHỌN CHẾ ĐỘ ĐIỀU KHIỂN TRƯỚC KHI CHƠI (CHUỘT HAY AR) */}
          <div className="p-2.5 sm:p-4 rounded-xl bg-surface-container-high/70 border border-white/15 flex flex-col gap-2 ppt-stagger-3">
            <div className="flex items-center justify-between">
              <span className="text-label-caps text-tertiary uppercase flex items-center gap-1.5 text-[10px] sm:text-[11px]">
                <span className="material-symbols-outlined text-[16px]">tune</span>
                CHỌN PHƯƠNG THỨC TƯƠNG TÁC
              </span>
              <button
                type="button"
                onClick={onOpenQr}
                className="text-label-kicker text-secondary underline cursor-pointer"
              >
                Chi tiết
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {/* Option 1: Camera AR */}
              <button
                type="button"
                onClick={() => {
                  audio.init();
                  audio.playClick();
                  onSelectControlMode('ar');
                }}
                className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 sm:gap-3 ${
                  controlMode === 'ar'
                    ? 'bg-tertiary-container/35 border-tertiary shadow-[0_0_18px_rgba(23,219,229,0.3)]'
                    : 'bg-surface-container-lowest/60 border-white/10 opacity-80 hover:opacity-100'
                }`}
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-tertiary/20 text-tertiary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px] sm:text-[22px]">front_hand</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-body-base font-bold text-on-surface">
                      Camera AR (Tay & Mặt)
                    </span>
                    {controlMode === 'ar' && (
                      <span className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_#17dbe5]" />
                    )}
                  </div>
                  <span className="text-body-sm text-on-surface-variant block truncate">
                    Vẫy tay hoặc nghiêng mặt Trái / Phải
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
                className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 sm:gap-3 ${
                  controlMode === 'mouse'
                    ? 'bg-primary-container/45 border-primary shadow-[0_0_18px_rgba(184,196,255,0.3)]'
                    : 'bg-surface-container-lowest/60 border-white/10 opacity-80 hover:opacity-100'
                }`}
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px] sm:text-[22px]">touch_app</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-body-base font-bold text-on-surface">
                      Chế độ Chuột / Cảm ứng
                    </span>
                    {controlMode === 'mouse' && (
                      <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#b8c4ff]" />
                    )}
                  </div>
                  <span className="text-body-sm text-on-surface-variant block truncate">
                    Click chọn trực tiếp thẻ đáp án
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Action CTA Bar: Luôn bắt buộc đi qua Mục 02 (Hướng dẫn & Luật chơi) */}
          <div className="flex flex-col items-stretch gap-2.5 pt-0.5 ppt-stagger-4">
            <button
              type="button"
              onClick={onNext}
              className="pinch-host group w-full px-5 py-3.5 sm:py-4 rounded-xl bg-gradient-to-r from-emerald-400 to-tertiary text-[#032117] text-headline-sm font-black uppercase tracking-wide flex items-center justify-center gap-2.5 shadow-[0_8px_24px_rgba(23,219,229,0.35)] hover:brightness-110 transition-all cursor-pointer"
            >
              <PinchMark live />
              <span>TIẾP TỤC: XEM HƯỚNG DẪN & CHỌN CHẾ ĐỘ (BƯỚC 02)</span>
              <span className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 02 - TRANG HƯỚNG DẪN CHƠI & CHỌN CHẾ ĐỘ TRƯỚC KHI VÀO ĐẤU TRƯỜNG
 * ============================================================================ */
function GuidePage({
  controlMode,
  onBack,
  onStartGame,
}: {
  controlMode: ControlMode;
  onSelectControlMode?: (mode: ControlMode) => void;
  onBack: () => void;
  onStartGame: (mode: ControlMode) => void;
}) {
  const [markerOffset, setMarkerOffset] = useState(0);
  const [testResult, setTestResult] = useState<{
    side: 'LEFT' | 'RIGHT';
    source: 'hand' | 'face';
  } | null>(null);

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

  return (
    <div className="flex flex-col w-full gap-3 sm:gap-4 relative ppt-page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-2.5 sm:gap-4 ppt-stagger-1">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-surface-container-high border border-white/10 mb-1 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary shadow-[0_0_8px_rgba(23,219,229,0.8)]" />
            <span className="text-[10px] sm:text-label-caps text-tertiary">
              BƯỚC 02 / 04 • QUY TẮC & LUẬT CHƠI
            </span>
          </div>
          <h1 className="text-display-lg text-on-surface">
            HƯỚNG DẪN CHƠI{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-tertiary">
              AI TUG OF WAR
            </span>
          </h1>
          <p className="text-body-sm sm:text-body-lg text-on-surface-variant mt-0.5 max-w-2xl">
            Tìm hiểu luật kéo co và bấm <strong>Bắt đầu</strong> để bước vào đấu trường!
          </p>
        </div>

        {/* Telemetry gọn nhẹ */}
        <div className="flex items-center gap-3 bg-surface-container-low/90 backdrop-blur-md px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl shadow-md border border-white/10 shrink-0">
          <div className="flex flex-col items-start">
            <span className="text-[9px] sm:text-label-kicker text-outline uppercase">Thời lượng</span>
            <div className="flex items-baseline gap-1">
              <span className="text-metric-display text-tertiary">15</span>
              <span className="text-[10px] sm:text-label-caps text-on-surface-variant">GIÂY/CÂU</span>
            </div>
          </div>
          <div className="w-px h-7 bg-surface-variant" />
          <div className="flex flex-col items-start">
            <span className="text-[9px] sm:text-label-kicker text-outline uppercase">Lực kéo</span>
            <div className="flex items-baseline gap-1">
              <span className="text-metric-display text-primary">+1.8</span>
              <span className="text-[10px] sm:text-label-caps text-on-surface-variant">MÉT/ĐÚNG</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 BƯỚC HƯỚNG DẪN RÕ RÀNG, TỐI ƯU MOBILE FIRST */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 ppt-stagger-2">
        {/* Step 1 */}
        <div className="lux-card bg-surface-container-low/85 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-md border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] sm:text-label-caps text-primary px-2.5 py-0.5 rounded-md bg-primary-container/30">
                01 • QUAN SÁT
              </span>
              <img
                src={BRAND_MASCOTS.inspectAnimated}
                alt="Mana Đọc câu hỏi"
                className="w-10 h-10 sm:w-13 sm:h-13 object-contain"
              />
            </div>
            <h3 className="text-headline-sm sm:text-headline-md text-on-surface mb-1">ĐỌC TÌNH HUỐNG</h3>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              Phân tích xem tình huống công cụ trên màn hình có dùng <strong>Trí tuệ nhân tạo (AI)</strong> hay chỉ là <strong>Tự động hóa</strong>.
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="lux-card bg-surface-container-low/85 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-md border border-tertiary/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] sm:text-label-caps text-tertiary px-2.5 py-0.5 rounded-md bg-tertiary-container/40">
                02 • RA QUYẾT ĐỊNH
              </span>
              <img
                src={BRAND_MASCOTS.welcomeAnimated}
                alt="Mana Chọn đáp án"
                className="w-10 h-10 sm:w-13 sm:h-13 object-contain"
              />
            </div>
            <h3 className="text-headline-sm sm:text-headline-md text-on-surface mb-1">CHỌN TRÁI HOẶC PHẢI</h3>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              • <strong className="text-secondary">TRÁI (👈)</strong>: Chọn <strong>KHÔNG CÓ AI</strong>.<br />
              • <strong className="text-tertiary">PHẢI (👉)</strong>: Chọn <strong>CÓ SỬ DỤNG AI</strong>.
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-secondary-container/60 text-secondary text-[9.5px] sm:text-label-kicker font-bold">
              👈 TRÁI: KHÔNG AI
            </span>
            <span className="px-2 py-0.5 rounded-md bg-tertiary-container/60 text-tertiary text-[9.5px] sm:text-label-kicker font-bold">
              PHẢI: CÓ AI 👉
            </span>
          </div>
        </div>

        {/* Step 3 */}
        <div className="lux-card bg-surface-container-low/85 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-md border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] sm:text-label-caps text-primary px-2.5 py-0.5 rounded-md bg-primary-container/30">
                03 • KÉO DÂY
              </span>
              <img
                src={BRAND_MASCOTS.actionAnimated}
                alt="Mana Kéo co"
                className="w-10 h-10 sm:w-13 sm:h-13 object-contain"
              />
            </div>
            <h3 className="text-headline-sm sm:text-headline-md text-on-surface mb-1">KÉO CO & CHIẾN THẮNG</h3>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              Trả lời đúng giúp <strong>Đội Con Người</strong> kéo dây <strong>+1.8m</strong> (+150đ). Trả lời sai <strong>Đội AI</strong> sẽ kéo dây ngược lại!
            </p>
          </div>
        </div>
      </div>

      {/* SÂN KHẤU MÔ PHỎNG KÉO CO (CO GIÃN GỌN NHẸ TRÊN MOBILE) */}
      <div className="relative bg-surface-container-lowest/90 backdrop-blur-xl rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-xl overflow-hidden border border-white/10 ppt-stagger-3">
        <div className="w-full flex justify-between items-center px-2 text-[9px] sm:text-label-kicker text-outline mb-1 relative z-20">
          <span className="text-secondary font-bold truncate">👈 ĐỘI NGƯỜI (KHI ĐÚNG)</span>
          <span className="text-error font-bold px-2 py-0.5 rounded-full bg-error-container/40 border border-error/40 text-[9px] shrink-0">
            VẠCH TÂM 0.0M
          </span>
          <span className="text-tertiary font-bold truncate text-right">ĐỘI AI (KHI SAI) 👉</span>
        </div>

        <div className="relative h-28 sm:h-38 md:h-48 flex items-center justify-center overflow-hidden rounded-lg sm:rounded-xl bg-surface-container/60 border border-white/5 py-2 sm:py-3">
          {/* Vạch chuẩn trung tâm 0.0m */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-error/80 z-10" />

          {/* Hoạt cảnh Kéo co di chuyển trực quan qua lại theo vạch tâm */}
          <div
            className="relative z-20 transition-transform duration-150 flex items-center justify-center"
            style={{ transform: `translateX(${markerOffset}px)` }}
          >
            <img
              src={BRAND_MASCOTS.tugOfWarScene}
              alt="Hoạt cảnh Kéo co Đội Con Người vs Đội AI"
              className="h-22 sm:h-32 md:h-42 max-w-full w-auto object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.7)] tug-scene-live"
            />
          </div>
        </div>
      </div>

      {/* NẾU CHỌN CHẾ ĐỘ AR: KHUNG THỬ NGHIỆM CỬ CHỈ TRƯỚC KHI BẮT ĐẦU */}
      {controlMode === 'ar' && (
        <div className="relative rounded-xl sm:rounded-2xl bg-surface-container-lowest/90 backdrop-blur-xl border-2 border-tertiary/40 p-3 sm:p-4 shadow-xl flex flex-col gap-2.5 ppt-stagger-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-tertiary animate-ping" />
              <span className="text-[11px] sm:text-label-caps text-tertiary font-bold uppercase">
                THỬ NGHIỆM CAMERA AR TRƯỚC KHI BẮT ĐẦU
              </span>
            </div>
            {testResult && (
              <button
                type="button"
                onClick={() => {
                  audio.playClick();
                  setTestResult(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-tertiary text-[11px] sm:text-body-sm font-bold transition-all cursor-pointer border border-tertiary/40 hover:border-tertiary"
              >
                <span className="material-symbols-outlined text-[16px]">replay</span>
                <span>Thử lại</span>
              </button>
            )}
          </div>

          <p className="text-xs sm:text-body-sm text-on-surface-variant">
            Hãy giơ tay trái / phải hoặc nghiêng đầu sang trái / phải trước webcam để làm quen cử chỉ trước khi vào trận!
          </p>

          <div className="relative">
            <ARGestureTracker
              enabled={true}
              locked={testResult !== null}
              descNoAI="Thử giơ tay trái hoặc nghiêng đầu Trái"
              descHasAI="Thử giơ tay phải hoặc nghiêng đầu Phải"
              selectedSide={testResult?.side ?? null}
              hasAI={testResult ? testResult.side === 'RIGHT' : undefined}
              onSelectSide={(side, source) => {
                audio.playPullSuccess(1);
                setTestResult({ side, source });
              }}
            />

            {/* Overlay kết quả thử nghiệm thành công */}
            {testResult && (
              <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-4 text-center gap-3 ppt-page-enter">
                <div className="w-12 h-12 rounded-full bg-emerald-400/20 text-emerald-400 border border-emerald-400/40 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[28px]">check_circle</span>
                </div>
                <div>
                  <span className="text-label-caps text-emerald-400 font-bold uppercase block mb-0.5">
                    NHẬN DIỆN THÀNH CÔNG!
                  </span>
                  <p className="text-body-base text-on-surface font-bold">
                    Bạn vừa chọn bên{' '}
                    <span className={testResult.side === 'LEFT' ? 'text-secondary' : 'text-tertiary'}>
                      {testResult.side === 'LEFT' ? 'TRÁI (KHÔNG CÓ AI)' : 'PHẢI (CÓ SỬ DỤNG AI)'}
                    </span>{' '}
                    bằng {testResult.source === 'hand' ? 'Vẫy tay ✋' : 'Khuôn mặt 😊'}!
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      audio.playClick();
                      setTestResult(null);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-bold border border-white/10 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">replay</span>
                    <span>Thử lại cử chỉ khác</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartGame('ar')}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-tertiary text-[#032117] text-body-sm font-black hover:brightness-110 transition-all cursor-pointer shadow-lg"
                  >
                    <span>VÀO CHƠI NGAY</span>
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* THANH ĐIỀU HƯỚNG & NÚT BẮT ĐẦU DUY NHẤT */}
      <div className="bg-surface-container-high/75 backdrop-blur-xl rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-white/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 ppt-stagger-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-container-lowest/70 hover:bg-surface-container-lowest text-on-surface-variant hover:text-on-surface transition-all cursor-pointer border border-white/10 text-body-sm font-semibold"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Quay lại</span>
        </button>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Huy hiệu hiển thị phương thức chơi đã chọn ở Bước 1 */}
          <div className="flex items-center justify-center sm:justify-start gap-2 px-3.5 py-2 rounded-xl bg-surface-container-lowest/80 border border-white/10 text-on-surface-variant text-body-sm">
            <span className="text-[11px] sm:text-label-caps text-outline uppercase font-semibold">Chế độ chơi:</span>
            <span
              className={`font-black flex items-center gap-1 text-body-sm sm:text-body-base ${
                controlMode === 'ar' ? 'text-tertiary' : 'text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {controlMode === 'ar' ? 'videocam' : 'mouse'}
              </span>
              {controlMode === 'ar' ? 'Camera AR (Tay & Mặt)' : 'Click Chuột'}
            </span>
          </div>

          {/* NÚT BẮT ĐẦU CHƠI DUY NHẤT */}
          <button
            type="button"
            onClick={() => onStartGame(controlMode)}
            className="pinch-host px-6 sm:px-9 py-3 rounded-xl font-black text-body-base sm:text-headline-sm flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-400 via-tertiary to-emerald-300 text-[#032117] shadow-[0_8px_25px_rgba(23,219,229,0.45)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer uppercase tracking-wide"
          >
            <PinchMark live />
            <span>BẮT ĐẦU</span>
            <span className="material-symbols-outlined text-[22px]">play_arrow</span>
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
  onFinish,
}: {
  controlMode: ControlMode;
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
  } | null>(null);

  const [humanScore, setHumanScore] = useState(150);
  const [aiScore, setAiScore] = useState(100);
  const [ropeMeters, setRopeMeters] = useState(1.2);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);

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

  const currentQ = questions[qIndex] ?? questions[0];
  const isArMode = controlMode === 'ar';

  // Reset trạng thái và kích hoạt Overlay đếm ngược 3, 2, 1 trước khi bắt đầu chơi hoặc qua câu mới
  useEffect(() => {
    setTimeLeft(15);
    setSelectedSide(null);
    setHoverSide(null);
    setHoverProgress(0);
    setLocked(false);
    setFeedback(null);
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

  // Đếm ngược 15s mỗi câu (chỉ chạy sau khi hoàn tất đếm ngược 3, 2, 1) + Hiệu ứng âm thanh dồn dập 5 giây cuối
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
    reactionTimesRef.current.push(Math.min(15, elapsedSec));

    // LEFT = KHÔNG CÓ AI (hasAI === false)
    // RIGHT = CÓ SỬ DỤNG AI (hasAI === true)
    const chosenHasAI = choiceSide === 'RIGHT';
    const isCorrect = choiceSide !== null && chosenHasAI === currentQ.hasAI;

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
      });
    }
  };

  const handleNextQuestion = () => {
    audio.playClick();
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
      });
    }
  };

  // Không tự động nhảy câu hỏi - chờ người dùng bấm nút "CÂU TIẾP THEO" để có thời gian đọc giải thích sư phạm
  const humanBarPercent = Math.max(15, Math.min(85, Math.round(50 + (ropeMeters / 8) * 38)));
  const ribbonTranslatePx = Math.round(-(ropeMeters / 8) * 165);

  return (
    <div className="relative flex flex-col w-full gap-4 select-none ppt-page-enter">
      {/* OVERLAY ĐẾM NGƯỢC 3, 2, 1 TRƯỚC KHI BẮT ĐẦU CHƠI HOẶC QUA CÂU MỚI */}
      {roundCountdown !== null && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[#060913]/80 backdrop-blur-md p-4"
          role="status"
          aria-live="assertive"
        >
          <div className="relative w-full max-w-lg rounded-3xl bg-surface-container-low/95 border-2 border-tertiary/50 shadow-[0_0_60px_rgba(23,219,229,0.35)] p-6 sm:p-8 flex flex-col items-center text-center gap-4 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(23,219,229,0.22),transparent_70%)] pointer-events-none" />

            {/* Badge trạng thái trận đấu / câu hỏi */}
            <div className="relative z-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-container/40 border border-primary/40 text-primary text-label-caps uppercase">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-ping" />
              <span>
                {qIndex === 0
                  ? 'SẴN SÀNG BẮT ĐẦU TRÒ CHƠI'
                  : `CHUYỂN SANG CÂU MỚI • CÂU ${String(qIndex + 1).padStart(2, '0')} / ${String(
                      questions.length
                    ).padStart(2, '0')}`}
              </span>
            </div>

            {/* Chủ đề câu hỏi sắp tới */}
            <div className="relative z-10 flex flex-col gap-1">
              <span className="text-label-kicker text-tertiary uppercase">{currentQ.topic}</span>
              <p className="text-body-base sm:text-body-lg text-on-surface font-bold line-clamp-2 max-w-md">
                {currentQ.question}
              </p>
            </div>

            {/* Số đếm ngược 3 - 2 - 1 cỡ lớn với hiệu ứng Pop & Vòng sáng */}
            <div className="relative z-10 my-2 w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-surface-container-lowest/90 border-4 border-tertiary shadow-[0_0_45px_rgba(23,219,229,0.55)] flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-tertiary/40 animate-ping pointer-events-none" />
              <span
                key={roundCountdown}
                className="countdown-digit-anim font-metric-display text-[84px] sm:text-[96px] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-tertiary-fixed to-tertiary"
              >
                {roundCountdown}
              </span>
            </div>

            {/* Hướng dẫn ngắn theo chế độ đã chọn */}
            <div className="relative z-10 flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-high/80 border border-white/10 text-body-sm text-on-surface-variant">
              <img
                src={BRAND_MASCOTS.welcomeAnimated}
                alt="Mana"
                className="w-7 h-7 object-contain shrink-0"
              />
              <span>
                {isArMode
                  ? 'Giơ tay hoặc nghiêng mặt sang Trái (Không AI) / Phải (Có AI)'
                  : 'Chuẩn bị chọn đáp án: KHÔNG CÓ AI hoặc CÓ SỬ DỤNG AI'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TẦNG 1: THANH HUD TỈ SỐ & HOẠT CẢNH SÂN KHẤU KÉO CO SỐNG ĐỘNG */}
      <section
        className={`w-full bg-surface-container-low/90 backdrop-blur-xl rounded-xl sm:rounded-2xl p-2 sm:p-3.5 shadow-xl flex flex-col gap-2 sm:gap-2.5 border transition-colors ${
          arenaShake === 'win'
            ? 'arena-shake-win border-emerald-400/60'
            : arenaShake === 'lose'
            ? 'arena-shake-lose border-error/60'
            : timeLeft <= 5 && !locked
            ? 'border-error/70 shadow-[0_0_24px_rgba(255,180,171,0.28)]'
            : 'border-white/10'
        }`}
      >
        {/* MOBILE COMPACT HUD (< md): 1 DÒNG TỐI GIẢN KHÔNG GÂY SCROLL */}
        <div className="flex md:hidden items-center justify-between gap-1 bg-surface-container-high/90 rounded-lg px-2 py-1.5 border border-white/10">
          {/* Đội Con Người */}
          <div className="flex items-center gap-1.5 min-w-0">
            <img
              src={BRAND_MASCOTS.welcomeAnimated}
              alt="Người"
              className="w-6 h-6 object-contain rounded bg-primary-container/30 p-0.5 shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-[8.5px] text-tertiary font-bold leading-none">NGƯỜI</span>
              <span className="text-xs font-black text-tertiary font-mono leading-none mt-0.5">
                {humanScore}
              </span>
            </div>
            <span className="text-[8.5px] text-tertiary font-bold ml-0.5 font-mono">
              {ropeMeters >= 0 ? `+${ropeMeters}m` : `${ropeMeters}m`}
            </span>
            {winStreak >= 3 && (
              <span className="px-1 py-0.2 rounded text-[7.5px] font-black bg-emerald-400 text-[#032117]">
                x{winStreak}
              </span>
            )}
          </div>

          {/* Giữa: Tiến độ & Đồng hồ */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[8.5px] text-on-surface-variant font-bold font-mono">
                CÂU {qIndex + 1}/{questions.length}
              </span>
              <div
                className={`flex items-center gap-0.5 px-1.5 py-0.2 rounded-full border text-[9px] font-bold ${
                  timeLeft <= 5 && !locked
                    ? 'bg-error-container text-error border-error animate-bounce'
                    : 'bg-surface-container-lowest text-tertiary border-tertiary/40'
                }`}
              >
                <span className="font-mono">{timeLeft}s</span>
              </div>
            </div>
            <div className="w-16 h-1.5 bg-surface-container-lowest rounded-full overflow-hidden flex relative border border-white/10">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/60 -translate-x-1/2 z-10" />
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-tertiary to-primary-container rounded-full transition-all duration-300"
                style={{ width: `${humanBarPercent}%` }}
              />
            </div>
          </div>

          {/* Đội AI */}
          <div className="flex items-center gap-1.5 min-w-0 justify-end">
            {loseStreak >= 3 && (
              <span className="px-1 py-0.2 rounded text-[7.5px] font-black bg-rose-500 text-white">
                x{loseStreak}
              </span>
            )}
            <div className="flex flex-col text-right">
              <span className="text-[8.5px] text-secondary font-bold leading-none">AI BOT</span>
              <span className="text-xs font-black text-secondary font-mono leading-none mt-0.5">
                {aiScore}
              </span>
            </div>
            <img
              src={BRAND_MASCOTS.aiAssistant3d}
              alt="AI"
              className="w-6 h-6 object-contain rounded bg-secondary-container/40 p-0.5 shrink-0"
            />
          </div>
        </div>

        {/* DESKTOP FULL HUD (>= md) */}
        <div className="hidden md:grid grid-cols-12 gap-3 items-center">
          {/* Đội Con Người */}
          <div
            className={`col-span-4 flex items-center justify-between bg-surface-container-high/90 rounded-xl p-2.5 px-3.5 border transition-all ${
              winStreak >= 3
                ? 'border-emerald-400/70 shadow-[0_0_20px_rgba(16,185,129,0.28)]'
                : 'border-white/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <img
                src={BRAND_MASCOTS.welcomeAnimated}
                alt="Mana"
                className="w-9 h-9 object-contain rounded-lg bg-primary-container/30 p-0.5"
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-label-kicker text-tertiary uppercase text-[10px]">
                    ĐỘI CON NGƯỜI
                  </span>
                  {winStreak >= 3 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-emerald-400 text-[#032117]">
                      🔥 x{winStreak}
                    </span>
                  )}
                </div>
                <span className="text-body-sm text-on-surface font-bold">Giáo viên & Học sinh</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-metric-display text-tertiary">{humanScore}</span>
                <span className="text-[10px] text-tertiary/80">PTS</span>
              </div>
              <span className="text-[10px] text-tertiary font-bold">
                {ropeMeters >= 0 ? `+${ropeMeters}M` : `${ropeMeters}M`}
              </span>
            </div>
          </div>

          {/* Giữa: Tiến độ câu & Thanh kéo co */}
          <div className="col-span-4 flex flex-col items-center justify-center gap-1 px-2">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                <span className="text-label-caps text-tertiary uppercase text-[10px]">
                  CÂU {String(qIndex + 1).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}
                </span>
              </div>

              {/* Đồng hồ đếm ngược nổi bật */}
              <div
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border transition-all ${
                  timeLeft <= 5 && !locked
                    ? 'bg-error-container/70 border-error text-error animate-bounce shadow-[0_0_14px_rgba(255,180,171,0.65)]'
                    : 'bg-surface-container-lowest border-tertiary/40 text-tertiary'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">timer</span>
                <span className="text-metric-clock text-[17px]">{timeLeft}s</span>
              </div>
            </div>

            <div className="w-full flex flex-col gap-0.5">
              <div className="h-2.5 w-full bg-surface-container-lowest rounded-full p-0.5 relative overflow-hidden flex items-center border border-white/10">
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/60 -translate-x-1/2 z-10" />
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 via-tertiary to-primary-container rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(23,219,229,0.6)]"
                  style={{ width: `${humanBarPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-on-surface-variant text-[9px]">
                <span className="text-tertiary font-bold">◄ NGƯỜI</span>
                <span>VẠCH TÂM 0.0m</span>
                <span className="text-secondary font-bold">AI ►</span>
              </div>
            </div>
          </div>

          {/* Đội AI */}
          <div
            className={`col-span-4 flex items-center justify-between bg-surface-container-high/90 rounded-xl p-2.5 px-3.5 border transition-all ${
              loseStreak >= 3
                ? 'border-error/70 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                : 'border-white/5'
            }`}
          >
            <div className="flex flex-col items-start">
              <div className="flex items-baseline gap-1">
                <span className="text-metric-display text-secondary">{aiScore}</span>
                <span className="text-[10px] text-secondary/80">PTS</span>
              </div>
              <span className="text-[10px] text-on-surface-variant">THÁCH ĐẤU</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col text-right">
                <div className="flex items-center justify-end gap-1">
                  {loseStreak >= 3 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-rose-500 text-white">
                      ⚡ x{loseStreak}
                    </span>
                  )}
                  <span className="text-label-kicker text-secondary uppercase text-[10px]">
                    ĐỘI TRÍ TUỆ NHÂN TẠO
                  </span>
                </div>
                <span className="text-body-sm text-on-surface font-bold">AI Core Bots</span>
              </div>
              <img
                src={BRAND_MASCOTS.aiAssistant3d}
                alt="AI Bot"
                className="w-9 h-9 object-contain rounded-lg bg-secondary-container/40 p-0.5"
              />
            </div>
          </div>
        </div>

        {/* SÂN KHẤU HOẠT CẢNH KÉO CO RUNG LẮC & DI CHUYỂN VỊ TRÍ TRỰC QUAN (CO GIÃN THEO THIẾT BỊ) */}
        <div className="relative min-h-[105px] sm:min-h-[140px] md:min-h-[165px] rounded-xl bg-surface-container-lowest overflow-hidden flex flex-col justify-between px-2 sm:px-6 py-1.5 sm:py-2.5 shadow-inner border border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_50%_75%,rgba(57,90,210,0.2),rgba(9,14,28,0))] pointer-events-none" />

          {/* BANNER NỔ HIỆU ỨNG STREAK THẮNG / THUA TRÊN SÂN KHẤU */}
          {streakCallout && (
            <div
              key={streakCallout.id}
              className="streak-callout-banner w-[92%] max-w-sm"
            >
              <div
                className={`rounded-xl px-3 py-1.5 border shadow-xl backdrop-blur-xl flex items-center gap-2 ${
                  streakCallout.type === 'win'
                    ? 'bg-emerald-950/90 border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.55)]'
                    : 'bg-rose-950/90 border-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.55)]'
                }`}
              >
                <div
                  className={`px-2 py-0.5 rounded-lg font-black text-[9px] shrink-0 ${
                    streakCallout.type === 'win'
                      ? 'bg-gradient-to-r from-emerald-400 to-tertiary text-[#032117]'
                      : 'bg-gradient-to-r from-amber-400 to-rose-500 text-white'
                  }`}
                >
                  {streakCallout.badge}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-body-sm font-black text-white truncate">
                    {streakCallout.title}
                  </span>
                  <span className="text-[10px] text-on-surface-variant truncate">
                    {streakCallout.subtitle}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Thanh thước đo sân kéo co */}
          <div className="relative z-20 flex items-center justify-between text-[8.5px] sm:text-label-kicker uppercase px-1">
            <span className="text-tertiary font-black flex items-center gap-1">
              <span>◄ SÂN NGƯỜI</span>
            </span>

            <span className="px-2 py-0.2 rounded-full bg-error-container/50 border border-error/50 text-error font-bold text-[8px] sm:text-[9.5px]">
              {ropeMeters > 0
                ? `NGƯỜI KÉO +${ropeMeters}M`
                : ropeMeters < 0
                ? `AI KÉO ${Math.abs(ropeMeters)}M`
                : 'VẠCH TÂM 0.0M'}
            </span>

            <span className="text-secondary font-black flex items-center gap-1">
              <span>SÂN AI ►</span>
            </span>
          </div>

          {/* Vạch laser trung tâm cố định 0.0m */}
          <div className="absolute inset-y-4 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-error/75 z-10 pointer-events-none" />

          {/* HOẠT CẢNH ĐỘI KÉO CO RUNG LẮC & DỊCH CHUYỂN */}
          <div className="relative z-20 flex-1 flex items-center justify-center overflow-visible py-0.5">
            <div
              className="transition-transform duration-500 ease-out flex items-center justify-center"
              style={{ transform: `translateX(${ribbonTranslatePx}px)` }}
            >
              <div
                className={
                  locked
                    ? feedback?.correct
                      ? 'tug-scene-jerk-left'
                      : 'tug-scene-jerk-right'
                    : ''
                }
              >
                <img
                  src={BRAND_MASCOTS.tugOfWarScene}
                  alt="Hoạt cảnh Kéo co"
                  className={`h-20 sm:h-28 md:h-36 w-auto max-w-none object-contain tug-scene-live ${
                    winStreak >= 3
                      ? 'drop-shadow-[0_8px_20px_rgba(16,185,129,0.75)]'
                      : loseStreak >= 3
                      ? 'drop-shadow-[0_8px_20px_rgba(244,63,94,0.75)]'
                      : 'drop-shadow-[0_8px_18px_rgba(0,0,0,0.65)]'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TẦNG 2: CÂU HỎI LỚN & KHUNG TƯƠNG TÁC (TỐI ƯU MOBILE FIRST) */}
      <section className="w-full bg-surface-container/85 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 shadow-2xl flex flex-col gap-2.5 sm:gap-3 border border-white/10">
        {/* Thông tin Công cụ & Hướng dẫn ngắn */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-primary-container/30 text-primary text-[10px] sm:text-label-caps uppercase font-bold">
            <span className="material-symbols-outlined text-[14px]">handyman</span>
            <span>{currentQ.topic}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] sm:text-body-sm text-on-surface-variant font-semibold">
              {isArMode
                ? '✋ Vẫy tay/nghiêng mặt Trái (Không AI) / Phải (Có AI)'
                : '🖱️ Click chọn đáp án bên dưới'}
            </span>

            {/* Nút nhỏ popup xem lại hướng dẫn chơi */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setGuideModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-tertiary hover:text-white border border-tertiary/40 hover:border-tertiary text-[10px] sm:text-[11px] font-bold uppercase transition-all cursor-pointer shadow-sm"
              title="Xem lại hướng dẫn cách chơi"
            >
              <span className="material-symbols-outlined text-[14px] sm:text-[15px]">help_outline</span>
              <span>Hướng dẫn</span>
            </button>
          </div>
        </div>

        {/* Câu hỏi chữ gọn gàng, độ tương phản cao */}
        <div className="bg-surface-container-lowest/85 rounded-xl p-3 sm:p-4 shadow-inner border border-white/10">
          <h2 className="text-sm sm:text-base md:text-headline-md text-white font-bold leading-snug">
            {currentQ.question}
          </h2>
        </div>

        {/* NẾU CHỌN CHẾ ĐỘ AR: HIỂN THỊ KHUNG CAMERA AR BÊN DƯỚI */}
        {isArMode ? (
          <ARGestureTracker
            enabled={true}
            locked={locked || roundCountdown !== null}
            descNoAI={currentQ.descNoAI}
            descHasAI={currentQ.descHasAI}
            selectedSide={selectedSide}
            hasAI={currentQ.hasAI}
            onSelectSide={(side, source) => handleLockAnswer(side, source)}
          />
        ) : (
          /* NẾU CHỌN CHẾ ĐỘ CHUỘT: HIỂN THỊ 2 NÚT ĐÁP ÁN */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3.5" role="radiogroup">
            {/* NÚT 1: KHÔNG CÓ AI */}
            <button
              type="button"
              disabled={locked || roundCountdown !== null}
              onClick={() => handleLockAnswer('LEFT', 'mouse')}
              className={`lux-card group text-left relative rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all duration-300 flex flex-col justify-between gap-1.5 sm:gap-2.5 cursor-pointer border-2 overflow-hidden ${
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
                  className="absolute bottom-0 left-0 h-1.5 bg-tertiary transition-all duration-100"
                  style={{ width: `${hoverProgress}%` }}
                />
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm sm:text-base md:text-headline-md text-white font-black group-hover:text-tertiary transition-colors">
                  KHÔNG CÓ AI
                </span>

                {hoverSide === 'LEFT' && !locked ? (
                  <span className="px-2 py-0.5 rounded-full bg-tertiary/20 text-tertiary text-[9.5px]">
                    {hoverSource === 'hand' ? '✋ Tay' : '😊 Mặt'} {hoverProgress}%
                  </span>
                ) : (
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
                )}
              </div>

              <p className="text-xs sm:text-body-sm text-on-surface leading-snug">
                {currentQ.descNoAI}
              </p>
            </button>

            {/* NÚT 2: CÓ SỬ DỤNG AI */}
            <button
              type="button"
              disabled={locked || roundCountdown !== null}
              onClick={() => handleLockAnswer('RIGHT', 'mouse')}
              className={`lux-card group text-left relative rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all duration-300 flex flex-col justify-between gap-1.5 sm:gap-2.5 cursor-pointer border-2 overflow-hidden ${
                selectedSide === 'RIGHT'
                  ? currentQ.hasAI
                    ? 'bg-emerald-500/20 border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.45)]'
                    : 'bg-error-container/40 border-error shadow-[0_0_20px_rgba(255,180,171,0.4)]'
                  : hoverSide === 'RIGHT'
                  ? 'bg-surface-container-highest border-tertiary shadow-[0_0_20px_rgba(23,219,229,0.35)] scale-[1.01]'
                  : 'bg-surface-container-high/65 hover:bg-surface-container-highest border-white/15 hover:border-white/35'
              }`}
            >
              {hoverSide === 'RIGHT' && !locked && (
                <div
                  className="absolute bottom-0 left-0 h-1.5 bg-tertiary transition-all duration-100"
                  style={{ width: `${hoverProgress}%` }}
                />
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm sm:text-base md:text-headline-md text-white font-black group-hover:text-tertiary transition-colors">
                  CÓ SỬ DỤNG AI
                </span>

                {hoverSide === 'RIGHT' && !locked ? (
                  <span className="px-2 py-0.5 rounded-full bg-tertiary/20 text-tertiary text-[9.5px]">
                    {hoverSource === 'hand' ? '✋ Tay' : '😊 Mặt'} {hoverProgress}%
                  </span>
                ) : (
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
                )}
              </div>

              <p className="text-xs sm:text-body-sm text-on-surface leading-snug">
                {currentQ.descHasAI}
              </p>
            </button>
          </div>
        )}

        {/* HỘP GIẢI THÍCH SƯ PHẠM & NÚT BẤM CÂU TIẾP THEO (HIỂN THỊ CẢ CHẾ ĐỘ CHUỘT LẪN AR, KHÔNG TỰ NHẢY CÂU) */}
        {locked && (
          <div className="bg-surface-container-lowest/95 rounded-xl sm:rounded-2xl p-3 sm:p-4.5 flex flex-col lg:flex-row items-center justify-between gap-3 sm:gap-4 border-2 border-tertiary/40 shadow-[0_0_30px_rgba(23,219,229,0.2)] ppt-page-enter">
            <div className="flex items-start gap-2.5 sm:gap-3.5 max-w-3xl">
              <img
                src={feedback?.correct ? BRAND_MASCOTS.actionAnimated : BRAND_MASCOTS.giangGiai}
                alt="Mana Insight"
                className="w-10 h-10 sm:w-13 sm:h-13 object-contain shrink-0 drop-shadow-[0_4px_10px_rgba(23,219,229,0.35)]"
              />
              <div className="flex flex-col gap-0.5 sm:gap-1">
                <span
                  className={`text-[10px] sm:text-label-caps uppercase font-bold flex items-center gap-1.5 ${
                    feedback?.correct ? 'text-emerald-400' : 'text-error'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                  {feedback?.message}
                </span>
                <p className="text-xs sm:text-body-base text-on-surface leading-snug">
                  <strong className="text-tertiary">Giải thích sư phạm: </strong>
                  {currentQ.insight}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextQuestion}
              className="pinch-host w-full lg:w-auto px-6 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-emerald-400 via-tertiary to-emerald-300 text-[#032117] text-body-base sm:text-headline-sm font-black uppercase tracking-wider shadow-[0_0_25px_rgba(23,219,229,0.55)] hover:scale-[1.03] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 border border-white/20"
            >
              <PinchMark live />
              <span>
                {qIndex + 1 < questions.length ? 'CÂU TIẾP THEO' : 'XEM TỔNG KẾT TRẬN ĐẤU'}
              </span>
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">arrow_forward</span>
            </button>
          </div>
        )}
      </section>

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
                      ? 'Camera AR: Vẫy tay hoặc nghiêng mặt sang bên muốn chọn và giữ 1 giây.'
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
                  Trả lời đúng giúp Đội Con Người kéo dây <strong>+1.8m (+150 điểm)</strong>. Nếu sai hoặc hết giờ (15s), Đội AI sẽ giật dây ngược lại!
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
  onReplay,
  onHome,
}: {
  stats: MatchStats;
  onReplay: () => void;
  onHome: () => void;
}) {
  const [victoryPopupOpen, setVictoryPopupOpen] = useState(true);
  const [summaryTab, setSummaryTab] = useState<'dashboard' | 'reflection'>('dashboard');
  const accuracy = Math.round((stats.correctCount / Math.max(1, stats.totalQuestions)) * 100);
  const humanWon = stats.humanScore >= stats.aiScore;
  const barWidth = Math.max(25, Math.min(85, Math.round(50 + (stats.ropeMeters / 8) * 35)));

  return (
    <div className="flex flex-col w-full gap-3.5 sm:gap-5 relative ppt-page-enter">
      {/* POPUP KẾT QUẢ TRẬN ĐẤU HIỆN LÊN NGAY KHI KẾT THÚC TRÒ CHƠI */}
      {victoryPopupOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setVictoryPopupOpen(false)}
        >
          <div
            className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-3xl bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-lowest p-4 sm:p-6 shadow-[0_32px_90px_rgba(0,0,0,0.65),0_0_50px_rgba(23,219,229,0.2)] border border-tertiary/40 ppt-page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-tertiary/15 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-center gap-3.5 sm:gap-4 mb-3.5 sm:mb-4">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 flex items-center justify-center rounded-2xl bg-surface-container-lowest/70 border border-white/10 p-1.5">
                <img
                  src={BRAND_MASCOTS.welcomeAnimated}
                  alt="Mana Chúc mừng"
                  className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(23,219,229,0.4)]"
                />
              </div>

              <div className="text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 mb-1 text-tertiary">
                  <span className="material-symbols-outlined text-[18px]">emoji_events</span>
                  <span className="text-[10px] sm:text-label-caps uppercase">KẾT QUẢ MÔ PHỎNG SƯ PHẠM</span>
                </div>
                <h2 className="text-headline-md sm:text-headline-lg text-on-surface uppercase">
                  TỔNG KẾT:{' '}
                  <span className="text-tertiary block sm:inline">
                    {humanWon ? 'ĐỘI NGƯỜI CHIẾN THẮNG!' : 'TRẬN ĐẤU CÂN SỨC!'}
                  </span>
                </h2>
              </div>
            </div>

            <p className="text-body-sm sm:text-body-base text-on-surface-variant leading-relaxed mb-4">
              Tinh thần đồng đội và tư duy phản biện công nghệ đã làm chủ AI xuất sắc! Thầy cô luôn giữ vai trò định hướng sư phạm cốt lõi.
            </p>

            {/* Thanh kéo co kết quả trong Popup */}
            <div className="bg-surface-container-lowest/90 rounded-xl p-3 border border-white/10 mb-4">
              <div className="flex justify-between items-center mb-1.5 text-[9px] sm:text-label-kicker uppercase">
                <span className="text-tertiary font-bold">
                  ĐỘI NGƯỜI ({stats.ropeMeters >= 0 ? `+${stats.ropeMeters}M` : `${stats.ropeMeters}M`})
                </span>
                <span className="text-on-surface-variant">VẠCH TÂM 0.0M</span>
                <span className="text-secondary font-bold">ĐỘI AI</span>
              </div>
              <div className="h-3 w-full bg-surface-variant rounded-full relative overflow-hidden flex border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-tertiary to-primary-container rounded-full transition-all duration-1000"
                  style={{ width: `${barWidth}%` }}
                />
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/60 -translate-x-1/2" />
              </div>
            </div>

            {/* Nút đóng Popup để xem Dashboard hoặc Góc suy ngẫm */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onReplay}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm sm:text-body-base font-bold transition-colors cursor-pointer border border-white/10 flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">replay</span>
                <span>Chơi lại</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  audio.playClick();
                  setSummaryTab('reflection');
                  setVictoryPopupOpen(false);
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm sm:text-body-base font-bold transition-colors cursor-pointer border border-white/10 flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">psychology</span>
                <span>Góc suy ngẫm</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  audio.playClick();
                  setSummaryTab('dashboard');
                  setVictoryPopupOpen(false);
                }}
                className="pinch-host w-full sm:w-auto px-5 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-amber-400 via-tertiary to-emerald-300 text-[#032117] text-body-base sm:text-headline-sm font-black uppercase tracking-wide shadow-[0_0_20px_rgba(251,191,36,0.45)] hover:brightness-110 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[20px]">emoji_events</span>
                <span>XEM DASHBOARD & TOP 1-2-3</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THANH ĐIỀU HƯỚNG TỔNG KẾT VỚI TAB DASHBOARD & GÓC SUY NGẪM */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-surface-container-low/85 backdrop-blur-xl px-3 sm:px-4 py-2 rounded-xl shadow-md border border-white/10 ppt-stagger-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary text-[9.5px] sm:text-label-kicker uppercase font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
            BƯỚC 04 / 04 • TỔNG KẾT
          </span>
        </div>

        {/* 2 TAB CHUYỂN ĐỔI: DASHBOARD GOLIVE & GÓC SUY NGẪM */}
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
              setSummaryTab('reflection');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-sm font-bold transition-all cursor-pointer ${
              summaryTab === 'reflection'
                ? 'bg-primary-container text-on-primary-container shadow-[0_0_15px_rgba(57,90,210,0.4)]'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">psychology</span>
            <span className="text-[11px] sm:text-body-sm">GÓC SUY NGẪM SƯ PHẠM</span>
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

      {/* 4 Thẻ chỉ số gọn gàng (bao gồm Thời gian hoàn thành & Số câu đúng) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 ppt-stagger-2">
        <div className="lux-card bg-surface-container/90 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col justify-between shadow-md border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-tertiary" />
          <span className="text-[9.5px] sm:text-label-kicker text-on-surface-variant uppercase">ĐỘI CON NGƯỜI</span>
          <div className="text-metric-display text-tertiary my-1">{stats.humanScore} PTS</div>
          <span className="text-[10px] sm:text-label-caps text-tertiary">
            LỰC KÉO {stats.ropeMeters >= 0 ? `+${stats.ropeMeters}M` : `${stats.ropeMeters}M`}
          </span>
        </div>

        <div className="lux-card bg-surface-container/90 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col justify-between shadow-md border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-secondary" />
          <span className="text-[9.5px] sm:text-label-kicker text-on-surface-variant uppercase">ĐỘI AI BOTS</span>
          <div className="text-metric-display text-secondary my-1">{stats.aiScore} PTS</div>
          <span className="text-[10px] sm:text-label-caps text-on-surface-variant">ĐIỂM MÔ PHỎNG</span>
        </div>

        <div className="lux-card bg-surface-container/90 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col justify-between shadow-md border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
          <span className="text-[9.5px] sm:text-label-kicker text-on-surface-variant uppercase">ĐỘ CHÍNH XÁC</span>
          <div className="text-metric-display text-primary my-1">{accuracy}%</div>
          <span className="text-[10px] sm:text-label-caps text-on-surface-variant">
            {stats.correctCount} / {stats.totalQuestions} CÂU ĐÚNG
          </span>
        </div>

        <div className="lux-card bg-surface-container/90 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col justify-between shadow-md border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-400" />
          <span className="text-[9.5px] sm:text-label-kicker text-on-surface-variant uppercase">THỜI GIAN HOÀN THÀNH</span>
          <div className="text-metric-display text-amber-300 font-mono my-1">⏱️ {stats.totalDurationSec || 40.0}s</div>
          <span className="text-[10px] sm:text-label-caps text-emerald-400 font-bold">
            🔥 CHUỖI THẮNG x{stats.maxWinStreak} • {stats.avgReactionSec}s/câu
          </span>
        </div>
      </div>

      {/* NỘI DUNG CHÍNH THEO TAB ĐÃ CHỌN */}
      {summaryTab === 'dashboard' ? (
        <div className="flex flex-col gap-4 w-full">
          {/* COMPONENT DASHBOARD & BẢNG VINH DANH TOP 1-2-3 */}
          <DashboardLeaderboard currentStats={stats} />

          {/* Nút hành động chân trang */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-surface-container-low/90 border border-white/10 shadow-lg">
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
                setSummaryTab('reflection');
              }}
              className="text-tertiary hover:underline text-body-sm font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Xem Góc suy ngẫm sư phạm</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 w-full">
          {/* Khối trung tâm: Mascot + Góc Suy Ngẫm Sư Phạm */}
          <div className="rounded-xl sm:rounded-2xl bg-surface-container-low/95 p-3.5 sm:p-5 shadow-2xl relative overflow-hidden border border-white/10 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 items-center ppt-stagger-3">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-tertiary via-primary-container to-tertiary" />

            {/* Cột Mascot */}
            <div className="lg:col-span-4 flex flex-row lg:flex-col items-center justify-center text-center gap-2.5">
              <div className="relative w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 flex items-center justify-center shrink-0">
                <div className="absolute inset-0 bg-tertiary/20 rounded-full blur-xl animate-pulse" />
                <img
                  alt="Mana mascot"
                  className="w-full h-full object-contain relative z-10 drop-shadow-[0_8px_18px_rgba(0,0,0,0.5)] ppt-mascot-enter"
                  src={BRAND_MASCOTS.welcomeAnimated}
                />
              </div>
              <span className="text-[10px] sm:text-label-caps text-tertiary uppercase font-bold">
                THẦY CÔ LÀM CHỦ • AI TRỢ LỰC
              </span>
            </div>

            {/* Cột Thông điệp cốt lõi */}
            <div className="lg:col-span-8 flex flex-col gap-2.5 sm:gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1 text-tertiary">
                  <span className="material-symbols-outlined text-[18px]">psychology</span>
                  <span className="text-[10px] sm:text-label-caps uppercase font-bold">GÓC SUY NGẪM SƯ PHẠM</span>
                </div>
                <blockquote className="text-sm sm:text-headline-sm text-on-surface pl-3 relative leading-snug font-bold">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary rounded-full" />
                  “Điều gì giúp chúng ta xác định khi nào AI có thể hỗ trợ con người hiệu quả nhất trong lớp học?”
                </blockquote>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                <div className="p-2.5 sm:p-3 rounded-lg bg-surface-container/80 border border-white/5">
                  <span className="text-[10px] sm:text-label-caps text-tertiary uppercase block mb-0.5 font-bold">
                    1. Ranh giới Tự Động Hóa vs AI
                  </span>
                  <p className="text-xs sm:text-body-sm text-on-surface-variant leading-snug">
                    Sử dụng AI để gợi ý học liệu, phân tích dữ liệu; giữ sự thấu cảm và quyết định sư phạm cho giáo viên.
                  </p>
                </div>
                <div className="p-2.5 sm:p-3 rounded-lg bg-surface-container/80 border border-white/5">
                  <span className="text-[10px] sm:text-label-caps text-secondary uppercase block mb-0.5 font-bold">
                    2. Rèn Tư Duy Phản Biện
                  </span>
                  <p className="text-xs sm:text-body-sm text-on-surface-variant leading-snug">
                    Hướng dẫn học sinh luôn kiểm chứng đầu ra của AI và làm chủ công nghệ trong 12 tiết học cốt lõi.
                  </p>
                </div>
              </div>

              {/* Nút thao tác */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
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
                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setSummaryTab('dashboard');
                  }}
                  className="text-tertiary hover:underline text-body-sm font-bold flex items-center gap-1 cursor-pointer ml-auto"
                >
                  <span className="material-symbols-outlined text-[16px]">leaderboard</span>
                  <span>Xem Bảng xếp hạng Dashboard</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
