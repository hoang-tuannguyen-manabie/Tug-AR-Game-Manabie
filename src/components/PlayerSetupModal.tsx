import React, { useEffect, useRef, useState } from 'react';
import {
  CHARACTERS_SPRITE_SHEET,
  getCharacterById,
  PLAYER_CHARACTERS,
  PlayerCharacter,
  PlayerProfile,
} from '../data/characters';
import { audio } from '../utils/audio';

export type SetupStep = 'name' | 'character' | 'confirm';

interface PlayerSetupModalProps {
  open: boolean;
  initialProfile: PlayerProfile | null;
  initialStep?: SetupStep;
  onConfirm: (profile: PlayerProfile) => void;
  onClose?: () => void;
}

/**
 * Hiển thị hình ảnh nhân vật đã tách từ sprite sheet,
 * kèm trạng thái loading và cơ chế fallback sang CSS Sprite theo tọa độ thực tế nếu file ảnh lẻ gặp lỗi.
 */
export function CharacterAvatar({
  character,
  className = 'w-full h-full',
  imgClassName = 'w-full h-full object-contain',
}: {
  character: PlayerCharacter;
  className?: string;
  imgClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [useSpriteFallback, setUseSpriteFallback] = useState(false);

  // Tọa độ gốc trên sprite sheet 513x486 để dùng làm fallback CSS sprite nếu cần
  const { x, y, width, height } = character.cropRect;
  const bgPosX = (x / (513 - width)) * 100;
  const bgPosY = (y / (486 - height)) * 100;
  const bgSizeX = (513 / width) * 100;
  const bgSizeY = (486 / height) * 100;

  return (
    <div className={`relative overflow-hidden flex items-center justify-center select-none ${className}`}>
      {!loaded && !useSpriteFallback && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#2a1b5e] via-[#3b267e] to-[#1e1246] animate-pulse rounded-xl"
          aria-hidden="true"
        />
      )}

      {!useSpriteFallback ? (
        <img
          src={character.image}
          alt={character.name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setUseSpriteFallback(true);
            setLoaded(true);
          }}
          className={`${imgClassName} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : (
        <div
          role="img"
          aria-label={character.name}
          className="w-full h-full rounded-xl"
          style={{
            backgroundImage: `url(${CHARACTERS_SPRITE_SHEET})`,
            backgroundPosition: `${bgPosX.toFixed(3)}% ${bgPosY.toFixed(3)}%`,
            backgroundSize: `${bgSizeX.toFixed(3)}% ${bgSizeY.toFixed(3)}%`,
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}
    </div>
  );
}

export function PlayerSetupModal({
  open,
  initialProfile,
  initialStep = 'name',
  onConfirm,
  onClose,
}: PlayerSetupModalProps) {
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [rawName, setRawName] = useState<string>(initialProfile?.playerName ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string>(
    initialProfile?.characterId ?? PLAYER_CHARACTERS[0].id
  );
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Đồng bộ lại state khi mở modal
  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setRawName(initialProfile?.playerName ?? '');
      setSelectedCharId(initialProfile?.characterId ?? PLAYER_CHARACTERS[0].id);
      setErrorMsg(null);
    }
  }, [open, initialStep, initialProfile]);

  // Tự động focus vào ô nhập tên ở Bước 1
  useEffect(() => {
    if (open && step === 'name') {
      const t = window.setTimeout(() => {
        nameInputRef.current?.focus();
      }, 80);
      return () => window.clearTimeout(t);
    }
  }, [open, step]);

  if (!open) return null;

  const selectedCharacter = getCharacterById(selectedCharId);

  const validateName = (input: string): { valid: boolean; cleaned: string; error: string | null } => {
    const cleaned = input.trim();
    if (input.length === 0) {
      return {
        valid: false,
        cleaned: '',
        error: 'Vui lòng nhập tên của bạn trước khi tiếp tục nhé!',
      };
    }
    if (cleaned.length === 0) {
      return {
        valid: false,
        cleaned: '',
        error: 'Tên không được chỉ chứa khoảng trắng. Hãy nhập tên thật hoặc biệt danh của bạn!',
      };
    }
    if (cleaned.length > 20) {
      return {
        valid: false,
        cleaned: cleaned.slice(0, 20),
        error: 'Tên tối đa 20 ký tự để hiển thị đẹp nhất trên bảng điểm!',
      };
    }
    return { valid: true, cleaned, error: null };
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length > 20) {
      setRawName(val.slice(0, 20));
      setErrorMsg('Tên tối đa 20 ký tự!');
      return;
    }
    setRawName(val);
    if (errorMsg) {
      setErrorMsg(null);
    }
  };

  const handleProceedToCharacter = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    audio.init();
    const res = validateName(rawName);
    if (!res.valid) {
      setErrorMsg(res.error);
      nameInputRef.current?.focus();
      return;
    }
    audio.playClick();
    setRawName(res.cleaned);
    setErrorMsg(null);
    setStep('character');
  };

  const handleSelectCharacter = (char: PlayerCharacter) => {
    audio.init();
    audio.playClick();
    setSelectedCharId(char.id);
  };

  const handleGridKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % PLAYER_CHARACTERS.length;
    else if (e.key === 'ArrowLeft')
      nextIndex = (index - 1 + PLAYER_CHARACTERS.length) % PLAYER_CHARACTERS.length;
    else if (e.key === 'ArrowDown') nextIndex = Math.min(PLAYER_CHARACTERS.length - 1, index + 6);
    else if (e.key === 'ArrowUp') nextIndex = Math.max(0, index - 6);

    if (nextIndex !== null) {
      e.preventDefault();
      const nextChar = PLAYER_CHARACTERS[nextIndex];
      handleSelectCharacter(nextChar);
      const btn = document.getElementById(`char-option-${nextChar.id}`);
      btn?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      audio.playClick();
      setStep('confirm');
    }
  };

  const handleConfirmStartGame = () => {
    const res = validateName(rawName);
    if (!res.valid) {
      setStep('name');
      setErrorMsg(res.error);
      return;
    }
    audio.init();
    audio.playClick();
    onConfirm({
      playerName: res.cleaned,
      characterId: selectedCharacter.id,
      characterImage: selectedCharacter.image,
      characterName: selectedCharacter.name,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-[#0d0628]/90 backdrop-blur-xl overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-setup-title"
    >
      {/* Hiệu ứng nền Tím Vũ Trụ & Hạt sáng giáo dục hiện đại */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-28 -left-28 w-96 h-96 rounded-full bg-[#6d28d9]/30 blur-3xl" />
        <div className="absolute -bottom-28 -right-28 w-96 h-96 rounded-full bg-[#10b981]/20 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-[#8b5cf6]/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl rounded-3xl bg-gradient-to-br from-[#231454]/95 via-[#1a0f40]/95 to-[#12092e]/95 border-2 border-[#8b5cf6]/40 shadow-[0_24px_80px_rgba(0,0,0,0.75),0_0_50px_rgba(139,92,246,0.25)] p-4 sm:p-6 md:p-7 flex flex-col gap-3 sm:gap-4 max-h-[94vh] overflow-y-auto ppt-page-enter">
        {/* Thanh tiến trình 3 bước */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
            {/* Bước 1 */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setStep('name');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                step === 'name'
                  ? 'bg-emerald-400 text-[#052e16] shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                  : 'bg-[#2e1a68] text-purple-200 hover:bg-[#3b2282]'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-black">
                1
              </span>
              <span>Nhập tên</span>
            </button>

            <span className="text-purple-400/60 text-xs font-bold">›</span>

            {/* Bước 2 */}
            <button
              type="button"
              onClick={() => {
                const res = validateName(rawName);
                if (!res.valid) {
                  setErrorMsg(res.error);
                  setStep('name');
                  return;
                }
                audio.playClick();
                setRawName(res.cleaned);
                setStep('character');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                step === 'character'
                  ? 'bg-emerald-400 text-[#052e16] shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                  : 'bg-[#2e1a68] text-purple-200 hover:bg-[#3b2282]'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-black">
                2
              </span>
              <span>Chọn nhân vật (36)</span>
            </button>

            <span className="text-purple-400/60 text-xs font-bold">›</span>

            {/* Bước 3 */}
            <button
              type="button"
              onClick={() => {
                const res = validateName(rawName);
                if (!res.valid) {
                  setErrorMsg(res.error);
                  setStep('name');
                  return;
                }
                audio.playClick();
                setRawName(res.cleaned);
                setStep('confirm');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                step === 'confirm'
                  ? 'bg-emerald-400 text-[#052e16] shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                  : 'bg-[#2e1a68] text-purple-200 hover:bg-[#3b2282]'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-black">
                3
              </span>
              <span>Xác nhận</span>
            </button>
          </div>
        </div>

        {/* =================================================================
         * BƯỚC 1: NHẬP TÊN NGƯỜI CHƠI
         * ================================================================= */}
        {step === 'name' && (
          <form
            onSubmit={handleProceedToCharacter}
            className="flex flex-col items-center justify-center text-center gap-4 py-3 sm:py-5 px-2 max-w-lg mx-auto w-full ppt-page-enter"
            noValidate
          >
            {/* Avatar xem trước sinh động */}
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-[#2b1766] border-2 border-purple-400/50 p-2 shadow-[0_12px_32px_rgba(139,92,246,0.4)] flex items-center justify-center">
              <CharacterAvatar
                character={selectedCharacter}
                className="w-full h-full rounded-2xl"
                imgClassName="w-full h-full object-contain"
              />
              <span className="absolute -bottom-2 px-2.5 py-0.5 rounded-full bg-emerald-400 text-[#052e16] text-[10px] font-black uppercase tracking-wider shadow">
                36 Nhân Vật
              </span>
            </div>

            <div className="flex flex-col gap-1.5 mt-1">
              <h2
                id="player-setup-title"
                className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight"
              >
                Sẵn sàng tham gia thử thách?
              </h2>
              <p className="text-xs sm:text-sm text-purple-200/90 font-medium">
                Nhập tên và chọn nhân vật đồng hành của bạn.
              </p>
            </div>

            <div className="w-full flex flex-col gap-2 text-left mt-1">
              <div className="flex items-center justify-between px-1">
                <label
                  htmlFor="player-name-input"
                  className="text-xs font-bold uppercase tracking-wider text-purple-200"
                >
                  Tên người chơi <span className="text-emerald-400">*</span>
                </label>
                <span
                  className={`text-xs font-mono font-bold ${
                    rawName.trim().length >= 18 ? 'text-amber-300' : 'text-purple-300/80'
                  }`}
                >
                  {rawName.trim().length}/20 ký tự
                </span>
              </div>

              <div className="relative">
                <input
                  ref={nameInputRef}
                  id="player-name-input"
                  type="text"
                  inputMode="text"
                  enterKeyHint="next"
                  autoComplete="nickname"
                  maxLength={20}
                  value={rawName}
                  onChange={handleNameChange}
                  placeholder="Tên của bạn là gì?"
                  aria-invalid={Boolean(errorMsg)}
                  aria-describedby={errorMsg ? 'player-name-error' : undefined}
                  className={`w-full px-4 py-3.5 rounded-2xl bg-[#140a30] border-2 text-base sm:text-lg font-bold text-white placeholder:text-purple-300/45 focus:outline-none transition-all shadow-inner ${
                    errorMsg
                      ? 'border-rose-400 focus:border-rose-400 shadow-[0_0_20px_rgba(251,113,133,0.25)]'
                      : 'border-purple-400/40 focus:border-emerald-400 focus:shadow-[0_0_24px_rgba(52,211,153,0.3)]'
                  }`}
                />
                {rawName.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawName('');
                      setErrorMsg(null);
                      nameInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-purple-200 flex items-center justify-center cursor-pointer"
                    title="Xóa tên đang nhập"
                    aria-label="Xóa tên đang nhập"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>

              {errorMsg && (
                <div
                  id="player-name-error"
                  role="alert"
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-200 text-xs sm:text-sm font-semibold"
                >
                  <span className="material-symbols-outlined text-[18px] text-rose-300 shrink-0">
                    error
                  </span>
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-400 via-[#2dd4bf] to-emerald-300 text-[#042f2e] font-black text-sm sm:text-base uppercase tracking-wider shadow-[0_8px_25px_rgba(52,211,153,0.4)] hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-emerald-400/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Tiếp tục chọn nhân vật</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </form>
        )}

        {/* =================================================================
         * BƯỚC 2: CHỌN NHÂN VẬT ĐỒNG HÀNH (36 NHÂN VẬT TỪ SPRITE SHEET)
         * ================================================================= */}
        {step === 'character' && (
          <div className="flex flex-col gap-3 flex-1 min-h-0 ppt-page-enter">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <div>
                <h2
                  id="player-setup-title"
                  className="text-lg sm:text-2xl font-black text-white tracking-tight"
                >
                  Chọn nhân vật đồng hành
                </h2>
                <p className="text-xs sm:text-sm text-purple-200/85">
                  Xin chào <strong className="text-emerald-300">{rawName.trim()}</strong>! Hãy chọn 1 trong 36 người bạn đồng hành bên dưới:
                </p>
              </div>

              {/* Thông tin nhân vật đang chọn hiện tại */}
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-[#2a1760]/90 border border-emerald-400/40 shrink-0 self-start sm:self-center shadow-md">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-[#1a0e40] border border-white/15 shrink-0">
                  <CharacterAvatar character={selectedCharacter} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">
                    Đang chọn:
                  </span>
                  <span className="text-xs sm:text-sm font-black text-white leading-tight">
                    {selectedCharacter.name}
                  </span>
                </div>
              </div>
            </div>

            {/* Lưới 36 nhân vật có thanh cuộn mượt, responsive 2-3 cột trên mobile và 6 cột trên desktop */}
            <div
              role="radiogroup"
              aria-label="Danh sách 36 nhân vật đồng hành"
              className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 sm:gap-3 overflow-y-auto pr-1 py-1 max-h-[48vh] sm:max-h-[52vh]"
            >
              {PLAYER_CHARACTERS.map((char, idx) => {
                const isSelected = char.id === selectedCharId;
                return (
                  <button
                    key={char.id}
                    id={`char-option-${char.id}`}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={char.name}
                    onClick={() => handleSelectCharacter(char)}
                    onKeyDown={(e) => handleGridKeyDown(e, idx)}
                    className={`group relative rounded-2xl p-2 flex flex-col items-center gap-1.5 transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                      isSelected
                        ? 'bg-gradient-to-b from-[#3b2185] to-[#251358] border-2 border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.55)] scale-[1.03] z-10'
                        : 'bg-[#1a0f3e]/90 hover:bg-[#28175c] border-2 border-purple-400/20 hover:border-purple-300/50 hover:scale-[1.04]'
                    }`}
                  >
                    {/* Dấu kiểm nổi bật khi được chọn */}
                    {isSelected && (
                      <span
                        className="absolute top-1.5 right-1.5 z-20 w-6 h-6 rounded-full bg-emerald-400 text-[#052e16] flex items-center justify-center shadow-[0_2px_10px_rgba(52,211,153,0.8)]"
                        aria-hidden="true"
                      >
                        <span className="material-symbols-outlined text-[16px] font-black">
                          check
                        </span>
                      </span>
                    )}

                    {/* Khung hiển thị nhân vật sắc nét, giữ nguyên tỷ lệ */}
                    <div className="w-full aspect-square rounded-xl overflow-hidden bg-[#1e1148] flex items-center justify-center p-0.5">
                      <CharacterAvatar
                        character={char}
                        className="w-full h-full rounded-lg"
                        imgClassName="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>

                    {/* Tên nhân vật */}
                    <span
                      className={`text-[10.5px] sm:text-[11px] font-bold text-center leading-tight line-clamp-1 w-full px-0.5 ${
                        isSelected ? 'text-emerald-300 font-black' : 'text-purple-100/90 group-hover:text-white'
                      }`}
                    >
                      {char.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Thanh điều hướng Bước 2 */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => {
                  audio.playClick();
                  setStep('name');
                }}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-purple-100 font-bold text-xs sm:text-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                <span>Sửa lại tên</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  audio.playClick();
                  setStep('confirm');
                }}
                className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-emerald-400 via-[#2dd4bf] to-emerald-300 text-[#042f2e] font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_6px_20px_rgba(52,211,153,0.4)] hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-emerald-400/50 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>Xác nhận nhân vật</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
         * BƯỚC 3: XÁC NHẬN VÀ VÀO GAME
         * ================================================================= */}
        {step === 'confirm' && (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-2 sm:py-3 px-2 max-w-md mx-auto w-full ppt-page-enter">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold uppercase tracking-wider">
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>Hồ sơ chiến binh đã sẵn sàng</span>
            </div>

            {/* Thẻ Hồ sơ Người chơi & Nhân vật đồng hành */}
            <div className="w-full rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#2d196b] to-[#1c0f45] border-2 border-emerald-400/60 p-3.5 sm:p-4 shadow-[0_0_30px_rgba(52,211,153,0.25)] flex flex-col items-center gap-2 relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-emerald-400/15 blur-2xl pointer-events-none" />

              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#1a0e40] border-2 border-emerald-400 p-1 shadow-[0_8px_20px_rgba(52,211,153,0.35)]">
                <CharacterAvatar
                  character={selectedCharacter}
                  className="w-full h-full rounded-xl"
                  imgClassName="w-full h-full object-contain"
                />
                <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-400 text-[#052e16] flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-[15px] font-black">check</span>
                </span>
              </div>

              <div className="flex flex-col gap-0.5 mt-0.5">
                <span className="text-[11px] uppercase font-bold tracking-widest text-purple-200/80">
                  Người chơi
                </span>
                <h3
                  id="player-setup-title"
                  className="text-xl sm:text-2xl font-black text-white tracking-wide"
                >
                  {rawName.trim()}
                </h3>
                <div className="inline-flex items-center justify-center gap-1.5 mt-0.5 px-3 py-0.5 rounded-full bg-purple-900/70 border border-purple-400/30 text-emerald-300 text-xs font-bold">
                  <span>Đồng hành cùng:</span>
                  <strong className="text-white">{selectedCharacter.name}</strong>
                </div>
              </div>
            </div>

            {/* Bố cục nút: Nút Bắt đầu chơi toàn chiều rộng trên 1 dòng, 2 nút đổi thông tin phụ bên dưới */}
            <div className="flex flex-col gap-2 w-full mt-1">
              <button
                type="button"
                onClick={handleConfirmStartGame}
                className="w-full py-3 px-5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-400 via-[#2dd4bf] to-emerald-300 text-[#042f2e] font-black text-sm sm:text-base uppercase tracking-wider shadow-[0_6px_24px_rgba(52,211,153,0.45)] hover:brightness-110 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-emerald-400/50 transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[20px] sm:text-[22px]">sports_esports</span>
                <span>Bắt đầu chơi</span>
              </button>

              <div className="grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setStep('name');
                  }}
                  className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-purple-100 font-bold text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap border border-white/10"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Đổi tên</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setStep('character');
                  }}
                  className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-purple-100 font-bold text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap border border-white/10"
                >
                  <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                  <span>Đổi nhân vật</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
