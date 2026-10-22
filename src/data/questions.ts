export interface TugQuestion {
  id: number;
  topic: string;
  question: string;
  hasAI: boolean; // true = CÓ SỬ DỤNG AI (Phải), false = KHÔNG CÓ AI (Trái)
  descNoAI: string; // Giải thích cho phương án KHÔNG CÓ AI (Bên Trái)
  descHasAI: string; // Giải thích cho phương án CÓ AI (Bên Phải)
  insight: string; // Giải thích sư phạm nhanh sau khi chọn
}

export const TUG_QUESTIONS: TugQuestion[] = [
  {
    id: 1,
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
    topic: 'CÔNG CỤ 2: MÁY TÍNH BỎ TÚI CẦM TAY (CALCULATOR)',
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
    id: 3,
    topic: 'CÔNG CỤ 3: NHẬN DIỆN KHUÔN MẶT (FACE ID)',
    question:
      '“Tính năng mở khóa điện thoại bằng khuôn mặt (FaceID) ngay cả khi người dùng đội mũ hoặc đeo kính có sử dụng AI không?”',
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
    topic: 'CÔNG CỤ 4: CỬA TỰ ĐỘNG CẢM BIẾN HỒNG NGOẠI',
    question:
      '“Cửa kính tự động mở ra khi có người bước vào vùng cảm biến hồng ngoại ở siêu thị có sử dụng AI không?”',
    hasAI: false,
    descNoAI:
      'Cảm biến hồng ngoại hoặc chuyển động chỉ đóng/ngắt mạch điện cơ bản khi phát hiện tia phản xạ vật lý.',
    descHasAI:
      'Cửa nhận diện khuôn mặt từng khách hàng và phân tích tâm trạng để quyết định tốc độ mở cửa.',
    insight:
      'Cảm biến tự động là thiết bị điện tử phản ứng theo ngưỡng vật lý cố định, không có mô hình học máy hay suy luận thông minh.',
  },
  {
    id: 5,
    topic: 'CÔNG CỤ 5: TRỢ LÝ AI TÓM TẮT & TẠO CÂU HỎI (NLP / LLM)',
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
  {
    id: 6,
    topic: 'CÔNG CỤ 6: BẢNG TÍNH EXCEL (HÀM SẮP XẾP A → Z)',
    question:
      '“Chức năng sắp xếp danh sách tên học sinh theo thứ tự bảng chữ cái A → Z trong bảng tính Excel có phải là AI không?”',
    hasAI: false,
    descNoAI:
      'Thực hiện so sánh mã ký tự Unicode theo thuật toán sắp xếp xác định (Sorting Algorithm), kết quả luôn cố định.',
    descHasAI:
      'Tự động đánh giá năng lực học sinh qua tên gọi để xếp vị trí ngồi trong lớp học.',
    insight:
      'Các hàm lọc, sắp xếp A-Z hay tính tổng trong bảng tính là thuật toán tin học truyền thống, không phải trí tuệ nhân tạo.',
  },
  {
    id: 7,
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
    topic: 'CÔNG CỤ 8: ĐỒNG HỒ BÁO THỨC ĐIỆN THOẠI HẸN GIỜ',
    question:
      '“Chuông báo thức điện thoại kêu đúng 6:00 sáng mỗi ngày theo giờ người dùng đã cài đặt sẵn có sử dụng AI không?”',
    hasAI: false,
    descNoAI:
      'Bộ đếm thời gian hệ thống so sánh giờ hiện tại với mốc 06:00 đã lưu và phát âm thanh khi trùng khớp.',
    descHasAI:
      'Đồng hồ tự phân tích giấc ngủ và lịch họp để tự ý đổi giờ báo thức mỗi sáng.',
    insight:
      'Hẹn giờ cố định là lập trình điều kiện đơn giản (IF time == 06:00 THEN ring), giúp học sinh phân biệt chương trình thường với AI.',
  },
  {
    id: 9,
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
    topic: 'CÔNG CỤ 10: THẺ TỪ QUÉT MÃ RFID ĐIỂM DANH HỌC SINH',
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
    const rawName = q.topic.replace(/^CÔNG CỤ\s+\d+:\s*/i, '').trim();
    return {
      ...q,
      topic: `CÔNG CỤ ${idx + 1}: ${rawName}`,
    };
  });
}

