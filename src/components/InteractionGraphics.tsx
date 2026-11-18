interface HandSkeletonGraphicProps {
  color?: string;
  className?: string;
}

// 21 tọa độ landmark bàn tay xòe tự nhiên (chuẩn MediaPipe Hand Landmarker 0..100)
const HAND_LANDMARKS: [number, number][] = [
  [50, 92], // 0: Cổ tay (Wrist)
  // Ngón cái (Thumb)
  [36, 80], [25, 68], [17, 56], [10, 44],
  // Ngón trỏ (Index)
  [38, 56], [32, 40], [27, 26], [23, 11],
  // Ngón giữa (Middle)
  [50, 54], [50, 36], [50, 21], [50, 7],
  // Ngón áp út (Ring)
  [62, 56], [68, 40], [73, 26], [77, 11],
  // Ngón út (Pinky)
  [74, 62], [82, 50], [87, 39], [92, 29],
];

const HAND_CONNECTIONS: [number, number][] = [
  // Cổ tay đến các khớp gốc
  [0, 1], [0, 5], [0, 9], [0, 13], [0, 17],
  // Vành lòng bàn tay
  [5, 9], [9, 13], [13, 17],
  // Ngón cái
  [1, 2], [2, 3], [3, 4],
  // Ngón trỏ
  [5, 6], [6, 7], [7, 8],
  // Ngón giữa
  [9, 10], [10, 11], [11, 12],
  // Ngón áp út
  [13, 14], [14, 15], [15, 16],
  // Ngón út
  [17, 18], [18, 19], [19, 20],
];

const TIP_INDICES = [4, 8, 12, 16, 20];

export function HandSkeletonGraphic({
  color = '#16a34a',
  className = 'w-full h-full',
}: HandSkeletonGraphicProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="hand-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Đường xương kết nối gạch chấm chuẩn AR tracking */}
      <g filter="url(#hand-glow)">
        {HAND_CONNECTIONS.map(([from, to], idx) => {
          const p1 = HAND_LANDMARKS[from];
          const p2 = HAND_LANDMARKS[to];
          return (
            <line
              key={`bone-${idx}`}
              x1={p1[0]}
              y1={p1[1]}
              x2={p2[0]}
              y2={p2[1]}
              stroke={color}
              strokeWidth="2.8"
              strokeDasharray="3 3"
              strokeLinecap="round"
              strokeOpacity="0.9"
            />
          );
        })}
      </g>

      {/* 21 Khớp tròn Landmark nổi bật */}
      {HAND_LANDMARKS.map(([x, y], idx) => {
        const isTip = TIP_INDICES.includes(idx);
        const isWrist = idx === 0;

        return (
          <g key={`joint-${idx}`}>
            {isTip && (
              <circle
                cx={x}
                y={y}
                r="4.8"
                fill={color}
                fillOpacity="0.3"
                className="animate-ping"
                style={{ transformOrigin: `${x}px ${y}px`, animationDuration: '2s' }}
              />
            )}
            <circle
              cx={x}
              y={y}
              r={isTip ? 3.6 : isWrist ? 4 : 2.6}
              fill={isTip ? '#FFFFFF' : color}
              stroke={isTip ? color : '#FFFFFF'}
              strokeWidth="1.5"
            />
          </g>
        );
      })}
    </svg>
  );
}

export function MouseGraphic({
  color = '#2563eb',
  className = 'w-full h-full',
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="mouse-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="mouseBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eff6ff" />
        </linearGradient>
      </defs>

      {/* Thân chuột máy tính 3D mềm mại */}
      <rect
        x="26"
        y="14"
        width="48"
        height="72"
        rx="24"
        fill="url(#mouseBodyGrad)"
        stroke={color}
        strokeWidth="3.5"
        filter="url(#mouse-glow)"
      />

      {/* Đường phân tách 2 phím chuột trái / phải */}
      <line
        x1="50"
        y1="15"
        x2="50"
        y2="44"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray="2 2"
      />

      {/* Con lăn chuột (Scroll wheel) */}
      <rect
        x="46"
        y="23"
        width="8"
        height="16"
        rx="4"
        fill={color}
        stroke="#ffffff"
        strokeWidth="1.5"
      />

      {/* Sóng bấm click hiệu ứng gạch chấm xung quanh phím chuột trái */}
      <path
        d="M20 22 C22 15, 30 10, 38 8"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray="3 3"
        strokeLinecap="round"
      />
      <path
        d="M14 26 C17 14, 27 6, 42 4"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="4 4"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />

      {/* Con trỏ chuột mini trôi nhẹ */}
      <path
        d="M62 62 L74 74 L68 76 L72 84 L68 86 L64 78 L58 83 Z"
        fill={color}
        stroke="#ffffff"
        strokeWidth="1.5"
      />
    </svg>
  );
}
