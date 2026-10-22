export interface TugQuestion {
  id: number;
  topic: string;
  toolName: string;
  image: string;
  question: string;
  hasAI: boolean; // true = CÓ SỬ DỤNG AI (Phải), false = KHÔNG CÓ AI (Trái)
  descNoAI: string; // Giải thích cho phương án KHÔNG CÓ AI (Bên Trái)
  descHasAI: string; // Giải thích cho phương án CÓ AI (Bên Phải)
  insight: string; // Giải thích sư phạm nhanh sau khi chọn
}

export const TUG_QUESTIONS: TugQuestion[] = [
  {
    id: 1,
    toolName: 'Hệ thống gợi ý video',
    image: '/assets/tools/tool-3.png',
    topic: 'CÔNG CỤ 1: HỆ THỐNG GỢI Ý VIDEO (RECOMMENDER SYSTEM)',
    question:
      '“Ứng dụng tự động gợi ý video bài giảng hoặc clip giải trí dựa trên lịch sử và sở thích của người xem có sử dụng AI không?”',
    hasAI: true,
    descNoAI:
      'Chỉ đơn thuần dùng danh sách bài phát ngẫu nhiên có sẵn (Static Shuffle) hoặc dựa vào số thứ tự bài giảng cài đặt sẵn.',
    descHasAI:
      'Hệ thống áp dụng thuật toán học máy (Machine Learning) để nhận diện xu hướng hành vi và tự động cá nhân hóa nội dung.',
    insight:
      'Thuật toán AI phân tích thời gian xem, lượt tương tác và sở thích để cá nhân hóa đề xuất (Recommendation Engine) cho từng học sinh.',
  },
  {
    id: 2,
    toolName: 'Đồng hồ báo thức hẹn giờ',
    image: '/assets/tools/tool-6.png',
    topic: 'CÔNG CỤ 2: ĐỒNG HỒ BÁO THỨC CƠ HẸN GIỜ',
    question:
      '“Đồng hồ để bàn reo chuông đúng 6:00 sáng mỗi ngày theo giờ đã vặn kim cài đặt sẵn có phải là AI không?”',
    hasAI: false,
    descNoAI:
      'Bộ đếm thời gian hệ thống so sánh giờ hiện tại với mốc 06:00 đã lưu và phát chuông khi trùng khớp (Rule-based).',
    descHasAI:
      'Đồng hồ tự phân tích giấc ngủ và lịch họp để tự ý đổi giờ báo thức mỗi sáng.',
    insight:
      'Hẹn giờ cố định là lập trình điều kiện IF-THEN cơ bản, hoàn toàn không có khả năng học máy hay suy luận thích nghi.',
  },
  {
    id: 3,
    toolName: 'Nhận diện khuôn mặt Face ID',
    image: '/assets/tools/tool-2.png',
    topic: 'CÔNG CỤ 3: NHẬN DIỆN KHUÔN MẶT (FACE ID)',
    question:
      '“Tính năng mở khóa điện thoại bằng khuôn mặt (FaceID) ngay cả khi đổi kiểu tóc hoặc đeo kính có sử dụng AI không?”',
    hasAI: true,
    descNoAI:
      'Chỉ chụp ảnh 2D thông thường rồi so khớp từng điểm ảnh cố định với bức ảnh gốc lưu trong bộ nhớ.',
    descHasAI:
      'Sử dụng mạng nơ-ron sâu (Deep Learning) để phân tích cấu trúc 3D khuôn mặt và thích nghi với thay đổi ngoại hình.',
    insight:
      'Thị giác máy tính (Computer Vision) giúp máy nhận diện đặc trưng khuôn mặt chính xác dù góc nhìn, ánh sáng hay phụ kiện thay đổi.',
  },
  {
    id: 4,
    toolName: 'Tưới cây cảm biến độ ẩm',
    image: '/assets/tools/tool-10.png',
    topic: 'CÔNG CỤ 4: HỆ THỐNG TƯỚI CÂY CẢM BIẾN ĐỘ ẨM (IOT)',
    question:
      '“Hệ thống tự động bơm nước tưới cây khi đầu dò cảm biến đo độ ẩm đất giảm xuống dưới mức 30% có phải là AI không?”',
    hasAI: false,
    descNoAI:
      'Cảm biến điện tử kích hoạt rơ-le đóng ngắt mạch điện cơ bản theo ngưỡng vật lý cố định (Rule-based Automation).',
    descHasAI:
      'Cửa nhận diện khuôn mặt từng khách hàng và phân tích tâm trạng để quyết định tốc độ mở cửa.',
    insight:
      'Cảm biến IoT kích hoạt theo ngưỡng số liệu cài sẵn là tự động hóa điều khiển (Automation), không phải mô hình học máy.',
  },
  {
    id: 5,
    toolName: 'Loa thông minh trợ lý ảo',
    image: '/assets/tools/tool-1.png',
    topic: 'CÔNG CỤ 5: LOA THÔNG MINH TRỢ LÝ ẢO (VOICE AI)',
    question:
      '“Loa thông minh lắng nghe câu lệnh bằng giọng nói tự nhiên và trả lời thắc mắc của học sinh có sử dụng AI không?”',
    hasAI: true,
    descNoAI:
      'Bên trong chỉ lưu các file ghi âm câu trả lời có sẵn và phát ngẫu nhiên khi nghe thấy tiếng động.',
    descHasAI:
      'Ứng dụng AI nhận dạng giọng nói (ASR) và Xử lý ngôn ngữ tự nhiên (NLP) để hiểu ý định và tạo phản hồi.',
    insight:
      'Trợ lý giọng nói kết hợp nhận diện âm thanh và mô hình ngôn ngữ lớn để giao tiếp linh hoạt và hỗ trợ giải đáp cho học sinh.',
  },
  {
    id: 6,
    toolName: 'Thẻ từ RFID điểm danh',
    image: '/assets/tools/tool-8.png',
    topic: 'CÔNG CỤ 6: THẺ TỪ RFID ĐIỂM DANH HỌC SINH',
    question:
      '“Hệ thống quét thẻ từ (RFID) ở cổng trường phát tiếng kêu “Tít” và ghi nhận giờ học sinh đến lớp có sử dụng AI không?”',
    hasAI: false,
    descNoAI:
      'Đầu đọc vô tuyến chỉ so khớp mã số thẻ cố định với danh sách mã học sinh đã lưu sẵn trong cơ sở dữ liệu.',
    descHasAI:
      'Máy tự phân tích cảm xúc và tư thế đi lại của học sinh để dự đoán học sinh có đi học chuyên cần hay không.',
    insight:
      'Quét thẻ RFID là công nghệ định danh vô tuyến 1-1 theo quy tắc cố định, thuần túy là tự động hóa vi mạch chứ không có mô hình học máy.',
  },
  {
    id: 7,
    toolName: 'Luyện phát âm tiếng Anh AI',
    image: '/assets/tools/tool-5.png',
    topic: 'CÔNG CỤ 7: ỨNG DỤNG LUYỆN PHÁT ÂM TIẾNG ANH (AI SPEECH)',
    question:
      '“Ứng dụng luyện phát âm tiếng Anh lắng nghe học sinh đọc bài và chỉ ra chính xác từ nào phát âm sai âm cuối có dùng AI không?”',
    hasAI: true,
    descNoAI:
      'Chỉ đo độ to nhỏ của âm thanh qua micro rồi chấm điểm ngẫu nhiên theo thời lượng nói.',
    descHasAI:
      'Sử dụng AI nhận dạng giọng nói (Speech Recognition) và phân tích âm vị để đối chiếu với chuẩn phát âm bản ngữ.',
    insight:
      'AI xử lý âm thanh hỗ trợ cá nhân hóa việc rèn kỹ năng ngoại ngữ cho từng học sinh ngay tại nhà.',
  },
  {
    id: 8,
    toolName: 'Hẹn giờ đếm ngược điện thoại',
    image: '/assets/tools/tool-9.png',
    topic: 'CÔNG CỤ 8: HẸN GIỜ ĐẾM NGƯỢC ĐIỆN THOẠI',
    question:
      '“Bộ đếm ngược 10 phút trên điện thoại kêu chuông báo khi đồng hồ chạy về 00:00 có phải là AI không?”',
    hasAI: false,
    descNoAI:
      'Bộ đếm thời gian hệ thống so sánh giờ hiện tại với mốc thời gian đã cài và phát âm thanh khi trùng khớp.',
    descHasAI:
      'Điện thoại tự suy luận tốc độ làm bài của học sinh để tự điều chỉnh thời gian thi.',
    insight:
      'Bộ đếm thời gian là hàm toán học trừ dần (T = T - 1), là logic tin học cơ bản chứ không phải trí tuệ nhân tạo.',
  },
  {
    id: 9,
    toolName: 'GenAI Tạo ảnh từ văn bản',
    image: '/assets/tools/tool-7.png',
    topic: 'CÔNG CỤ 9: CÔNG CỤ TẠO ẢNH BẰNG VĂN BẢN (GENAI TEXT-TO-IMAGE)',
    question:
      '“Công cụ vẽ tranh minh họa bài giảng lịch sử tự động từ mô tả văn bản của giáo viên (như Canva AI, Midjourney) có sử dụng AI không?”',
    hasAI: true,
    descNoAI:
      'Chỉ tìm kiếm và cắt ghép ngẫu nhiên các bức ảnh chụp có sẵn từ kho lưu trữ ảnh trên mạng Internet.',
    descHasAI:
      'Mô hình khuếch tán (Diffusion Model / GenAI) hiểu câu lệnh văn bản và tự vẽ sinh ra hình ảnh hoàn toàn mới.',
    insight:
      'Trí tuệ nhân tạo tạo sinh (GenAI) học từ hàng triệu cặp ảnh - văn bản để sáng tạo hình ảnh mới, giúp thầy cô làm bài giảng trực quan sinh động.',
  },
  {
    id: 10,
    toolName: 'Máy tính bỏ túi cầm tay',
    image: '/assets/tools/tool-12.png',
    topic: 'CÔNG CỤ 10: MÁY TÍNH BỎ TÚI CẦM TAY (CALCULATOR)',
    question:
      '“Máy tính bỏ túi thông thường thực hiện phép tính nhân 125 × 48 = 6000 ngay lập tức khi bấm phím có phải là AI không?”',
    hasAI: false,
    descNoAI:
      'Hoạt động hoàn toàn theo quy tắc toán học cố định (Rule-based logic) đã lập trình cứng, không tự học từ dữ liệu.',
    descHasAI:
      'Máy tự suy luận và học thói quen bấm phím của người dùng để dự đoán kết quả phép tính mới.',
    insight:
      'Phân biệt rõ Tự động hóa theo quy tắc cố định (Rule-based) và Trí tuệ nhân tạo (có khả năng học hỏi, thích nghi từ dữ liệu).',
  },
  {
    id: 11,
    toolName: 'Dịch thuật ngôn ngữ tự động',
    image: '/assets/tools/tool-4.png',
    topic: 'CÔNG CỤ 11: ỨNG DỤNG DỊCH THUẬT NGÔN NGỮ (AI TRANSLATE)',
    question:
      '“Công cụ tự động dịch toàn bộ đoạn văn học thuật từ tiếng Anh sang tiếng Việt giữ đúng ngữ cảnh có dùng AI không?”',
    hasAI: true,
    descNoAI:
      'Chỉ tra từ điển từng từ một theo bảng ghép từ cơ học không quan tâm đến ngữ cảnh ngữ nghĩa.',
    descHasAI:
      'Ứng dụng Dịch máy nơ-ron (Neural Machine Translation) hiểu cấu trúc ngữ pháp và ngữ cảnh toàn câu.',
    insight:
      'Dịch máy nơ-ron (NMT) dùng AI để nắm bắt ngữ nghĩa toàn câu, giúp học sinh tiếp cận tri thức toàn cầu nhanh chóng.',
  },
  {
    id: 12,
    toolName: 'Mạng nơ-ron & LLM tóm tắt',
    image: '/assets/tools/tool-11.png',
    topic: 'CÔNG CỤ 12: MẠNG NƠ-RON SÂU TÓM TẮT TÀI LIỆU (NLP / LLM)',
    question:
      '“Trợ lý ảo hỗ trợ giáo viên tóm tắt tài liệu PDF dài 20 trang và gợi ý 5 câu hỏi trắc nghiệm theo ngữ cảnh có dùng AI không?”',
    hasAI: true,
    descNoAI:
      'Chỉ cắt ghép ngẫu nhiên câu đầu tiên của mỗi đoạn văn và chèn vào mẫu câu hỏi có sẵn.',
    descHasAI:
      'Ứng dụng Mô hình ngôn ngữ lớn (LLM) để hiểu ngữ nghĩa văn bản, rút trích ý chính và sinh câu hỏi phù hợp.',
    insight:
      'Xử lý ngôn ngữ tự nhiên (NLP) và GenAI giúp giáo viên tiết kiệm thời gian tạo bản nháp học liệu, nhưng giáo viên vẫn là người kiểm duyệt cuối.',
  },
];

/**
 * Trả về danh sách câu hỏi được xáo trộn ngẫu nhiên (Fisher-Yates shuffle) cho mỗi lượt chơi mới.
 * Tự động gán lại nhãn "CÔNG CỤ 1, CÔNG CỤ 2, ..." theo đúng thứ tự xuất hiện của lượt chơi đó.
 */
export function getShuffledQuestions(): TugQuestion[] {
  const shuffled = [...TUG_QUESTIONS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.map((q, idx) => {
    const rawName = q.topic.replace(/^CÔNG CỤ\s*\d*:\s*/i, '').trim();
    return {
      ...q,
      topic: `CÔNG CỤ ${idx + 1}: ${rawName}`,
    };
  });
}

