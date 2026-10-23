import { useEffect, useRef, useState } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision';
import { BRAND_MASCOTS } from '../data/brand';
import { audio } from '../utils/audio';

export type GestureSide = 'LEFT' | 'RIGHT' | null;

export interface MiniGameTarget {
  id: number;
  wave: number;
  x: number; // 0.15 to 0.85
  y: number; // 0.20 to 0.80
  side: 'LEFT' | 'RIGHT';
  label: string;
}

export interface ARGestureTrackerProps {
  enabled: boolean;
  locked?: boolean;
  mode?: 'quiz' | 'minigame';
  descNoAI?: string;
  descHasAI?: string;
  selectedSide?: 'LEFT' | 'RIGHT' | null;
  hasAI?: boolean;
  className?: string;
  hideCamera?: boolean;
  onSelectSide?: (side: 'LEFT' | 'RIGHT', source: 'hand' | 'face') => void;
  onHoverSide?: (side: GestureSide, progress: number, source: 'hand' | 'face' | null) => void;
  onMiniGameComplete?: (score: number, total: number) => void;
  onStartGame?: () => void;
  isEnlarged?: boolean;
  onToggleEnlarge?: () => void;
}

const HOLD_DURATION_MS = 1000; // Giữ tư thế 1 giây để khóa chọn tự động (cho chế độ quiz)
const INFERENCE_INTERVAL_MS = 40; // Giới hạn tần suất xử lý AI (~25 FPS) tối ưu CPU/GPU mượt mà 60 FPS

// 10 tọa độ phân bố đều 2 bên Trái / Phải, Trên / Giữa / Dưới
const BASE_TARGET_ZONES: Array<{ x: number; y: number; side: 'LEFT' | 'RIGHT'; label: string }> = [
  { x: 0.24, y: 0.28, side: 'LEFT', label: 'Trái trên' },
  { x: 0.76, y: 0.28, side: 'RIGHT', label: 'Phải trên' },
  { x: 0.20, y: 0.52, side: 'LEFT', label: 'Trái giữa' },
  { x: 0.80, y: 0.52, side: 'RIGHT', label: 'Phải giữa' },
  { x: 0.26, y: 0.74, side: 'LEFT', label: 'Trái dưới' },
  { x: 0.74, y: 0.74, side: 'RIGHT', label: 'Phải dưới' },
  { x: 0.32, y: 0.36, side: 'LEFT', label: 'Trái cao' },
  { x: 0.68, y: 0.36, side: 'RIGHT', label: 'Phải cao' },
  { x: 0.22, y: 0.64, side: 'LEFT', label: 'Trái thấp' },
  { x: 0.78, y: 0.64, side: 'RIGHT', label: 'Phải thấp' },
];

function generate10Targets(): MiniGameTarget[] {
  const shuffled = [...BASE_TARGET_ZONES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10).map((zone, idx) => {
    const jitterX = (Math.random() - 0.5) * 0.05;
    const jitterY = (Math.random() - 0.5) * 0.05;
    return {
      id: idx + 1,
      wave: idx + 1,
      x: Math.min(0.85, Math.max(0.15, zone.x + jitterX)),
      y: Math.min(0.80, Math.max(0.20, zone.y + jitterY)),
      side: zone.side,
      label: zone.label,
    };
  });
}

