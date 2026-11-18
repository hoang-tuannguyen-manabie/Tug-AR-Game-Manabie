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
          className="absolute inset-0 bg-gradient-to-br from-[#dbeafe] via-[#eff6ff] to-[#dcfce7] animate-pulse rounded-xl"
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
      className="fixed inset-0 z-[75] flex items-center justify-center p-2 sm:p-3 md:p-4 bg-[#1b3a8a]/40 backdrop-blur-md overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-setup-title"
    >
      {/* Nền chia đôi Pastel Xanh Mint / Xanh Sky kiểu Mana Oẳn Tù Xì */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-75" aria-hidden="true">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-[#ebf9f1]/80" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[#eaf2ff]/80" />
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-[#d3f2df]" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-[#d6e6ff]" />
      </div>

      <div className="relative w-full max-w-3xl md:max-w-4xl h-auto max-h-[96dvh] sm:max-h-[92dvh] rounded-2xl sm:rounded-3xl bg-white border-3 sm:border-4 border-[#2563eb] shadow-[0_8px_0_#133478,0_24px_60px_rgba(27,58,138,0.25)] overflow-hidden flex flex-col ppt-page-enter">
        {/* Thanh Header Royal Navy chuẩn Mana Oẳn Tù Xì */}
        <div className="mana-header-royal px-3 sm:px-5 py-2 sm:py-2.5 landscape:py-1.5 flex items-center justify-between gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Bước 1 */}
            <button
              type="button"
              onClick={() => {
                audio.playClick();
                setStep('name');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10.5px] sm:text-xs font-black transition-all cursor-pointer ${
                step === 'name'
                  ? 'btn-mana-orange'
                  : 'bg-white/15 text-white hover:bg-white/25 border border-white/30'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-black">
                1
              </span>
              <span>Nhập tên</span>
            </button>

            <span className="text-white/60 text-xs font-black">›</span>

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
              className={`flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10.5px] sm:text-xs font-black transition-all cursor-pointer ${
                step === 'character'
                  ? 'btn-mana-orange'
                  : 'bg-white/15 text-white hover:bg-white/25 border border-white/30'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-black">
                2
              </span>
              <span>Chọn nhân vật (36)</span>
            </button>

            <span className="text-white/60 text-xs font-black">›</span>

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
              className={`flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10.5px] sm:text-xs font-black transition-all cursor-pointer ${
                step === 'confirm'
                  ? 'btn-mana-orange'
                  : 'bg-white/15 text-white hover:bg-white/25 border border-white/30'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-black/20 flex items-center justify-center text-[10px] font-black">
                3
              </span>
              <span>Xác nhận</span>
            </button>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 text-white text-[10px] font-extrabold uppercase tracking-wider">
            <span>🎮</span>
            <span>Đấu Trường Kéo Co AI</span>
          </span>
        </div>

        {/* Nội dung chính bên trong Modal */}
        <div className="p-3 sm:p-5 landscape:p-2 flex flex-col flex-1 min-h-0 overflow-hidden bg-gradient-to-b from-[#f8fbff] to-white justify-between">
          {/* =================================================================
           * BƯỚC 1: NHẬP TÊN NGƯỜI CHƠI
           * ================================================================= */}
          {step === 'name' && (
            <form
              onSubmit={handleProceedToCharacter}
              className="flex flex-col items-center justify-center text-center gap-2.5 sm:gap-3.5 landscape:gap-1.5 py-1 sm:py-2 px-2 max-w-md mx-auto w-full flex-1 my-auto ppt-page-enter"
              noValidate
            >
              {/* Avatar xem trước trên nền Pastel Mint */}
              <div className="relative w-16 h-16 sm:w-22 sm:h-22 md:w-24 md:h-24 landscape:w-12 landscape:h-12 rounded-2xl sm:rounded-3xl bg-[#ebf9f1] border-3 sm:border-4 border-[#16a34a] p-1 sm:p-1.5 shadow-[0_4px_0_#0b5626] flex items-center justify-center shrink-0">
                <CharacterAvatar
                  character={selectedCharacter}
                  className="w-full h-full rounded-xl sm:rounded-2xl"
                  imgClassName="w-full h-full object-contain"
                />
                <span className="mana-keep-white absolute -bottom-2 px-2.5 py-0.5 rounded-full bg-[#16a34a] border-2 border-white text-white text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider shadow">
                  36 Nhân Vật
                </span>
              </div>

              <div className="flex flex-col gap-0.5 mt-1">
                <h2
                  id="player-setup-title"
                  className="text-base sm:text-xl md:text-2xl landscape:text-sm font-black text-[#1b3a8a] tracking-tight"
                >
                  Sẵn sàng tham gia thử thách?
                </h2>
                <p className="text-[11px] sm:text-xs md:text-sm landscape:text-[10px] text-slate-600 font-semibold">
                  Nhập tên và chọn nhân vật đồng hành trong Đấu trường Kéo co AI.
                </p>
              </div>

              <div className="w-full flex flex-col gap-1 text-left">
                <div className="flex items-center justify-between px-1">
                  <label
                    htmlFor="player-name-input"
                    className="text-[10.5px] sm:text-xs font-extrabold uppercase tracking-wider text-[#1b3a8a]"
                  >
                    Tên người chơi <span className="text-[#f47920]">*</span>
                  </label>
                  <span
                    className={`text-[10.5px] sm:text-xs font-mono font-bold ${
                      rawName.trim().length >= 18 ? 'text-[#d97706]' : 'text-slate-500'
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
                    className={`w-full px-3.5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-[#f0f7ff] border-3 text-sm sm:text-base font-extrabold text-[#1b3a8a] placeholder:text-slate-400 focus:outline-none focus:bg-white transition-all ${
                      errorMsg
                        ? 'border-red-500 focus:border-red-600 shadow-[0_3px_0_#b91c1c]'
                        : 'border-[#93c5fd] focus:border-[#2563eb] shadow-[0_3px_0_#cbd5e1] focus:shadow-[0_3px_0_#1d4ed8]'
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center cursor-pointer"
                      title="Xóa tên đang nhập"
                      aria-label="Xóa tên đang nhập"
                    >
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  )}
                </div>

                {errorMsg && (
                  <div
                    id="player-name-error"
                    role="alert"
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-50 border border-red-300 text-red-700 text-[11px] sm:text-xs font-bold"
                  >
                    <span className="material-symbols-outlined text-[16px] text-red-600 shrink-0">
                      error
                    </span>
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn-mana-orange w-full py-2.5 sm:py-3.5 px-5 rounded-full font-black text-xs sm:text-base landscape:text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-1"
              >
                <span>Tiếp tục chọn nhân vật</span>
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">arrow_forward</span>
              </button>
            </form>
          )}

          {/* =================================================================
           * BƯỚC 2: CHỌN NHÂN VẬT ĐỒNG HÀNH (36 NHÂN VẬT TỪ SPRITE SHEET)
           * ================================================================= */}
          {step === 'character' && (
            <div className="flex flex-col gap-2 sm:gap-2.5 landscape:gap-1 flex-1 min-h-0 ppt-page-enter">
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <h2
                    id="player-setup-title"
                    className="text-base sm:text-xl landscape:text-sm font-black text-[#1b3a8a] tracking-tight truncate"
                  >
                    Chọn bạn đồng hành
                  </h2>
                  <p className="text-[11px] sm:text-xs landscape:text-[10px] text-slate-600 font-medium truncate">
                    Xin chào <strong className="text-[#16a34a] font-extrabold">{rawName.trim()}</strong>! Chọn 1 trong 36 nhân vật:
                  </p>
                </div>

                {/* Thông tin nhân vật đang chọn hiện tại */}
                <div className="flex items-center gap-2 px-2.5 py-1 landscape:py-0.5 rounded-xl bg-[#ebf9f1] border-2 border-[#16a34a] shrink-0 shadow-xs">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 landscape:w-6 landscape:h-6 rounded-lg overflow-hidden bg-white border border-[#86efac] shrink-0 p-0.5">
                    <CharacterAvatar character={selectedCharacter} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] landscape:text-[8px] uppercase font-extrabold text-[#15803d] tracking-wider leading-none">
                      Đang chọn:
                    </span>
                    <span className="text-xs sm:text-sm landscape:text-[10.5px] font-black text-[#1b3a8a] leading-tight truncate max-w-[100px] sm:max-w-[140px]">
                      {selectedCharacter.name}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lưới 36 nhân vật - Bố trí gọn gàng, tự co giãn, không cuộn modal */}
              <div
                role="radiogroup"
                aria-label="Danh sách 36 nhân vật đồng hành"
                className="grid grid-cols-6 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-12 gap-1.5 sm:gap-2 landscape:gap-1 overflow-y-auto sm:overflow-hidden p-1 flex-1 min-h-0 items-center justify-items-center"
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
                      className={`group relative rounded-xl sm:rounded-2xl p-1 flex flex-col items-center justify-center transition-all duration-150 cursor-pointer select-none focus:outline-none aspect-square w-full max-w-[62px] ${
                        isSelected
                          ? 'bg-[#ebf9f1] border-2 sm:border-3 border-[#16a34a] shadow-[0_3px_0_#0b5626] scale-105 z-10'
                          : 'bg-white hover:bg-[#eaf2ff] border border-[#bfdbfe] hover:border-[#3b82f6] shadow-2xs'
                      }`}
                      title={char.name}
                    >
                      {/* Dấu kiểm nổi bật khi được chọn */}
                      {isSelected && (
                        <span
                          className="mana-keep-white absolute -top-1 -right-1 z-20 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#16a34a] border border-white text-white flex items-center justify-center shadow"
                          aria-hidden="true"
                        >
                          <span className="material-symbols-outlined text-[10px] sm:text-[12px] font-black">
                            check
                          </span>
                        </span>
                      )}

                      {/* Khung hiển thị nhân vật sắc nét */}
                      <div className="w-full h-full rounded-lg sm:rounded-xl overflow-hidden flex items-center justify-center p-0.5">
                        <CharacterAvatar
                          character={char}
                          className="w-full h-full"
                          imgClassName="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Thanh điều hướng Bước 2 cố định ở đáy, không bao giờ bị trôi */}
              <div className="flex items-center justify-between gap-3 pt-2 landscape:pt-1 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setStep('name');
                  }}
                  className="btn-mana-blue px-3.5 sm:px-4 py-2 sm:py-2.5 landscape:py-1.5 rounded-full font-black text-xs sm:text-sm landscape:text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px]">arrow_back</span>
                  <span>Sửa lại tên</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    setStep('confirm');
                  }}
                  className="btn-mana-orange px-5 sm:px-8 py-2 sm:py-2.5 landscape:py-1.5 rounded-full font-black text-xs sm:text-sm landscape:text-xs uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 cursor-pointer"
                >
                  <span>Xác nhận nhân vật</span>
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          )}

          {/* =================================================================
           * BƯỚC 3: XÁC NHẬN VÀ VÀO GAME
           * ================================================================= */}
          {step === 'confirm' && (
            <div className="flex flex-col items-center justify-center text-center gap-2.5 sm:gap-3 landscape:gap-1.5 py-1 sm:py-2 px-2 max-w-sm mx-auto w-full flex-1 my-auto ppt-page-enter">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#ebf9f1] border-2 border-[#16a34a] text-[#15803d] text-[11px] sm:text-xs font-black uppercase tracking-wider">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                <span>Hồ sơ chiến binh đã sẵn sàng</span>
              </div>

              {/* Thẻ Hồ sơ Người chơi & Nhân vật đồng hành */}
              <div className="w-full rounded-2xl sm:rounded-3xl mana-split-arena p-3 sm:p-4 landscape:p-2 flex flex-col items-center gap-2 relative overflow-hidden">
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 landscape:w-12 landscape:h-12 rounded-2xl bg-white border-3 sm:border-4 border-[#16a34a] p-1 shadow-[0_4px_0_#0b5626]">
                  <CharacterAvatar
                    character={selectedCharacter}
                    className="w-full h-full rounded-xl"
                    imgClassName="w-full h-full object-contain"
                  />
                  <span className="mana-keep-white absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#16a34a] border-2 border-white text-white flex items-center justify-center shadow">
                    <span className="material-symbols-outlined text-[13px] font-black">check</span>
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-600">
                    Người chơi
                  </span>
                  <h3
                    id="player-setup-title"
                    className="text-lg sm:text-xl font-black text-[#1b3a8a] tracking-wide"
                  >
                    {rawName.trim()}
                  </h3>
                  <div className="inline-flex items-center justify-center gap-1 mt-0.5 px-3 py-0.5 rounded-full bg-white border border-[#93c5fd] text-[#2563eb] text-[11px] sm:text-xs font-bold shadow-2xs">
                    <span>Đồng hành:</span>
                    <strong className="text-[#1b3a8a] font-black">{selectedCharacter.name}</strong>
                  </div>
                </div>
              </div>

              {/* Nút Bắt đầu chơi 3D Cam nổi bật */}
              <div className="flex flex-col gap-2 w-full mt-0.5">
                <button
                  type="button"
                  onClick={handleConfirmStartGame}
                  className="btn-mana-orange w-full py-2.5 sm:py-3 px-5 rounded-full font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px]">sports_esports</span>
                  <span>Bắt đầu chơi</span>
                </button>

                <div className="grid grid-cols-2 gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      audio.playClick();
                      setStep('name');
                    }}
                    className="btn-mana-blue py-2 px-3 rounded-full font-black text-xs flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                    <span>Đổi tên</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      audio.playClick();
                      setStep('character');
                    }}
                    className="btn-mana-green py-2 px-3 rounded-full font-black text-xs flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
                    <span>Đổi nhân vật</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
