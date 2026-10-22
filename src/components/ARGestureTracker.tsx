import { useEffect, useRef, useState } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision';
import { BRAND_MASCOTS } from '../data/brand';
import { audio } from '../utils/audio';

export type GestureSide = 'LEFT' | 'RIGHT' | null;

interface ARGestureTrackerProps {
  enabled: boolean;
  locked: boolean;
  descNoAI?: string;
  descHasAI?: string;
  selectedSide?: 'LEFT' | 'RIGHT' | null;
  hasAI?: boolean;
  onSelectSide: (side: 'LEFT' | 'RIGHT', source: 'hand' | 'face') => void;
  onHoverSide?: (side: GestureSide, progress: number, source: 'hand' | 'face' | null) => void;
}

const HOLD_DURATION_MS = 1000; // Giữ tư thế 1 giây để khóa chọn tự động
const INFERENCE_INTERVAL_MS = 34; // Giới hạn tần suất xử lý AI (~28-30 FPS) để giải phóng CPU/Audio thread

export function ARGestureTracker({
  enabled,
  locked,
  descNoAI = 'Quy trình tự động hóa cố định, không tự học từ dữ liệu.',
  descHasAI = 'Hệ thống có khả năng học máy, nhận diện hoặc cá nhân hóa thông minh.',
  selectedSide = null,
  hasAI = true,
  onSelectSide,
  onHoverSide,
}: ARGestureTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number>(0);

  // DOM Refs để cập nhật tiến độ mượt mà 60 FPS mà KHÔNG gây re-render React liên tục
  const leftBarRef = useRef<HTMLDivElement>(null);
  const rightBarRef = useRef<HTMLDivElement>(null);
  const leftTextRef = useRef<HTMLDivElement>(null);
  const rightTextRef = useRef<HTMLDivElement>(null);
  const centerBadgeRef = useRef<HTMLDivElement>(null);
  const statusBadgeRef = useRef<HTMLSpanElement>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detectedSide, setDetectedSide] = useState<GestureSide>(null);
  const [detectedSource, setDetectedSource] = useState<'hand' | 'face' | null>(null);

  const prevDetectedSideRef = useRef<GestureSide>(null);

  const holdStateRef = useRef<{
    side: GestureSide;
    source: 'hand' | 'face' | null;
    startTime: number;
    triggered: boolean;
  }>({
    side: null,
    source: null,
    startTime: 0,
    triggered: false,
  });

  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const onSelectRef = useRef(onSelectSide);
  onSelectRef.current = onSelectSide;
  const onHoverRef = useRef(onHoverSide);
  onHoverRef.current = onHoverSide;

  // Reset tiến độ khi câu hỏi mới bắt đầu hoặc bị khóa
  useEffect(() => {
    if (!locked) {
      holdStateRef.current.triggered = false;
      holdStateRef.current.startTime = performance.now();
      if (leftBarRef.current) leftBarRef.current.style.width = '0%';
      if (rightBarRef.current) rightBarRef.current.style.width = '0%';
      if (centerBadgeRef.current) centerBadgeRef.current.textContent = '0%';
      setDetectedSide(null);
      setDetectedSource(null);
      prevDetectedSideRef.current = null;
    }
  }, [locked]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    setStatus('loading');

    const setup = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        if (!active) return;

        // Khởi tạo model với cấu hình tối ưu hiệu năng
        const [handLandmarker, faceLandmarker] = await Promise.all([
          HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 1, // 1 tay là đủ để nhận diện cử chỉ chọn phương án, giảm 50% tính toán
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
        ]);

        if (!active) {
          handLandmarker.close();
          faceLandmarker.close();
          return;
        }

        handLandmarkerRef.current = handLandmarker;
        faceLandmarkerRef.current = faceLandmarker;

        // Tối ưu độ phân giải camera: 640x360 @ 30fps mượt mà, nhẹ hơn 2.5x so với 960x420
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setStatus('ready');
            startLoop();
          };
        }
      } catch (e) {
        console.error('AR Camera init error:', e);
        if (active) setStatus('error');
      }
    };

    const startLoop = () => {
      let lastInferenceTime = 0;
      let lastTickSound = 0;
      let cachedSide: GestureSide = null;
      let cachedSource: 'hand' | 'face' | null = null;

      const tick = (now: number) => {
        if (!active) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const handLM = handLandmarkerRef.current;
        const faceLM = faceLandmarkerRef.current;

        if (video && canvas && video.readyState >= 2) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 360;
          }

          const ctx = canvas.getContext('2d');
          const shouldRunInference = now - lastInferenceTime >= INFERENCE_INTERVAL_MS;

          if (ctx) {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // Vẽ phân vùng TRÁI (Không có AI) và PHẢI (Có AI) trên màn hình camera
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(w * 0.4, 0);
            ctx.lineTo(w * 0.4, h);
            ctx.moveTo(w * 0.6, 0);
            ctx.lineTo(w * 0.6, h);
            ctx.stroke();
            ctx.restore();

            // CHỈ chạy inference AI khi đến chu kỳ throttling (~30 FPS), tiết kiệm tối đa CPU/GPU
            if (shouldRunInference) {
              lastInferenceTime = now;
              let currentSide: GestureSide = null;
              let currentSource: 'hand' | 'face' | null = null;

              // 1. Kiểm tra cử chỉ VẪY TAY TRÁI / PHẢI trước
              try {
                const handRes = handLM?.detectForVideo(video, now);
                if (handRes?.landmarks && handRes.landmarks.length > 0) {
                  for (const lm of handRes.landmarks) {
                    const wrist = lm[0];
                    const middleTip = lm[12];
                    const indexTip = lm[8];
                    const mx = 1 - (wrist.x + middleTip.x + indexTip.x) / 3;
                    const my = (wrist.y + middleTip.y + indexTip.y) / 3;

                    // Vẽ điểm bàn tay nhanh gọn (bỏ shadowBlur để không nghẽn GPU)
                    ctx.save();
                    ctx.fillStyle = mx < 0.42 ? '#b6c4ff' : mx > 0.58 ? '#17dbe5' : '#ffffff';
                    ctx.beginPath();
                    ctx.arc(mx * w, my * h, 14, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    if (mx < 0.42) {
                      currentSide = 'LEFT';
                      currentSource = 'hand';
                    } else if (mx > 0.58) {
                      currentSide = 'RIGHT';
                      currentSource = 'hand';
                    }
                  }
                }
              } catch {
                // ignore
              }

              // 2. CHỈ chạy Face Landmarker NẾU CHƯA phát hiện thấy tay giơ sang bên! (Cắt giảm 50% tính toán)
              if (!currentSide && faceLM) {
                try {
                  const faceRes = faceLM.detectForVideo(video, now);
                  if (faceRes?.faceLandmarks && faceRes.faceLandmarks.length > 0) {
                    const flm = faceRes.faceLandmarks[0];
                    const nose = flm[1];
                    const leftEye = flm[33];
                    const rightEye = flm[263];

                    const nx = 1 - nose.x;
                    const ny = nose.y;

                    const eyeDx = (1 - leftEye.x) - (1 - rightEye.x);
                    const eyeDy = leftEye.y - rightEye.y;
                    const rollAngle = Math.atan2(eyeDy, Math.abs(eyeDx));

                    ctx.save();
                    ctx.strokeStyle = '#17dbe5';
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(nx * w, ny * h, 24, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();

                    if (nx < 0.41 || rollAngle < -0.17) {
                      currentSide = 'LEFT';
                      currentSource = 'face';
                    } else if (nx > 0.59 || rollAngle > 0.17) {
                      currentSide = 'RIGHT';
                      currentSource = 'face';
                    }
                  }
                } catch {
                  // ignore
                }
              }

              cachedSide = currentSide;
              cachedSource = currentSource;
            }

            // Xử lý bộ đếm giữ chọn (Hold to lock answer)
            const hs = holdStateRef.current;
            const activeSide = cachedSide;
            const activeSource = cachedSource;

            if (activeSide && !lockedRef.current) {
              if (hs.side !== activeSide) {
                hs.side = activeSide;
                hs.source = activeSource;
                hs.startTime = now;
                hs.triggered = false;
                audio.playHoverTick();

                // Chỉ cập nhật React state khi đổi vùng
                if (prevDetectedSideRef.current !== activeSide) {
                  prevDetectedSideRef.current = activeSide;
                  setDetectedSide(activeSide);
                  setDetectedSource(activeSource);
                }
              } else {
                const elapsed = now - hs.startTime;
                const prog = Math.min(100, Math.round((elapsed / HOLD_DURATION_MS) * 100));

                // CẬP NHẬT TRỰC TIẾP LÊN DOM (CỰC KỲ MƯỢT 60 FPS, KHÔNG GÂY RE-RENDER REACT)
                if (activeSide === 'LEFT') {
                  if (leftBarRef.current) leftBarRef.current.style.width = `${prog}%`;
                  if (rightBarRef.current) rightBarRef.current.style.width = '0%';
                  if (leftTextRef.current) {
                    leftTextRef.current.textContent = `${activeSource === 'hand' ? '✋ Tay' : '😊 Mặt'} • Giữ ${prog}%`;
                  }
                } else if (activeSide === 'RIGHT') {
                  if (rightBarRef.current) rightBarRef.current.style.width = `${prog}%`;
                  if (leftBarRef.current) leftBarRef.current.style.width = '0%';
                  if (rightTextRef.current) {
                    rightTextRef.current.textContent = `${activeSource === 'hand' ? '✋ Tay' : '😊 Mặt'} • Giữ ${prog}%`;
                  }
                }

                if (centerBadgeRef.current) {
                  centerBadgeRef.current.textContent = `${prog}%`;
                }

                if (statusBadgeRef.current) {
                  statusBadgeRef.current.textContent =
                    activeSide === 'LEFT'
                      ? `👈 ĐANG GIỮ BÊN TRÁI: KHÔNG CÓ AI (${prog}%)`
                      : `👉 ĐANG GIỮ BÊN PHẢI: CÓ AI (${prog}%)`;
                }

                // Phát âm thanh nhịp giữ mỗi 380ms để không nghẽn audio engine
                if (now - lastTickSound > 380 && prog < 100) {
                  lastTickSound = now;
                  audio.playHoverTick();
                }

                if (elapsed >= HOLD_DURATION_MS && !hs.triggered && activeSource) {
                  hs.triggered = true;
                  onSelectRef.current(activeSide, activeSource);
                }
              }
            } else {
              hs.side = null;
              hs.source = null;
              hs.startTime = now;

              // Reset DOM elements trực tiếp
              if (leftBarRef.current) leftBarRef.current.style.width = '0%';
              if (rightBarRef.current) rightBarRef.current.style.width = '0%';
              if (leftTextRef.current) leftTextRef.current.textContent = 'Đưa tay/nghiêng mặt';
              if (rightTextRef.current) rightTextRef.current.textContent = 'Đưa tay/nghiêng mặt';
              if (centerBadgeRef.current) centerBadgeRef.current.textContent = '0%';
              if (statusBadgeRef.current) {
                statusBadgeRef.current.textContent =
                  '✋ ĐƯA TAY / NGHIÊNG MẶT SANG TRÁI HOẶC PHẢI (GIỮ 1 GIÂY)';
              }

              if (prevDetectedSideRef.current !== null) {
                prevDetectedSideRef.current = null;
                setDetectedSide(null);
                setDetectedSource(null);
              }
            }
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    setup();

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
      handLandmarkerRef.current?.close();
      faceLandmarkerRef.current?.close();
      handLandmarkerRef.current = null;
      faceLandmarkerRef.current = null;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="relative rounded-2xl bg-surface-container-lowest/95 border border-tertiary/35 p-3 sm:p-4 shadow-2xl overflow-hidden flex flex-col gap-2.5">
      {/* Thanh trạng thái Camera AR */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-tertiary animate-ping" />
          <span className="text-label-caps text-tertiary uppercase">
            KHUNG TƯƠNG TÁC CAMERA AR • VẪY TAY HOẶC NGHIÊNG MẶT TRÁI / PHẢI ĐỂ CHỌN
          </span>
        </div>
        <span
          ref={statusBadgeRef}
          className="text-label-kicker text-on-surface-variant uppercase px-3 py-1 rounded-full bg-surface-container-high border border-white/10"
        >
          {status === 'ready'
            ? '✋ ĐƯA TAY / NGHIÊNG MẶT SANG TRÁI HOẶC PHẢI (GIỮ 1 GIÂY)'
            : status === 'loading'
            ? 'ĐANG KHỞI ĐỘNG CAMERA AR...'
            : 'CHẠM VÙNG TRÁI / PHẢI TRÊN KHUNG AR'}
        </span>
      </div>

      {/* Màn hình Camera AR rộng bên dưới kết hợp 2 vùng chọn trực quan */}
      <div className="relative w-full h-44 sm:h-56 md:h-64 rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center border border-white/10">
        {status === 'loading' && (
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 px-3 text-center z-30">
            <img
              src={BRAND_MASCOTS.cameraWaitAnimated}
              alt="Mana Camera Wait"
              className="w-12 h-12 sm:w-16 sm:h-16 object-contain"
            />
            <span className="text-body-sm sm:text-body-base text-on-surface-variant font-semibold">
              Đang bật Camera AR nhận diện bàn tay & khuôn mặt...
            </span>
          </div>
        )}

        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover -scale-x-100 opacity-85 ${
            status === 'ready' ? 'block' : 'hidden'
          }`}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Lớp phủ 2 vùng KHÔNG CÓ AI và CÓ SỬ DỤNG AI đồng màu khi chưa chọn */}
        <div className="absolute inset-0 z-20 grid grid-cols-12 gap-1.5 sm:gap-2 p-1.5 sm:p-3">
          {/* VÙNG AR 1: KHÔNG CÓ AI */}
          <div
            onClick={() => !locked && onSelectSide('LEFT', 'hand')}
            className={`col-span-5 rounded-xl border-2 p-2 sm:p-3.5 flex flex-col justify-between transition-all relative overflow-hidden cursor-pointer ${
              selectedSide === 'LEFT'
                ? !hasAI
                  ? 'border-emerald-400 bg-emerald-950/75 shadow-[0_0_30px_rgba(16,185,129,0.6)]'
                  : 'border-error bg-error-container/70 shadow-[0_0_25px_rgba(255,180,171,0.5)]'
                : detectedSide === 'LEFT'
                ? 'border-tertiary bg-surface-container-highest/75 shadow-[0_0_28px_rgba(23,219,229,0.6)] scale-[1.01]'
                : 'border-white/20 bg-surface-container-lowest/60 hover:bg-surface-container-lowest/75'
            }`}
          >
            <div
              ref={leftBarRef}
              className="absolute bottom-0 left-0 h-1.5 sm:h-2 bg-tertiary transition-[width] duration-75"
              style={{ width: '0%' }}
            />

            <div className="flex items-center justify-between gap-1">
              <div className="text-xs sm:text-base md:text-headline-md text-white font-black drop-shadow">
                KHÔNG CÓ AI
              </div>
              {selectedSide === 'LEFT' && (
                <span
                  className={`px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-label-kicker font-black ${
                    !hasAI ? 'bg-emerald-400 text-[#032117]' : 'bg-error text-on-error'
                  }`}
                >
                  {!hasAI ? '✓ ĐÚNG' : '✕ SAI'}
                </span>
              )}
            </div>

            <div className="my-auto py-0.5 sm:py-1">
              <p className="text-[11px] sm:text-body-sm text-on-surface/90 line-clamp-2 leading-tight">
                {descNoAI}
              </p>
            </div>

            <div
              ref={leftTextRef}
              className="text-[9px] sm:text-label-kicker text-on-surface-variant uppercase truncate"
            >
              Đưa tay/nghiêng mặt
            </div>
          </div>

          {/* VÙNG TRUNG TÂM CAMERA: NGƯỜI CHƠI */}
          <div className="col-span-2 flex flex-col items-center justify-between py-1 pointer-events-none">
            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-surface-container-lowest/85 border border-white/15 text-[8px] sm:text-[10px] font-mono font-bold text-tertiary uppercase">
              AR CAM
            </span>

            <div
              ref={centerBadgeRef}
              className="px-2 py-1 rounded-lg bg-surface-container-lowest/95 border border-tertiary text-tertiary text-[10px] sm:text-label-caps uppercase shadow-lg text-center font-bold"
            >
              0%
            </div>

            <span className="text-[8px] sm:text-[10px] font-bold text-white/75 uppercase text-center hidden sm:block">
              Ở giữa
            </span>
          </div>

          {/* VÙNG AR 2: CÓ SỬ DỤNG AI */}
          <div
            onClick={() => !locked && onSelectSide('RIGHT', 'hand')}
            className={`col-span-5 rounded-xl border-2 p-2 sm:p-3.5 flex flex-col justify-between items-end text-right transition-all relative overflow-hidden cursor-pointer ${
              selectedSide === 'RIGHT'
                ? hasAI
                  ? 'border-emerald-400 bg-emerald-950/75 shadow-[0_0_30px_rgba(16,185,129,0.6)]'
                  : 'border-error bg-error-container/70 shadow-[0_0_25px_rgba(255,180,171,0.5)]'
                : detectedSide === 'RIGHT'
                ? 'border-tertiary bg-surface-container-highest/75 shadow-[0_0_28px_rgba(23,219,229,0.6)] scale-[1.01]'
                : 'border-white/20 bg-surface-container-lowest/60 hover:bg-surface-container-lowest/75'
            }`}
          >
            <div
              ref={rightBarRef}
              className="absolute bottom-0 right-0 h-1.5 sm:h-2 bg-tertiary transition-[width] duration-75"
              style={{ width: '0%' }}
            />

            <div className="flex items-center justify-between gap-1 w-full">
              {selectedSide === 'RIGHT' ? (
                <span
                  className={`px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-label-kicker font-black ${
                    hasAI ? 'bg-emerald-400 text-[#032117]' : 'bg-error text-on-error'
                  }`}
                >
                  {hasAI ? '✓ ĐÚNG' : '✕ SAI'}
                </span>
              ) : (
                <span />
              )}
              <div className="text-xs sm:text-base md:text-headline-md text-white font-black drop-shadow">
                CÓ SỬ DỤNG AI
              </div>
            </div>

            <div className="my-auto py-0.5 sm:py-1">
              <p className="text-[11px] sm:text-body-sm text-on-surface/90 line-clamp-2 leading-tight">
                {descHasAI}
              </p>
            </div>

            <div
              ref={rightTextRef}
              className="text-[9px] sm:text-label-kicker text-on-surface-variant uppercase truncate"
            >
              Đưa tay/nghiêng mặt
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