export function ARGestureTracker({
  enabled,
  locked = false,
  mode = 'quiz',
  selectedSide = null,
  hasAI = true,
  className,
  hideCamera,
  onSelectSide,
  onHoverSide,
  onMiniGameComplete,
  onStartGame,
}: ARGestureTrackerProps) {
  // Ở mục 3 phần chơi AR: mặc định không hiển thị camera, thay bằng mascot chỉ tay trên nền đen
  const isCameraHidden = hideCamera ?? (mode === 'quiz');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number>(0);

  // DOM Refs để cập nhật tiến độ quiz mượt mà 60 FPS
  const leftBarRef = useRef<HTMLDivElement>(null);
  const rightBarRef = useRef<HTMLDivElement>(null);
  const leftTextRef = useRef<HTMLDivElement>(null);
  const rightTextRef = useRef<HTMLDivElement>(null);
  const centerBadgeRef = useRef<HTMLDivElement>(null);
  const statusBadgeRef = useRef<HTMLSpanElement>(null);

  // DOM Refs cho Mascot chỉ tay di chuyển theo tay (khi ẩn cam, nền đen)
  const mascotContainerRef = useRef<HTMLDivElement>(null);
  const mascotImgRef = useRef<HTMLImageElement>(null);
  const mascotHintRef = useRef<HTMLDivElement>(null);
  const mascotRingRef = useRef<HTMLDivElement>(null);
  const mascotPosRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.55 });
  const mascotHasHandRef = useRef(false);
  const lastMascotTransformRef = useRef<string>('');

  // DOM Refs cho Test AR
  const miniTimerTextRef = useRef<HTMLSpanElement>(null);
  const miniTimerCircleRef = useRef<SVGCircleElement>(null);
  const miniTargetCenterRef = useRef<HTMLDivElement>(null);
  const miniHoldStartTimeRef = useRef<number>(0);
  const miniIsHoveredRef = useRef<boolean>(false);
  const miniLastTickTimeRef = useRef<number>(0);
  const lastHandPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const lastFacePosRef = useRef<{ x: number; y: number } | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detectedSide, setDetectedSide] = useState<GestureSide>(null);
  const [detectedSource, setDetectedSource] = useState<'hand' | 'face' | null>(null);

  // State riêng cho 10 mục tiêu
  const [miniTargets, setMiniTargets] = useState<MiniGameTarget[]>(() => generate10Targets());
  const [miniWaveIndex, setMiniWaveIndex] = useState(0);
  const [miniScore, setMiniScore] = useState(0);
  const [miniStreak, setMiniStreak] = useState(0);
  const [miniIsFinished, setMiniIsFinished] = useState(false);
  const [miniHitFeedback, setMiniHitFeedback] = useState<{
    wave: number;
    x: number;
    y: number;
    success: boolean;
    text: string;
  } | null>(null);

  const miniTargetsRef = useRef(miniTargets);
  miniTargetsRef.current = miniTargets;
  const miniWaveIndexRef = useRef(miniWaveIndex);
  miniWaveIndexRef.current = miniWaveIndex;
  const miniScoreRef = useRef(miniScore);
  miniScoreRef.current = miniScore;
  const miniStreakRef = useRef(miniStreak);
  miniStreakRef.current = miniStreak;
  const miniIsFinishedRef = useRef(miniIsFinished);
  miniIsFinishedRef.current = miniIsFinished;
  const miniWaveStartTimeRef = useRef(0);
  const miniWaveResolvedRef = useRef(false);

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

  // Xử lý khi bắt trúng (tương tác đủ 1s) hoặc bỏ qua
  const resolveWave = (success: boolean, target: MiniGameTarget, source: string | null) => {
    miniHoldStartTimeRef.current = 0;
    if (miniTimerCircleRef.current) {
      miniTimerCircleRef.current.style.strokeDashoffset = '238.76';
    }
    if (miniTimerTextRef.current) {
      miniTimerTextRef.current.textContent = 'Giữ 1.0s';
    }
    if (miniTargetCenterRef.current) {
      miniTargetCenterRef.current.style.transform = 'scale(1)';
    }

    if (success) {
      const newScore = miniScoreRef.current + 1;
      const newStreak = miniStreakRef.current + 1;
      miniScoreRef.current = newScore;
      miniStreakRef.current = newStreak;
      audio.playPullSuccess(newStreak);
      setMiniScore(newScore);
      setMiniStreak(newStreak);
      setMiniHitFeedback({
        wave: target.wave,
        x: target.x,
        y: target.y,
        success: true,
        text: `+1 ĐIỂM! ĐÃ BẮT TRÚNG 🎯 ${source === 'hand' ? '✋' : source === 'face' ? '😊' : '🖱️'}`,
      });
    } else {
      miniStreakRef.current = 0;
      setMiniStreak(0);
      audio.playHoverTick();
      setMiniHitFeedback({
        wave: target.wave,
        x: target.x,
        y: target.y,
        success: false,
        text: 'Đã bỏ qua ⏭️',
      });
    }

    // Sau 250ms: xóa feedback và mở ngay mục tiêu mới
    setTimeout(() => {
      setMiniHitFeedback(null);
      const nextWave = miniWaveIndexRef.current + 1;
      if (nextWave >= 10) {
        miniIsFinishedRef.current = true;
        setMiniIsFinished(true);
        audio.playWin();
        if (onMiniGameComplete) {
          onMiniGameComplete(miniScoreRef.current, 10);
        }
      } else {
        miniWaveIndexRef.current = nextWave;
        setMiniWaveIndex(nextWave);
        miniWaveStartTimeRef.current = performance.now();
        miniWaveResolvedRef.current = false;
        miniHoldStartTimeRef.current = 0;
      }
    }, 250);
  };
  const resolveWaveRef = useRef(resolveWave);
  resolveWaveRef.current = resolveWave;

  const handleTargetClick = (target: MiniGameTarget) => {
    if (!miniWaveResolvedRef.current && !miniIsFinishedRef.current) {
      miniWaveResolvedRef.current = true;
      miniHoldStartTimeRef.current = 0;
      resolveWave(true, target, 'click');
    }
  };

  const restartMiniGame = () => {
    const newTargets = generate10Targets();
    miniTargetsRef.current = newTargets;
    setMiniTargets(newTargets);
    miniWaveIndexRef.current = 0;
    setMiniWaveIndex(0);
    miniScoreRef.current = 0;
    setMiniScore(0);
    miniStreakRef.current = 0;
    setMiniStreak(0);
    miniIsFinishedRef.current = false;
    setMiniIsFinished(false);
    setMiniHitFeedback(null);
    miniWaveStartTimeRef.current = performance.now();
    miniWaveResolvedRef.current = false;
    miniHoldStartTimeRef.current = 0;
  };

  // Reset tiến độ khi câu hỏi mới bắt đầu hoặc bị khóa
  useEffect(() => {
    if (!locked && mode === 'quiz') {
      holdStateRef.current.triggered = false;
      holdStateRef.current.startTime = performance.now();
      if (leftBarRef.current) leftBarRef.current.style.width = '0%';
      if (rightBarRef.current) rightBarRef.current.style.width = '0%';
      if (centerBadgeRef.current) centerBadgeRef.current.textContent = '0%';
      setDetectedSide(null);
      setDetectedSource(null);
      prevDetectedSideRef.current = null;
    }
  }, [locked, mode]);

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

        const [handLM, faceLM] = await Promise.all([
          HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 1, // Tối ưu: 1 bàn tay giúp tăng gấp đôi tốc độ xử lý AI, triệt tiêu giật lag
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
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          }),
        ]);

        if (!active) return;
        handLandmarkerRef.current = handLM;
        faceLandmarkerRef.current = faceLM;

        // Giới hạn độ phân giải camera ở mức tối ưu nhẹ nhàng (480x270 - 640x360) để AI đạt 60 FPS
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 480, max: 640 },
            height: { ideal: 270, max: 360 },
            facingMode: 'user',
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
          await videoRef.current.play();
          setStatus('ready');
          miniWaveStartTimeRef.current = performance.now();
          miniWaveResolvedRef.current = false;
        }
      } catch (err) {
        console.error('AR Tracker init failed:', err);
        if (active) setStatus('error');
      }

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

            // Vẽ phân vùng TRÁI (Không có AI) và PHẢI (Có AI) trên màn hình camera nếu không ẩn cam
            if (!isCameraHidden) {
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
            }

            // Inference AI MediaPipe
            if (shouldRunInference) {
              lastInferenceTime = now;
              let currentSide: GestureSide = null;
              let currentSource: 'hand' | 'face' | null = null;

              // 1. Kiểm tra cử chỉ VẪY TAY TRÁI / PHẢI
              try {
                const handRes = handLM?.detectForVideo(video, now);
                const currentPoints: Array<{ x: number; y: number }> = [];

                if (handRes?.landmarks && handRes.landmarks.length > 0) {
                  for (const lm of handRes.landmarks) {
                    const wrist = lm[0];
                    const middleTip = lm[12];
                    const indexTip = lm[8];
                    const mx = 1 - (wrist.x + middleTip.x + indexTip.x) / 3;
                    const my = (wrist.y + middleTip.y + indexTip.y) / 3;
                    currentPoints.push({ x: mx, y: my });

                    // Bổ sung đầu ngón tay trỏ để nhận diện cử chỉ chỉ tay/chạm mục tiêu chuẩn xác
                    const ix = 1 - indexTip.x;
                    const iy = indexTip.y;
                    currentPoints.push({ x: ix, y: iy });

                    // Chỉ vẽ canvas khi ở chế độ hiển thị camera (minigame)
                    if (!isCameraHidden) {
                      ctx.save();
                      ctx.fillStyle = mx < 0.44 ? '#b6c4ff' : mx > 0.56 ? '#17dbe5' : '#ffffff';
                      ctx.shadowColor = mx < 0.44 ? '#b6c4ff' : '#17dbe5';
                      ctx.shadowBlur = 10;
                      ctx.beginPath();
                      ctx.arc(mx * w, my * h, 16, 0, Math.PI * 2);
                      ctx.fill();

                      // Chấm sáng đầu ngón tay
                      ctx.fillStyle = '#ffffff';
                      ctx.beginPath();
                      ctx.arc(ix * w, iy * h, 8, 0, Math.PI * 2);
                      ctx.fill();
                      ctx.restore();
                    }

                    // Vùng đệm Hysteresis chống rung giật mép chọn
                    if (cachedSide === 'LEFT') {
                      if (mx < 0.46) {
                        currentSide = 'LEFT';
                        currentSource = 'hand';
                      }
                    } else if (cachedSide === 'RIGHT') {
                      if (mx > 0.54) {
                        currentSide = 'RIGHT';
                        currentSource = 'hand';
                      }
                    } else {
                      if (mx < 0.42) {
                        currentSide = 'LEFT';
                        currentSource = 'hand';
                      } else if (mx > 0.58) {
                        currentSide = 'RIGHT';
                        currentSource = 'hand';
                      }
                    }
                  }
                }
                lastHandPointsRef.current = currentPoints;
              } catch {
                // ignore
              }

              // 2. TỐI ƯU CỰC ĐẠI: Chỉ chạy Face Landmarker khi KHÔNG có bàn tay nào trong khung hình
              const hasHand = lastHandPointsRef.current.length > 0;
              if (!hasHand && faceLM) {
                try {
                  const faceRes = faceLM.detectForVideo(video, now);
                  if (faceRes?.faceLandmarks && faceRes.faceLandmarks.length > 0) {
                    const flm = faceRes.faceLandmarks[0];
                    const nose = flm[1];
                    const leftEye = flm[33];
                    const rightEye = flm[263];

                    const nx = 1 - nose.x;
                    const ny = nose.y;
                    lastFacePosRef.current = { x: nx, y: ny };

                    const eyeDx = (1 - leftEye.x) - (1 - rightEye.x);
                    const eyeDy = leftEye.y - rightEye.y;
                    const rollAngle = Math.atan2(eyeDy, Math.abs(eyeDx));

                    if (!isCameraHidden) {
                      ctx.save();
                      ctx.strokeStyle = '#17dbe5';
                      ctx.lineWidth = 2.5;
                      ctx.beginPath();
                      ctx.arc(nx * w, ny * h, 24, 0, Math.PI * 2);
                      ctx.stroke();
                      ctx.restore();
                    }

                    if (!currentSide) {
                      if (nx < 0.42 || rollAngle < -0.16) {
                        currentSide = 'LEFT';
                        currentSource = 'face';
                      } else if (nx > 0.58 || rollAngle > 0.16) {
                        currentSide = 'RIGHT';
                        currentSource = 'face';
                      }
                    }
                  } else {
                    lastFacePosRef.current = null;
                  }
                } catch {
                  // ignore
                }
              }

              cachedSide = currentSide;
              cachedSource = currentSource;
            }

            // Cập nhật vị trí Mascot chỉ tay mượt mà 60 FPS theo cử chỉ bàn tay (chế độ ẩn cam, nền đen)
            if (isCameraHidden) {
              const hands = lastHandPointsRef.current;
              const face = lastFacePosRef.current;

              if (hands && hands.length > 0) {
                const hp = hands[0];
                const dx = hp.x - mascotPosRef.current.x;
                const dy = hp.y - mascotPosRef.current.y;
                // Deadzone loại bỏ rung giật vi mô (micro-jitter)
                if (Math.abs(dx) > 0.002) {
                  mascotPosRef.current.x += dx * 0.32;
                }
                if (Math.abs(dy) > 0.002) {
                  mascotPosRef.current.y += dy * 0.32;
                }
                mascotHasHandRef.current = true;
              } else if (face) {
                const dx = face.x - mascotPosRef.current.x;
                const dy = face.y - mascotPosRef.current.y;
                if (Math.abs(dx) > 0.002) {
                  mascotPosRef.current.x += dx * 0.18;
                }
                if (Math.abs(dy) > 0.002) {
                  mascotPosRef.current.y += dy * 0.18;
                }
                mascotHasHandRef.current = false;
              } else {
                // Bay lơ lửng nhẹ ở trung tâm
                mascotPosRef.current.x += (0.5 - mascotPosRef.current.x) * 0.08;
                mascotPosRef.current.y += (0.55 - mascotPosRef.current.y) * 0.08;
                mascotHasHandRef.current = false;
              }

              if (mascotContainerRef.current) {
                const cx = Math.max(0.12, Math.min(0.88, mascotPosRef.current.x)) * 100;
                const cy = Math.max(0.20, Math.min(0.80, mascotPosRef.current.y)) * 100;
                mascotContainerRef.current.style.left = `${cx}%`;
                mascotContainerRef.current.style.top = `${cy}%`;

                // Cập nhật hướng xoay & lật ảnh (chỉ cập nhật khi đổi trạng thái để tránh style reflow)
                const pointingLeft = mascotPosRef.current.x < 0.5;
                const targetTransform = pointingLeft
                  ? `scaleX(-1) rotate(${cachedSide === 'LEFT' ? 7 : 0}deg)`
                  : `scaleX(1) rotate(${cachedSide === 'RIGHT' ? 7 : 0}deg)`;

                if (lastMascotTransformRef.current !== targetTransform) {
                  lastMascotTransformRef.current = targetTransform;
                  if (mascotImgRef.current) {
                    mascotImgRef.current.style.transform = targetTransform;
                  }
                }

                if (mascotHintRef.current) {
                  const targetOpacity = mascotHasHandRef.current ? '0' : '1';
                  if (mascotHintRef.current.style.opacity !== targetOpacity) {
                    mascotHintRef.current.style.opacity = targetOpacity;
                  }
                }
              }
            }

            // =================================================================
            // CHẾ ĐỘ 1: THỬ NGHIỆM AR (MỤC TIÊU CẦN ĐƯỢC TƯƠNG TÁC TRONG 1S MỚI BIẾN MẤT)
            // =================================================================
            if (mode === 'minigame' && !miniIsFinishedRef.current) {
              const currentTarget = miniTargetsRef.current[miniWaveIndexRef.current];
              if (currentTarget && !miniWaveResolvedRef.current) {
                // 1. Bàn tay chạm mục tiêu (bán kính kiểm tra rộng 0.25 HOẶC cùng phía và gần về chiều dọc)
                const isHandNear = lastHandPointsRef.current.some((pt) => {
                  const dist = Math.hypot(pt.x - currentTarget.x, (pt.y - currentTarget.y) * 1.1);
                  if (dist < 0.25) return true;
                  const isSameSide = currentTarget.side === 'LEFT' ? pt.x < 0.44 : pt.x > 0.56;
                  const isSimilarY = Math.abs(pt.y - currentTarget.y) < 0.30;
                  return isSameSide && isSimilarY;
                });

                // 2. Khuôn mặt chạm mục tiêu (bán kính kiểm tra 0.25 HOẶC nghiêng mặt sang phía mục tiêu)
                const face = lastFacePosRef.current;
                const isFaceNear = face
                  ? Math.hypot(face.x - currentTarget.x, face.y - currentTarget.y) < 0.25 ||
                    (currentTarget.side === 'LEFT' ? face.x < 0.42 : face.x > 0.58)
                  : false;

                // 3. Chuột hover trên mục tiêu
                const isMouseNear = miniIsHoveredRef.current;

                const isInteracting = isHandNear || isFaceNear || isMouseNear;
                const interactionSource = isHandNear ? 'hand' : isFaceNear ? 'face' : 'mouse';

                if (isInteracting) {
                  if (miniHoldStartTimeRef.current === 0) {
                    miniHoldStartTimeRef.current = now;
                    audio.playHoverTick();
                  }

                  const holdDuration = (now - miniHoldStartTimeRef.current) / 1000;
                  const progress = Math.min(1.0, holdDuration / 1.0); // Cần tương tác trong 1.0s

                  // Âm thanh nhịp gõ khi đang giữ
                  if (now - miniLastTickTimeRef.current > 250 && progress < 1.0) {
                    audio.playHoverTick();
                    miniLastTickTimeRef.current = now;
                  }

                  // Cập nhật DOM vòng tiến độ 60 FPS
                  if (miniTimerCircleRef.current) {
                    const circumference = 238.76;
                    const offset = circumference * (1 - progress);
                    miniTimerCircleRef.current.style.strokeDashoffset = `${offset}`;
                  }

                  if (miniTimerTextRef.current) {
                    miniTimerTextRef.current.textContent = `${Math.min(1.0, holdDuration).toFixed(1)}s / 1.0s`;
                  }

                  if (miniTargetCenterRef.current) {
                    miniTargetCenterRef.current.style.transform = `scale(${1 + progress * 0.1})`;
                  }

                  // KHI TƯƠNG TÁC ĐỦ 1 GIÂY -> MỤC TIÊU MỚI BIẾN MẤT VÀ TÍNH ĐIỂM
                  if (holdDuration >= 1.0) {
                    miniWaveResolvedRef.current = true;
                    miniHoldStartTimeRef.current = 0;
                    if (miniTargetCenterRef.current) {
                      miniTargetCenterRef.current.style.transform = 'scale(1)';
                    }
                    if (resolveWaveRef.current) {
                      resolveWaveRef.current(true, currentTarget, interactionSource);
                    }
                  }
                } else {
                  // Khi không tương tác hoặc rời tay: reset tiến độ về 0 (Mục tiêu KHÔNG tự biến mất)
                  miniHoldStartTimeRef.current = 0;
                  if (miniTimerCircleRef.current) {
                    miniTimerCircleRef.current.style.strokeDashoffset = '238.76';
                  }
                  if (miniTimerTextRef.current) {
                    miniTimerTextRef.current.textContent = 'Giữ 1.0s';
                  }
                  if (miniTargetCenterRef.current) {
                    miniTargetCenterRef.current.style.transform = 'scale(1)';
                  }
                }
              }
            }

            // =================================================================
            // CHẾ ĐỘ 2: QUIZ CHỌN ĐÁP ÁN (GIỮ 1 GIÂY ĐỂ KHÓA)
            // =================================================================
            if (mode === 'quiz') {
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

                  if (prevDetectedSideRef.current !== activeSide) {
                    prevDetectedSideRef.current = activeSide;
                    setDetectedSide(activeSide);
                    setDetectedSource(activeSource);
                  }
                } else {
                  const elapsed = now - hs.startTime;
                  const prog = Math.min(100, Math.round((elapsed / HOLD_DURATION_MS) * 100));

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
                        ? isCameraHidden
                          ? `👈 MANA ĐANG CHỈ TRÁI: KHÔNG CÓ AI (${prog}%)`
                          : `👈 ĐANG GIỮ BÊN TRÁI: KHÔNG CÓ AI (${prog}%)`
                        : isCameraHidden
                        ? `👉 MANA ĐANG CHỈ PHẢI: CÓ AI (${prog}%)`
                        : `👉 ĐANG GIỮ BÊN PHẢI: CÓ AI (${prog}%)`;
                  }

                  if (mascotRingRef.current) {
                    mascotRingRef.current.style.transform = `scale(${1 + (prog / 100) * 0.75})`;
                    mascotRingRef.current.style.opacity = `${0.35 + (prog / 100) * 0.65}`;
                  }

                  if (now - lastTickSound > 380 && prog < 100) {
                    lastTickSound = now;
                    audio.playHoverTick();
                  }

                  if (elapsed >= HOLD_DURATION_MS && !hs.triggered && activeSource) {
                    hs.triggered = true;
                    if (onSelectRef.current) {
                      onSelectRef.current(activeSide, activeSource);
                    }
                  }
                }
              } else {
                hs.side = null;
                hs.source = null;
                hs.startTime = now;

                if (leftBarRef.current) leftBarRef.current.style.width = '0%';
                if (rightBarRef.current) rightBarRef.current.style.width = '0%';
                if (leftTextRef.current) {
                  leftTextRef.current.textContent = isCameraHidden ? '👈 Đưa tay sang Trái (Giữ 1s)' : '👈 Vẫy tay/nghiêng mặt';
                }
                if (rightTextRef.current) {
                  rightTextRef.current.textContent = isCameraHidden ? 'Đưa tay sang Phải (Giữ 1s) 👉' : 'Vẫy tay/nghiêng mặt 👉';
                }
                if (centerBadgeRef.current) centerBadgeRef.current.textContent = '0%';
                if (mascotRingRef.current) {
                  mascotRingRef.current.style.transform = 'scale(1)';
                  mascotRingRef.current.style.opacity = '0.35';
                }
                if (statusBadgeRef.current) {
                  statusBadgeRef.current.textContent = isCameraHidden
                    ? '✋ ĐƯA TAY SANG TRÁI HOẶC PHẢI (GIỮ 1 GIÂY)'
                    : '✋ ĐƯA TAY / NGHIÊNG MẶT SANG TRÁI HOẶC PHẢI (GIỮ 1 GIÂY)';
                }

                if (prevDetectedSideRef.current !== null) {
                  prevDetectedSideRef.current = null;
                  setDetectedSide(null);
                  setDetectedSource(null);
                }
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
  }, [enabled, mode]);

  if (!enabled) return null;

  return (
    <div className={`relative w-full h-full flex flex-col min-h-0 overflow-hidden ${className || ''}`}>
      {/* Thanh trạng thái AR tinh gọn (chỉ hiển thị ở chế độ Quiz, ẩn khi ở chế độ minigame thử nghiệm) */}
      {mode !== 'minigame' && (
        <div className="flex items-center justify-between gap-2 px-1 pb-1 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-tertiary animate-ping shrink-0" />
            <span className="text-[10px] sm:text-label-caps text-tertiary font-bold uppercase truncate">
              {isCameraHidden ? 'ĐIỀU KHIỂN CỬ CHỈ AR • MANA CHỈ TAY' : 'CAMERA AR • VẪY TAY HOẶC NGHIÊNG MẶT'}
            </span>
          </div>

          <span
            ref={statusBadgeRef}
            className="text-[9.5px] sm:text-label-kicker text-on-surface-variant uppercase px-2.5 py-0.5 rounded-full bg-surface-container-high border border-white/10 shrink-0 truncate font-semibold"
          >
            {status === 'ready'
              ? isCameraHidden
                ? '✋ ĐƯA TAY SANG TRÁI / PHẢI (GIỮ 1 GIÂY)'
                : '✋ ĐƯA TAY / NGHIÊNG MẶT (GIỮ 1 GIÂY)'
              : status === 'loading'
              ? isCameraHidden
                ? 'ĐANG KÍCH HOẠT NHẬN DIỆN AR...'
                : 'ĐANG BẬT CAMERA...'
              : 'CHẠM TRÁI / PHẢI ĐỂ CHỌN'}
          </span>
        </div>
      )}

      {/* Màn hình AR lấp đầy không gian còn lại (flex-1 min-h-0) - Background Đen khi ẩn cam */}
      <div
        className={`relative flex-1 w-full min-h-0 rounded-xl overflow-hidden ${
          isCameraHidden ? 'bg-black' : 'bg-surface-container-high'
        } flex items-center justify-center border border-white/10`}
      >
        {status === 'loading' && (
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 px-3 text-center z-30">
            <img
              src={BRAND_MASCOTS.cameraWaitAnimated}
              alt="Mana Camera Wait"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
            />
            <span className="text-xs sm:text-body-sm text-on-surface-variant font-semibold">
              {isCameraHidden
                ? 'Đang kích hoạt nhận diện cử chỉ AR...'
                : 'Đang bật Camera AR nhận diện bàn tay & khuôn mặt...'}
            </span>
          </div>
        )}

        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${
            isCameraHidden ? 'opacity-0 pointer-events-none' : 'opacity-85'
          } ${status === 'ready' ? 'block' : 'hidden'}`}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* NỀN ĐEN SÂN ĐẤU CYBER (KHI ẨN CAM) */}
        {isCameraHidden && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 z-10">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px border-l-2 border-dashed border-tertiary/40" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-tertiary/20" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full border border-white/5" />
          </div>
        )}

        {/* MASCOT CHỈ TAY DI CHUYỂN THEO TAY (MỤC 3 PHẦN CHƠI AR - BACKGROUND ĐEN) */}
        {isCameraHidden && status === 'ready' && (
          <div
            ref={mascotContainerRef}
            className="absolute z-25 pointer-events-none -translate-x-1/2 -translate-y-1/2 will-change-[left,top] flex flex-col items-center select-none"
            style={{
              left: '50%',
              top: '55%',
            }}
          >
            {/* Hào quang phát sáng theo cử chỉ */}
            <div
              className={`absolute -inset-4 rounded-full blur-xl pointer-events-none transition-colors duration-200 ${
                detectedSide === 'LEFT'
                  ? 'bg-secondary/40'
                  : detectedSide === 'RIGHT'
                  ? 'bg-tertiary/40'
                  : 'bg-primary/20'
              }`}
            />

            {/* Mascot dáng chỉ tay */}
            <div className="relative">
              <img
                ref={mascotImgRef}
                src={BRAND_MASCOTS.interact}
                alt="Mana Mascot Chỉ tay"
                className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain drop-shadow-[0_8px_24px_rgba(23,219,229,0.55)] will-change-transform"
              />

              {/* Vòng con trỏ laser tại đầu ngón tay chỉ của Mascot */}
              <div
                ref={mascotRingRef}
                className={`absolute -top-1 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full pointer-events-none shadow-lg will-change-transform ${
                  detectedSide === 'LEFT'
                    ? 'bg-secondary border border-white shadow-[0_0_16px_rgba(182,196,255,0.9)]'
                    : detectedSide === 'RIGHT'
                    ? 'bg-tertiary border border-white shadow-[0_0_16px_rgba(23,219,229,0.9)]'
                    : 'bg-emerald-400 border border-white/80 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                }`}
              />
            </div>

            {/* Gợi ý khi chưa giơ tay */}
            <div
              ref={mascotHintRef}
              className="mt-0.5 px-2.5 py-0.5 rounded-full bg-black/90 border border-tertiary/40 text-[8.5px] sm:text-[9.5px] text-tertiary font-bold whitespace-nowrap shadow-md flex items-center gap-1.5 transition-opacity duration-200"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
              <span>Đưa tay sang Trái / Phải để Mana chỉ đáp án</span>
            </div>
          </div>
        )}

        {/* =================================================================
         * CHẾ ĐỘ 1: THỬ NGHIỆM AR (MỤC TIÊU PHẢI TƯƠNG TÁC TRONG 1S MỚI BIẾN MẤT)
         * ================================================================= */}
        {mode === 'minigame' && status === 'ready' && !miniIsFinished && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            {/* Thanh hiển thị tiến độ bài tập và điểm số ở góc trên */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-30 pointer-events-auto">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md border border-white/15 text-white shadow-lg text-[10px] sm:text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>MỤC TIÊU: <strong className="text-tertiary">{miniWaveIndex + 1}</strong> / 10</span>
                <span className="text-white/40">•</span>
                <span>ĐIỂM: <strong className="text-emerald-400">{miniScore}</strong></span>
              </div>

              {/* Nút bỏ qua mục tiêu nếu người dùng muốn chuyển mục tiêu khác */}
              {miniTargets[miniWaveIndex] && !miniHitFeedback && (
                <button
                  type="button"
                  onClick={() => {
                    if (!miniWaveResolvedRef.current) {
                      miniWaveResolvedRef.current = true;
                      miniHoldStartTimeRef.current = 0;
                      resolveWave(false, miniTargets[miniWaveIndex], 'skip');
                    }
                  }}
                  className="px-2.5 py-1 rounded-full bg-surface-container-high/90 hover:bg-surface-container-highest text-on-surface-variant hover:text-white text-[10px] font-semibold border border-white/10 shadow-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  title="Bỏ qua mục tiêu này nếu góc máy quét bị che khuất"
                >
                  <span>Bỏ qua</span>
                  <span className="material-symbols-outlined text-[13px]">skip_next</span>
                </button>
              )}
            </div>

            {/* MỤC TIÊU HIỆN TẠI (CẦN TƯƠNG TÁC GIỮ ĐỦ 1S MỚI BIẾN MẤT) */}
            {miniTargets[miniWaveIndex] && !miniHitFeedback && (
              <div
                style={{
                  left: `${miniTargets[miniWaveIndex].x * 100}%`,
                  top: `${miniTargets[miniWaveIndex].y * 100}%`,
                }}
                onClick={() => handleTargetClick(miniTargets[miniWaveIndex])}
                onMouseEnter={() => { miniIsHoveredRef.current = true; }}
                onMouseLeave={() => { miniIsHoveredRef.current = false; }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center cursor-pointer pointer-events-auto select-none group w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 transition-transform duration-100"
              >
                {/* Vòng lan tỏa Radar */}
                <div
                  className={`absolute inset-0 rounded-full border-2 ${
                    miniTargets[miniWaveIndex].side === 'LEFT' ? 'border-secondary' : 'border-tertiary'
                  } animate-ping opacity-50 pointer-events-none`}
                />

                {/* Vòng nạp tiến độ tương tác SVG 1.0 giây (Bắt đầu từ rỗng 238.76 và lấp đầy khi giữ 1s) */}
                <svg className="w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 96 96">
                  <circle
                    cx="48"
                    cy="48"
                    r="38"
                    className="stroke-white/15"
                    strokeWidth="5"
                    fill="none"
                  />
                  <circle
                    ref={miniTimerCircleRef}
                    cx="48"
                    cy="48"
                    r="38"
                    className={miniTargets[miniWaveIndex].side === 'LEFT' ? 'stroke-secondary' : 'stroke-tertiary'}
                    strokeWidth="5.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="238.76"
                    style={{ strokeDashoffset: '238.76', transition: 'stroke-dashoffset 40ms linear' }}
                  />
                </svg>

                {/* Nhân trung tâm của Mục tiêu */}
                <div
                  ref={miniTargetCenterRef}
                  className={`absolute inset-2 sm:inset-3 rounded-full backdrop-blur-md border-2 flex flex-col items-center justify-center transition-all duration-100 ${
                    miniTargets[miniWaveIndex].side === 'LEFT'
                      ? 'bg-secondary-container/80 border-secondary text-secondary shadow-[0_0_24px_rgba(184,196,255,0.7)]'
                      : 'bg-tertiary-container/80 border-tertiary text-tertiary shadow-[0_0_24px_rgba(23,219,229,0.7)]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px] sm:text-[28px] animate-bounce my-0.5 text-white">
                    front_hand
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-black uppercase text-white tracking-wider text-center leading-none">
                    {miniTargets[miniWaveIndex].side === 'LEFT' ? 'TRÁI' : 'PHẢI'}
                  </span>
                </div>

                {/* Nhãn hướng dẫn & tiến độ giữ tương tác 1s */}
                <div className="absolute -top-7 whitespace-nowrap px-2.5 py-0.5 rounded-full bg-surface-container-lowest/95 border border-white/20 text-white text-[9.5px] sm:text-[10.5px] font-bold shadow-lg flex items-center gap-1.5 pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                  <span ref={miniTimerTextRef} className="font-mono text-tertiary font-black">
                    Giữ 1.0s
                  </span>
                  <span className="text-white/80">• Đưa tay/mặt vào</span>
                </div>

                {/* Tên vùng mục tiêu */}
                <div className="absolute -bottom-5 whitespace-nowrap px-2 py-0.5 rounded-full bg-black/60 text-[8.5px] text-white/70 font-semibold pointer-events-none">
                  {miniTargets[miniWaveIndex].label}
                </div>
              </div>
            )}

            {/* Phản hồi khi Bắt trúng hoặc Bỏ qua */}
            {miniHitFeedback && (
              <div
                style={{
                  left: `${miniHitFeedback.x * 100}%`,
                  top: `${miniHitFeedback.y * 100}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-40 px-3.5 py-1.5 rounded-xl font-black text-xs sm:text-sm tracking-wide shadow-2xl flex items-center gap-1.5 pointer-events-none ppt-page-enter ${
                  miniHitFeedback.success
                    ? 'bg-emerald-400 text-[#032117] border-2 border-white shadow-[0_0_35px_rgba(16,185,129,0.9)] scale-110'
                    : 'bg-surface-container-highest text-on-surface border-2 border-white/30 shadow-[0_0_20px_rgba(0,0,0,0.5)]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {miniHitFeedback.success ? 'check_circle' : 'skip_next'}
                </span>
                <span>{miniHitFeedback.text}</span>
              </div>
            )}
          </div>
        )}

        {/* MÀN HÌNH TỔNG KẾT KẾT QUẢ MINI GAME */}
        {mode === 'minigame' && miniIsFinished && (
          <div className="absolute inset-0 z-40 bg-surface-container-lowest/95 backdrop-blur-2xl rounded-xl flex flex-col items-center justify-center p-4 sm:p-6 text-center gap-2.5 sm:gap-3 ppt-page-enter overflow-y-auto">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-tertiary/20 to-emerald-400/30 border border-tertiary/40 flex items-center justify-center shadow-[0_0_30px_rgba(23,219,229,0.4)]">
              <span className="material-symbols-outlined text-tertiary text-[32px] sm:text-[40px]">
                emoji_events
              </span>
            </div>

            <div className="flex flex-col gap-1 max-w-md">
              <span className="text-label-caps text-tertiary uppercase text-[10px] sm:text-[11px] font-bold">
                HOÀN THÀNH THỬ NGHIỆM AR
              </span>
              <h3 className="text-lg sm:text-2xl font-black text-white uppercase">
                {miniScore >= 8
                  ? 'PHẢN XẠ AR XUẤT SẮC!'
                  : miniScore >= 5
                  ? 'KẾT QUẢ RẤT TỐT!'
                  : 'ĐÃ HOÀN TẤT THỬ NGHIỆM!'}
              </h3>
              <div className="inline-flex items-center justify-center gap-2 py-1 px-4 rounded-xl bg-surface-container-high border border-white/10 my-1 mx-auto">
                <span className="text-xs text-on-surface-variant font-semibold">ĐIỂM ĐẠT:</span>
                <span className="text-lg sm:text-xl font-mono font-black text-emerald-400">
                  {miniScore} / 10
                </span>
                <span className="text-xs font-bold text-tertiary">({miniScore * 10}%)</span>
              </div>
              <p className="text-[11px] sm:text-xs text-on-surface-variant leading-relaxed">
                {miniScore >= 8
                  ? 'Webcam nhận diện cử chỉ của bạn cực kỳ nhạy bén. Bạn đã sẵn sàng bước vào trận đấu Kéo co AI!'
                  : miniScore >= 5
                  ? 'Bạn đã làm quen thành thạo với cử chỉ giơ tay và nghiêng đầu Trái / Phải.'
                  : 'Hãy đảm bảo bạn ngồi ở nơi đủ ánh sáng và giơ tay rõ ràng trước camera khi vào trận!'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
              <button
                type="button"
                onClick={() => {
                  audio.playClick();
                  restartMiniGame();
                }}
                className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold border border-white/10 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>Luyện tập lại</span>
              </button>

              {onStartGame && (
                <button
                  type="button"
                  onClick={() => {
                    audio.playClick();
                    onStartGame();
                  }}
                  className="px-5 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 via-tertiary to-emerald-300 text-[#032117] font-black text-xs uppercase tracking-wider shadow-[0_6px_20px_rgba(23,219,229,0.4)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>VÀO CHƠI KÉO CO (BƯỚC 03)</span>
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* =================================================================
         * CHẾ ĐỘ 2: LỚP PHỦ QUIZ 2 VÙNG TRÁI / PHẢI (CHO BƯỚC 03 - KÉO CO)
         * ================================================================= */}
        {mode === 'quiz' && (
          <div className="absolute inset-0 z-20 grid grid-cols-12 gap-1.5 sm:gap-2 p-1.5 sm:p-2.5">
            {/* VÙNG AR 1: KHÔNG CÓ AI (TRÁI) */}
            <div
              onClick={() => !locked && onSelectRef.current && onSelectRef.current('LEFT', 'hand')}
              className={`col-span-5 rounded-xl border-2 p-2 sm:p-2.5 flex flex-col justify-between transition-all relative overflow-hidden cursor-pointer ${
                selectedSide === 'LEFT'
                  ? !hasAI
                    ? 'border-emerald-400 bg-emerald-950/80 shadow-[0_0_30px_rgba(16,185,129,0.6)]'
                    : 'border-error bg-error-container/70 shadow-[0_0_25px_rgba(255,180,171,0.5)]'
                  : detectedSide === 'LEFT'
                  ? 'border-secondary bg-secondary-container/30 shadow-[0_0_28px_rgba(182,196,255,0.6)] scale-[1.01]'
                  : isCameraHidden
                  ? 'border-white/15 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm'
                  : 'border-white/20 bg-surface-container-lowest/60 hover:bg-surface-container-lowest/75'
              }`}
            >
              <div
                ref={leftBarRef}
                className="absolute bottom-0 left-0 h-1.5 sm:h-2 bg-secondary"
                style={{ width: '0%' }}
              />

              <div className="flex items-center justify-between gap-1">
                <div className="text-xs sm:text-sm md:text-base text-white font-black drop-shadow tracking-wide">
                  KHÔNG CÓ AI
                </div>
                {selectedSide === 'LEFT' && (
                  <span
                    className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-label-kicker font-black ${
                      !hasAI ? 'bg-emerald-400 text-[#032117]' : 'bg-error text-on-error'
                    }`}
                  >
                    {!hasAI ? '✓ ĐÚNG' : '✕ SAI'}
                  </span>
                )}
              </div>

              <div
                ref={leftTextRef}
                className="text-[9px] sm:text-label-kicker text-on-surface-variant uppercase truncate font-bold"
              >
                {isCameraHidden ? '👈 Đưa tay sang Trái (Giữ 1s)' : '👈 Vẫy tay / Nghiêng đầu Trái'}
              </div>
            </div>

            {/* VÙNG TRUNG TÂM: TIẾN ĐỘ VÀ MANA */}
            <div className="col-span-2 flex flex-col items-center justify-between py-1 pointer-events-none">
              <span className="px-1.5 py-0.5 rounded-full bg-surface-container-lowest/85 border border-white/15 text-[8px] sm:text-[9.5px] font-mono font-bold text-tertiary uppercase">
                {isCameraHidden ? 'MANA AR' : 'AR CAM'}
              </span>

              <div
                ref={centerBadgeRef}
                className="px-2 py-0.5 rounded-lg bg-surface-container-lowest/95 border border-tertiary text-tertiary text-[10px] sm:text-xs font-mono uppercase shadow-lg text-center font-bold"
              >
                0%
              </div>

              <span className="text-[8px] sm:text-[9.5px] font-bold text-white/75 uppercase text-center hidden sm:block">
                Ở giữa
              </span>
            </div>

            {/* VÙNG AR 2: CÓ SỬ DỤNG AI (PHẢI) */}
            <div
              onClick={() => !locked && onSelectRef.current && onSelectRef.current('RIGHT', 'hand')}
              className={`col-span-5 rounded-xl border-2 p-2 sm:p-2.5 flex flex-col justify-between items-end text-right transition-all relative overflow-hidden cursor-pointer ${
                selectedSide === 'RIGHT'
                  ? hasAI
                    ? 'border-emerald-400 bg-emerald-950/80 shadow-[0_0_30px_rgba(16,185,129,0.6)]'
                    : 'border-error bg-error-container/70 shadow-[0_0_25px_rgba(255,180,171,0.5)]'
                  : detectedSide === 'RIGHT'
                  ? 'border-tertiary bg-tertiary-container/30 shadow-[0_0_28px_rgba(23,219,229,0.6)] scale-[1.01]'
                  : isCameraHidden
                  ? 'border-white/15 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm'
                  : 'border-white/20 bg-surface-container-lowest/60 hover:bg-surface-container-lowest/75'
              }`}
            >
              <div
                ref={rightBarRef}
                className="absolute bottom-0 right-0 h-1.5 sm:h-2 bg-tertiary"
                style={{ width: '0%' }}
              />

              <div className="flex items-center justify-between gap-1 w-full">
                {selectedSide === 'RIGHT' ? (
                  <span
                    className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-label-kicker font-black ${
                      hasAI ? 'bg-emerald-400 text-[#032117]' : 'bg-error text-on-error'
                    }`}
                  >
                    {hasAI ? '✓ ĐÚNG' : '✕ SAI'}
                  </span>
                ) : (
                  <span />
                )}
                <div className="text-xs sm:text-sm md:text-base text-white font-black drop-shadow tracking-wide">
                  CÓ SỬ DỤNG AI
                </div>
              </div>

              <div
                ref={rightTextRef}
                className="text-[9px] sm:text-label-kicker text-on-surface-variant uppercase truncate font-bold"
              >
                {isCameraHidden ? 'Đưa tay sang Phải (Giữ 1s) 👉' : 'Vẫy tay / Nghiêng đầu Phải 👉'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
