import { ControlMode } from '../App';
import { PlayerProfile } from '../data/characters';
import { audio } from '../utils/audio';
import { HandSkeletonGraphic, MouseGraphic } from './InteractionGraphics';

interface InteractionModePageProps {
  controlMode: ControlMode;
  onSelectControlMode: (mode: ControlMode) => void;
  playerProfile: PlayerProfile | null;
  onOpenPlayerSetup: () => void;
  onBack: () => void;
  onNext: () => void;
  onDirectPlay?: () => void;
}

export function InteractionModePage({
  controlMode,
  onSelectControlMode,
  playerProfile,
  onOpenPlayerSetup,
  onBack,
  onNext,
  onDirectPlay,
}: InteractionModePageProps) {
  return (
    <div className="relative w-full h-full flex flex-col justify-between gap-1.5 sm:gap-2.5 landscape:gap-1 p-2 sm:p-3.5 md:p-5 landscape:p-1.5 overflow-hidden ppt-page-enter">
      {/* Top Header Chip & Player Info */}
      <div className="flex items-center justify-between pb-0.5 ppt-stagger-1 shrink-0 pr-[76px] sm:pr-28">
        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-0.5 rounded-full bg-[#ebf9f1] border-2 border-[#16a34a] shadow-xs">
          <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
          <span className="text-[9.5px] sm:text-xs text-[#15803d] uppercase font-black tracking-wide">
            BƯỚC 02 / 05 • CHỌN PHƯƠNG THỨC TƯƠNG TÁC
          </span>
        </div>
        <div className="flex items-center gap-2">
          {playerProfile && (
            <button
              type="button"
              onClick={onOpenPlayerSetup}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 rounded-full bg-[#ebf9f1] hover:bg-[#dcfce7] border-2 border-[#16a34a] text-[#1b3a8a] text-[10.5px] sm:text-[11px] font-black cursor-pointer transition-all shadow-xs"
              title="Đổi nhân vật hoặc tên người chơi"
            >
              <img
                src={playerProfile.characterImage}
                alt={playerProfile.characterName}
                className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full object-contain bg-white border border-[#86efac]"
              />
              <span className="truncate max-w-[85px] sm:max-w-[140px] text-[#15803d]">
                {playerProfile.playerName}
              </span>
              <span className="material-symbols-outlined text-[13px] sm:text-[14px] text-[#16a34a]">tune</span>
            </button>
          )}
          <span className="hidden md:inline-block text-[11px] text-secondary uppercase tracking-[0.14em] font-black">
            MANABIE EDTECH
          </span>
        </div>
      </div>

      {/* Tiêu đề trang chọn phương thức */}
      <div className="flex flex-col gap-0.5 ppt-stagger-1 shrink-0 text-center sm:text-left">
        <h1 className="text-base sm:text-xl md:text-2xl lg:text-3xl landscape:text-sm font-black text-on-surface uppercase leading-tight tracking-tight">
          CHỌN PHƯƠNG THỨC <span className="text-[#2563eb]">TƯƠNG TÁC THI ĐẤU</span>
        </h1>
        <p className="text-[11px] sm:text-xs md:text-body-sm landscape:text-[9.5px] text-on-surface-variant font-bold">
          Chọn 1 trong 2 cách điều khiển kéo co bên dưới để bắt đầu:
        </p>
      </div>

      {/* VÙNG CHIA ĐÔI 2 PHƯƠNG THỨC TƯƠNG TÁC TOÀN DIỆN */}
      <div className="grid grid-cols-1 md:grid-cols-2 landscape:grid-cols-2 gap-2.5 sm:gap-4 md:gap-5 flex-1 min-h-0 items-stretch ppt-stagger-2">
        {/* CỘT 1: NHẬN DIỆN BÀN TAY (CAMERA AR) */}
        <button
          type="button"
          onClick={() => {
            audio.init();
            audio.playClick();
            onSelectControlMode('ar');
            onNext();
          }}
          className={`relative group rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 landscape:p-2.5 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer border-3 overflow-hidden select-none hover:scale-[1.01] active:scale-[0.99] gap-2 ${
            controlMode === 'ar'
              ? 'bg-gradient-to-b from-[#f0fdf4] to-[#dcfce7] border-[#16a34a] shadow-[0_6px_0_#15803d,0_16px_36px_rgba(22,163,74,0.22)]'
              : 'bg-white hover:bg-slate-50 border-[#cbd5e1] hover:border-[#16a34a]/60 shadow-[0_4px_0_#cbd5e1]'
          }`}
        >
          {/* Badge trạng thái góc trên */}
          <div className="flex items-center justify-between w-full shrink-0">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[#16a34a] text-white text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-wider shadow-xs"
              style={{ color: '#ffffff' }}
            >
              <span className="material-symbols-outlined text-[15px] sm:text-[17px]" style={{ color: '#ffffff' }}>videocam</span>
              <span style={{ color: '#ffffff' }}>GIƠ TAY (CAMERA)</span>
            </span>
            {controlMode === 'ar' ? (
              <span
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[#15803d] text-white text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-wider shadow-xs"
                style={{ color: '#ffffff' }}
              >
                <span className="material-symbols-outlined text-[14px] sm:text-[16px]" style={{ color: '#ffffff' }}>check_circle</span>
                <span style={{ color: '#ffffff' }}>ĐANG CHỌN</span>
              </span>
            ) : (
              <span className="text-[10.5px] sm:text-xs font-bold text-slate-400 group-hover:text-slate-600">
                Nhấn để chọn
              </span>
            )}
          </div>

          {/* Hình minh họa: Bàn tay viền gạch đứt nét chuẩn AR */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-1 sm:py-2">
            <div className="relative h-16 sm:h-20 md:h-24 lg:h-28 aspect-square rounded-2xl bg-white/95 border-2 border-[#86efac] p-2 sm:p-2.5 shadow-[0_4px_16px_rgba(22,163,74,0.12)] flex items-center justify-center group-hover:scale-105 transition-all duration-300">
              <div className="absolute inset-0 rounded-2xl bg-[#ebf9f1]/60 pointer-events-none" />
              <img
                src="/assets/ar-hand-dashed.png"
                alt="Nhận diện bàn tay AR gạch đứt"
                className="w-full h-full object-contain relative z-10 drop-shadow-[0_4px_10px_rgba(234,88,12,0.2)]"
              />
            </div>
          </div>

          {/* Mô tả thông tin - Siêu ngắn gọn, đọc 3-5 giây cho người non-tech */}
          <div className="flex flex-col gap-1 shrink-0 w-full">
            <h2 className="text-sm sm:text-base md:text-lg landscape:text-xs font-black text-[#15803d] tracking-tight">
              Giơ tay trước Camera
            </h2>
            <p className="text-[11.5px] sm:text-xs md:text-body-sm landscape:text-[10px] text-slate-700 font-semibold leading-relaxed">
              Đưa tay sang <strong>Trái</strong> hoặc <strong>Phải</strong> trước camera để chọn đáp án và kéo co.
            </p>
            <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 sm:py-1 rounded-xl bg-white/90 border border-[#86efac]/80 text-[10px] sm:text-xs landscape:text-[8.5px] font-bold text-[#15803d] shadow-2xs self-start">
              <span className="material-symbols-outlined text-[14px] sm:text-[16px] text-[#16a34a]">verified</span>
              <span>Dành cho máy có camera / webcam</span>
            </div>
          </div>
        </button>

        {/* CỘT 2: SỬ DỤNG CHUỘT / CẢM ỨNG */}
        <button
          type="button"
          onClick={() => {
            audio.init();
            audio.playClick();
            onSelectControlMode('mouse');
            onNext();
          }}
          className={`relative group rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 landscape:p-2.5 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer border-3 overflow-hidden select-none hover:scale-[1.01] active:scale-[0.99] gap-2 ${
            controlMode === 'mouse'
              ? 'bg-gradient-to-b from-[#eff6ff] to-[#dbeafe] border-[#2563eb] shadow-[0_6px_0_#1d4ed8,0_16px_36px_rgba(37,99,235,0.22)]'
              : 'bg-white hover:bg-slate-50 border-[#cbd5e1] hover:border-[#2563eb]/60 shadow-[0_4px_0_#cbd5e1]'
          }`}
        >
          {/* Badge trạng thái góc trên */}
          <div className="flex items-center justify-between w-full shrink-0">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[#2563eb] text-white text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-wider shadow-xs"
              style={{ color: '#ffffff' }}
            >
              <span className="material-symbols-outlined text-[15px] sm:text-[17px]" style={{ color: '#ffffff' }}>mouse</span>
              <span style={{ color: '#ffffff' }}>CHUỘT / CẢM ỨNG</span>
            </span>
            {controlMode === 'mouse' ? (
              <span
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[#1d4ed8] text-white text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-wider shadow-xs"
                style={{ color: '#ffffff' }}
              >
                <span className="material-symbols-outlined text-[14px] sm:text-[16px]" style={{ color: '#ffffff' }}>check_circle</span>
                <span style={{ color: '#ffffff' }}>ĐANG CHỌN</span>
              </span>
            ) : (
              <span className="text-[10.5px] sm:text-xs font-bold text-slate-400 group-hover:text-slate-600">
                Nhấn để chọn
              </span>
            )}
          </div>

          {/* Hình minh họa: Chuột máy tính gạch chấm 3D */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-1 sm:py-2">
            <div className="relative h-16 sm:h-20 md:h-24 lg:h-28 aspect-square rounded-2xl bg-white/95 border-2 border-[#bfdbfe] p-2 sm:p-2.5 shadow-[0_4px_16px_rgba(37,99,235,0.12)] flex items-center justify-center group-hover:scale-105 transition-all duration-300">
              <div className="absolute inset-0 rounded-2xl bg-[#eaf2ff]/60 pointer-events-none" />
              <MouseGraphic color="#2563eb" className="w-full h-full relative z-10 drop-shadow-[0_4px_10px_rgba(37,99,235,0.18)]" />
            </div>
          </div>

          {/* Mô tả thông tin - Siêu ngắn gọn, đọc 3-5 giây cho người non-tech */}
          <div className="flex flex-col gap-1 shrink-0 w-full">
            <h2 className="text-sm sm:text-base md:text-lg landscape:text-xs font-black text-[#1d4ed8] tracking-tight">
              Bấm Chuột hoặc Chạm màn hình
            </h2>
            <p className="text-[11.5px] sm:text-xs md:text-body-sm landscape:text-[10px] text-slate-700 font-semibold leading-relaxed">
              Bấm trực tiếp vào đáp án trên màn hình hoặc click chuột để kéo co.
            </p>
            <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 sm:py-1 rounded-xl bg-white/90 border border-[#bfdbfe]/80 text-[10px] sm:text-xs landscape:text-[8.5px] font-bold text-[#1d4ed8] shadow-2xs self-start">
              <span className="material-symbols-outlined text-[14px] sm:text-[16px] text-[#2563eb]">touch_app</span>
              <span>Dành cho màn hình cảm ứng, TV & chuột</span>
            </div>
          </div>
        </button>
      </div>

      {/* THANH ĐIỀU HƯỚNG DƯỚI CÙNG */}
      <div className="flex items-center justify-between gap-2 pt-0.5 ppt-stagger-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 sm:px-6 py-1.5 sm:py-2.5 rounded-full bg-white hover:bg-slate-100 border-2 border-slate-300 text-slate-700 text-xs sm:text-body-sm font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px] sm:text-[18px]">arrow_back</span>
          <span>QUAY LẠI</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {onDirectPlay && (
            <button
              type="button"
              onClick={() => {
                audio.init();
                audio.playClick();
                onDirectPlay();
              }}
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[#f47920] hover:bg-[#ea580c] border-2 border-white text-white text-[10.5px] sm:text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-[0_2px_0_#c2410c] transition-all active:scale-95 uppercase tracking-wide"
              title="Bỏ qua hướng dẫn & Vào chơi kéo co ngay"
            >
              <span>Vào chơi ngay (Bỏ qua HD)</span>
              <span className="material-symbols-outlined text-[15px] sm:text-[17px]">fast_forward</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              audio.init();
              audio.playClick();
              onNext();
            }}
            className="btn-mana-blue px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-body-sm font-black flex items-center gap-1.5 cursor-pointer uppercase tracking-wider shadow-xs transition-all active:scale-95"
          >
            <span>HƯỚNG DẪN</span>
            <span className="material-symbols-outlined text-[15px] sm:text-[17px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
