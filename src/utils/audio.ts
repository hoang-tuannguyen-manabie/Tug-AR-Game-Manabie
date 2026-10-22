/**
 * Hệ thống âm thanh Hybrid (Real SFX MP3 + Multi-layer WebAudio Synth & Drum Machine)
 * Tạo nhịp điệu dồn dập, sôi động cho Đấu trường Kéo co AI và hiệu ứng Chuỗi Thắng / Thua.
 */

type SfxKey =
  | 'battleDrums'
  | 'drumRoll'
  | 'comboStreak'
  | 'correctHit'
  | 'countdownTick'
  | 'crowdCheer'
  | 'loseStreak'
  | 'powerPull'
  | 'winFanfare'
  | 'wrongBuzzer';

const base = import.meta.env.BASE_URL || '/';
const sfxUrl = (relPath: string) => `${base}${relPath.replace(/^\/+/, '')}`;

const SFX_PATHS: Record<SfxKey, string> = {
  battleDrums: sfxUrl('assets/audio/battle-drums.mp3'),
  drumRoll: sfxUrl('assets/audio/drum-roll.mp3'),
  comboStreak: sfxUrl('assets/audio/combo-streak.mp3'),
  correctHit: sfxUrl('assets/audio/correct-hit.mp3'),
  countdownTick: sfxUrl('assets/audio/countdown-tick.mp3'),
  crowdCheer: sfxUrl('assets/audio/crowd-cheer.mp3'),
  loseStreak: sfxUrl('assets/audio/lose-streak.mp3'),
  powerPull: sfxUrl('assets/audio/power-pull.mp3'),
  winFanfare: sfxUrl('assets/audio/win-fanfare.mp3'),
  wrongBuzzer: sfxUrl('assets/audio/wrong-buzzer.mp3'),
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private initialized = false;
  private muted = false;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private ambientTimer: number | null = null;
  private currentMusicMode: 'none' | 'ambient' | 'battle' = 'none';
  private intensity = 0.35; // 0.0 -> 1.0: điều chỉnh độ dồn dập của nhạc nền đấu trường
  private sfxCache: Partial<Record<SfxKey, HTMLAudioElement>> = {};
  private battleDrumLoop: HTMLAudioElement | null = null;
  private sharedNoiseBuffer: AudioBuffer | null = null;
  private lastHoverTickTime = 0;
  private activeAmbientOscs: OscillatorNode[] = [];
  private activeBattleOscs: OscillatorNode[] = [];
  private activeSfxClones: HTMLAudioElement[] = [];

  init() {
    if (this.initialized) {
      this.ctx?.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.setValueAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime);
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.preloadSfx();
      this.initialized = true;
    } catch (e) {
      console.error('Audio context init failed', e);
    }
  }

  private preloadSfx() {
    (Object.keys(SFX_PATHS) as SfxKey[]).forEach((key) => {
      if (!this.sfxCache[key]) {
        const el = new Audio(SFX_PATHS[key]);
        el.preload = 'auto';
        this.sfxCache[key] = el;
      }
    });
  }

  private playSfxFile(key: SfxKey, volume = 0.7, playbackRate = 1.0) {
    if (this.muted) return;
    try {
      const base = this.sfxCache[key] ?? new Audio(SFX_PATHS[key]);
      this.sfxCache[key] = base;
      const clone = base.cloneNode(true) as HTMLAudioElement;
      clone.volume = this.muted ? 0 : Math.max(0, Math.min(1, volume));
      clone.playbackRate = playbackRate;
      clone.muted = this.muted;
      this.activeSfxClones.push(clone);
      clone.onended = () => {
        const idx = this.activeSfxClones.indexOf(clone);
        if (idx !== -1) this.activeSfxClones.splice(idx, 1);
      };
      clone.play().catch(() => undefined);
    } catch {
      // Fallback sang WebAudio nếu trình duyệt chặn
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      try {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setValueAtTime(muted ? 0 : 0.9, this.ctx.currentTime);
      } catch {
        // ignore
      }
    }
    if (this.ambientGain && this.ctx) {
      try {
        this.ambientGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.ambientGain.gain.setValueAtTime(muted ? 0 : 0.065, this.ctx.currentTime);
      } catch {
        // ignore
      }
    }
    if (this.battleDrumLoop) {
      this.battleDrumLoop.muted = muted;
      if (muted) {
        this.battleDrumLoop.pause();
      } else if (this.currentMusicMode === 'battle') {
        this.battleDrumLoop.volume = 0.24 + this.intensity * 0.2;
        this.battleDrumLoop.play().catch(() => undefined);
      }
    }

    if (muted) {
      for (const el of this.activeSfxClones) {
        try {
          el.muted = true;
          el.pause();
          el.currentTime = 0;
        } catch {
          // ignore
        }
      }
      this.activeSfxClones = [];
    } else {
      // Phục hồi lại nhạc nền theo đúng trang hiện tại khi người dùng bật âm thanh
      if (this.currentMusicMode === 'battle' && this.musicTimer === null) {
        this.playBattleMusic();
      } else if (this.currentMusicMode === 'ambient' && this.ambientTimer === null) {
        this.playAmbientMusic();
      }
    }
  }

  isMuted() {
    return this.muted;
  }

  getMusicMode() {
    return this.currentMusicMode;
  }

  /**
   * Âm thanh nền nhẹ nhàng, thư thái, cảm hứng sư phạm (DÀNH CHO TRANG 1 & TRANG 2)
   * Không có trống dồn dập, chỉ gồm các hợp âm Synth Pad ấm áp & tiếng chuông sao vi mô.
   */
  playAmbientMusic() {
    this.currentMusicMode = 'ambient';
    if (this.muted) return;
    this.stopMusic();
    this.currentMusicMode = 'ambient';

    const ctx = this.ready();
    if (!ctx || !this.master) return;

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.ambientGain.gain.exponentialRampToValueAtTime(
      0.065,
      ctx.currentTime + 1.2
    );
    this.ambientGain.connect(this.master);

    // Chuỗi hợp âm êm dịu, công nghệ giáo dục: Fmaj7 -> Cmaj9 -> Am7 -> Gsus4
    const chordProgressions = [
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [130.81, 196.0, 246.94, 293.66], // Cmaj9
      [110.0, 164.81, 196.0, 261.63],  // Am7
      [98.0, 146.83, 196.0, 261.63],   // Gsus4
    ];
    let chordIdx = 0;

    const playChord = () => {
      if (this.muted || !this.ctx || !this.ambientGain || this.currentMusicMode !== 'ambient') return;
      const t = this.ctx.currentTime;
      const chord = chordProgressions[chordIdx % chordProgressions.length];
      chordIdx += 1;

      chord.forEach((freq) => {
        if (!this.ctx || !this.ambientGain) return;
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, t);
        filter.frequency.exponentialRampToValueAtTime(680, t + 2.0);
        filter.frequency.exponentialRampToValueAtTime(360, t + 4.6);

        // Attack 1.2s, Release 3.4s
        noteGain.gain.setValueAtTime(0.0001, t);
        noteGain.gain.exponentialRampToValueAtTime(0.022, t + 1.2);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);

        osc.connect(filter);
        filter.connect(noteGain);
        noteGain.connect(this.ambientGain);

        this.activeAmbientOscs.push(osc);
        osc.onended = () => {
          const idx = this.activeAmbientOscs.indexOf(osc);
          if (idx !== -1) this.activeAmbientOscs.splice(idx, 1);
        };

        osc.start(t);
        osc.stop(t + 4.8);
      });

      // Tiếng chuông sao nhẹ nhàng (chime sparkle)
      if (Math.random() > 0.35) {
        const chimeFreq = [523.25, 659.25, 783.99, 1046.5][Math.floor(Math.random() * 4)];
        this.tone({
          type: 'sine',
          start: chimeFreq,
          end: chimeFreq,
          duration: 1.1,
          gain: 0.012,
        });
      }
    };

    playChord();
    this.ambientTimer = window.setInterval(playChord, 4400);
  }

  /**
   * Điều chỉnh mức độ dồn dập (0 -> 1) dựa theo chuỗi thắng/thua và thời gian còn lại
   * (Chỉ áp dụng khi đang ở mục 3: Đấu trường kéo co)
   */
  setIntensity(level: number) {
    const next = Math.max(0.15, Math.min(1, level));
    const prev = this.intensity;
    this.intensity = next;
    if (this.music && this.ctx) {
      this.music.gain.setTargetAtTime(0.12 + this.intensity * 0.09, this.ctx.currentTime, 0.15);
    }
    if (this.battleDrumLoop) {
      this.battleDrumLoop.volume = this.muted ? 0 : Math.min(0.45, 0.18 + this.intensity * 0.25);
      this.battleDrumLoop.playbackRate = 1 + this.intensity * 0.22;
    }
    // Nếu nhịp thay đổi đáng kể khi nhạc đang chạy, khởi động lại bộ đếm nhịp để tăng tốc BPM
    if (this.musicTimer !== null && Math.abs(next - prev) >= 0.22) {
      this.restartMusicLoop();
    }
  }

  /**
   * Âm thanh đấu trường dồn dập: Trống trận Battle Drums + Kick/Snare/Hi-hat + Driving Bass
   * CHỈ PHÁT TRONG MỤC 3: ĐẤU TRƯỜNG KÉO CO
   */
  playBattleMusic() {
    this.currentMusicMode = 'battle';
    if (this.muted) return;
    this.stopMusic();
    this.currentMusicMode = 'battle';

    const ctx = this.ready();
    if (!ctx || !this.master) return;

    this.currentMusicMode = 'battle';
    this.music = ctx.createGain();
    this.music.gain.value = 0.14 + this.intensity * 0.08;
    this.music.connect(this.master);

    // Bật lớp trống trận thực tế chạy nền
    try {
      if (!this.battleDrumLoop) {
        this.battleDrumLoop = new Audio(SFX_PATHS.battleDrums);
        this.battleDrumLoop.loop = true;
      }
      this.battleDrumLoop.muted = this.muted;
      this.battleDrumLoop.volume = this.muted ? 0 : 0.24 + this.intensity * 0.2;
      this.battleDrumLoop.playbackRate = 1 + this.intensity * 0.18;
      this.battleDrumLoop.currentTime = 0;
      this.battleDrumLoop.play().catch(() => undefined);
    } catch {
      // ignore
    }

    this.restartMusicLoop();
  }

  /**
   * Alias cho playBattleMusic() để tương thích ngược
   */
  startMusic() {
    this.playBattleMusic();
  }

  private restartMusicLoop() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    const bassNotes = [110, 110, 146.83, 164.81, 130.81, 146.83, 196, 220];
    const leadNotes = [440, 523.25, 587.33, 659.25, 587.33, 659.25, 783.99, 880];
    let step = 0;

    // Khoảng cách mỗi phách (16th/8th note): càng căng thẳng càng nhanh (220ms -> 145ms)
    const stepMs = Math.round(215 - this.intensity * 68);

    const pulse = () => {
      if (!this.ctx || !this.music || this.muted) return;
      const t = this.ctx.currentTime;

      // 1. Kick drum dồn dập ở các phách mạnh
      if (step % 2 === 0 || (this.intensity > 0.65 && step % 4 === 3)) {
        this.tone({
          type: 'sine',
          start: 135 + this.intensity * 25,
          end: 38,
          duration: 0.14,
          gain: 0.11 + this.intensity * 0.05,
        });
      }

      // 2. Snare / Clap ở phách 2 và 4
      if (step % 4 === 2) {
        this.noiseHit(0.05 + this.intensity * 0.03, 0.09, 1800);
        this.tone({
          type: 'triangle',
          start: 240,
          end: 110,
          duration: 0.08,
          gain: 0.05,
        });
      }

      // 3. Hi-hat liên tục tạo cảm giác chạy đua thời gian
      this.noiseHit(
        step % 2 === 1 ? 0.028 + this.intensity * 0.02 : 0.015,
        0.035,
        5200 + this.intensity * 1800
      );

      // 4. Driving Synth Bass
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = step % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.value = bassNotes[step % bassNotes.length] * (1 + (this.intensity > 0.8 ? 0.12 : 0));
      filter.type = 'lowpass';
      filter.frequency.value = 780 + this.intensity * 1300;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.music);

      this.activeBattleOscs.push(osc);
      osc.onended = () => {
        const idx = this.activeBattleOscs.indexOf(osc);
        if (idx !== -1) this.activeBattleOscs.splice(idx, 1);
      };

      osc.start(t);
      osc.stop(t + 0.21);

      // 5. Khi đang có Streak hoặc thời gian gấp, thêm lớp Arp Lead cao trào
      if (this.intensity >= 0.5 && step % 2 === 1) {
        this.tone({
          type: 'square',
          start: leadNotes[step % leadNotes.length],
          end: leadNotes[(step + 2) % leadNotes.length],
          duration: 0.1,
          gain: 0.028 * this.intensity,
          filterStart: 2800,
          filterEnd: 1200,
        });
      }

      step += 1;
    };

    pulse();
    this.musicTimer = window.setInterval(pulse, stepMs);
  }

  stopMusic() {
    this.currentMusicMode = 'none';
    this.intensity = 0.35;

    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ambientTimer !== null) {
      window.clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }

    // Dừng và ngắt kết nối đồng bộ toàn bộ Oscillator âm thanh nền còn dư
    for (const osc of this.activeAmbientOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // node đã dừng trước đó
      }
    }
    this.activeAmbientOscs = [];

    // Dừng và ngắt kết nối đồng bộ toàn bộ Oscillator đấu trường / synth bass
    for (const osc of this.activeBattleOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // node đã dừng trước đó
      }
    }
    this.activeBattleOscs = [];

    if (this.battleDrumLoop) {
      try {
        this.battleDrumLoop.pause();
        this.battleDrumLoop.currentTime = 0;
      } catch {
        // ignore
      }
    }

    if (this.music && this.ctx) {
      try {
        this.music.gain.cancelScheduledValues(this.ctx.currentTime);
        this.music.gain.setValueAtTime(0, this.ctx.currentTime);
        this.music.disconnect();
      } catch {
        // ignore
      }
      this.music = null;
    }

    if (this.ambientGain && this.ctx) {
      try {
        this.ambientGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.ambientGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.ambientGain.disconnect();
      } catch {
        // ignore
      }
      this.ambientGain = null;
    }
  }

  playClick() {
    if (this.muted) return;
    this.tone({ type: 'sine', start: 560, end: 880, duration: 0.07, gain: 0.05 });
  }

  playHoverTick() {
    if (this.muted) return;
    const now = performance.now();
    if (now - this.lastHoverTickTime < 180) return;
    this.lastHoverTickTime = now;
    this.tone({ type: 'triangle', start: 680, end: 960, duration: 0.04, gain: 0.025 });
  }

  /**
   * Âm thanh khi trả lời ĐÚNG & Kéo dây về phía Đội Con Người.
   * Cường độ và cao độ tăng dần theo chuỗi thắng (winStreak).
   */
  playPullSuccess(winStreak = 1) {
    if (this.muted) return;
    const pitchBoost = Math.min(6, Math.max(0, winStreak - 1)) * 55;
    this.playSfxFile('correctHit', 0.65, 1 + Math.min(0.35, (winStreak - 1) * 0.06));
    this.playSfxFile('powerPull', 0.55, 1 + Math.min(0.25, (winStreak - 1) * 0.05));

    // Synth arpeggio bùng nổ
    [0, 0.06, 0.12, 0.18].forEach((when, i) => {
      this.tone({
        type: 'triangle',
        start: 520 + pitchBoost + i * 165,
        end: 880 + pitchBoost + i * 210,
        duration: 0.22,
        gain: 0.07,
        when,
      });
    });

    // Nếu đạt chuỗi thắng từ 3 câu đúng liên tiếp trở lên (Win Streak >= 3), kích hoạt âm thanh Combo & Tiếng reo hò!
    if (winStreak >= 3) {
      this.playSfxFile('comboStreak', 0.82, 1 + Math.min(0.25, (winStreak - 3) * 0.07));
      this.playSfxFile('crowdCheer', 0.6, 1.05);
    }
  }

  /**
   * Âm thanh khi trả lời SAI hoặc Hết giờ — Đội AI giật dây ngược lại.
   * Nếu chuỗi thua từ 3 câu liên tiếp trở lên (loseStreak >= 3), phát thêm còi báo động phản công.
   */
  playPullFail(loseStreak = 1) {
    if (this.muted) return;
    this.playSfxFile('wrongBuzzer', 0.68, 1.0);

    // Sub-bass drop + sawtooth cảnh báo
    this.tone({
      type: 'sawtooth',
      start: 240,
      end: 82,
      duration: 0.32,
      gain: 0.075,
      filterStart: 1100,
      filterEnd: 160,
    });
    this.tone({
      type: 'square',
      start: 165,
      end: 65,
      duration: 0.35,
      gain: 0.055,
      when: 0.08,
    });

    if (loseStreak >= 3) {
      this.playSfxFile('loseStreak', 0.78, 1 + Math.min(0.2, (loseStreak - 3) * 0.06));
      // Còi báo động đỏ 2 nhịp
      [0.12, 0.28].forEach((when) => {
        this.tone({
          type: 'sawtooth',
          start: 420,
          end: 260,
          duration: 0.14,
          gain: 0.06,
          when,
        });
      });
    }
  }

  /**
   * Âm thanh đếm ngược 3 - 2 - 1 trước khi bắt đầu câu hỏi mới
   */
  playRoundCountdown(step: 3 | 2 | 1 | 'GO') {
    if (this.muted) return;
    if (step === 'GO') {
      this.playSfxFile('correctHit', 0.6, 1.15);
      this.tone({
        type: 'triangle',
        start: 660,
        end: 1046.5,
        duration: 0.22,
        gain: 0.075,
      });
      return;
    }
    this.playSfxFile('countdownTick', 0.55, 1 + (3 - step) * 0.12);
    const freq = step === 3 ? 440 : step === 2 ? 554.37 : 659.25;
    this.tone({
      type: 'triangle',
      start: freq,
      end: freq * 1.06,
      duration: 0.14,
      gain: 0.06,
    });
  }

  /**
   * Âm thanh đếm ngược gấp gáp ở 5 giây cuối mỗi câu hỏi
   */
  playUrgentTick(secondsLeft: number) {
    if (this.muted) return;
    if (secondsLeft <= 0) return;
    this.playSfxFile('countdownTick', 0.55, secondsLeft <= 2 ? 1.25 : 1.08);
    if (secondsLeft === 3) {
      this.playSfxFile('drumRoll', 0.48, 1.15);
    }
    const freq = secondsLeft === 1 ? 920 : 580 + (5 - secondsLeft) * 65;
    this.tone({
      type: 'square',
      start: freq,
      end: freq * 1.12,
      duration: 0.09,
      gain: 0.05,
    });
  }

  /**
   * Âm thanh kết thúc trận đấu (Chiến thắng + Tiếng vỗ tay reo hò sân vận động)
   */
  playWin() {
    if (this.muted) return;
    this.playSfxFile('winFanfare', 0.8, 1.0);
    this.playSfxFile('crowdCheer', 0.65, 1.0);
    [0, 0.1, 0.2, 0.32, 0.46].forEach((when, i) => {
      this.tone({
        type: 'triangle',
        start: 523.25 + i * 135,
        end: 980 + i * 175,
        duration: 0.3,
        gain: 0.065,
        when,
      });
    });
  }

  private tone(options: {
    type: OscillatorType;
    start: number;
    end: number;
    duration: number;
    gain: number;
    when?: number;
    filterStart?: number;
    filterEnd?: number;
  }) {
    if (this.muted) return;
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + (options.when ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.filterStart ?? 2600, t);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, options.filterEnd ?? options.end * 1.8),
      t + options.duration
    );

    osc.type = options.type;
    osc.frequency.setValueAtTime(Math.max(20, options.start), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.end), t + options.duration);
    gain.gain.setValueAtTime(options.gain, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + options.duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    if (this.currentMusicMode === 'battle') {
      this.activeBattleOscs.push(osc);
      osc.onended = () => {
        const idx = this.activeBattleOscs.indexOf(osc);
        if (idx !== -1) this.activeBattleOscs.splice(idx, 1);
      };
    } else if (this.currentMusicMode === 'ambient') {
      this.activeAmbientOscs.push(osc);
      osc.onended = () => {
        const idx = this.activeAmbientOscs.indexOf(osc);
        if (idx !== -1) this.activeAmbientOscs.splice(idx, 1);
      };
    }

    osc.start(t);
    osc.stop(t + options.duration + 0.03);
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.sharedNoiseBuffer && this.sharedNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.sharedNoiseBuffer;
    }
    const sampleRate = ctx.sampleRate || 44100;
    const frames = Math.floor(sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, frames, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this.sharedNoiseBuffer = buffer;
    return buffer;
  }

  private noiseHit(gainValue: number, duration: number, frequency: number) {
    if (this.muted) return;
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'highpass';
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  private ready() {
    if (this.muted) return null;
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
}

export const audio = new AudioEngine();
