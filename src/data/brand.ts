const base = import.meta.env.BASE_URL || '/';
const asset = (relPath: string) => `${base}${relPath.replace(/^\/+/, '')}`;

export const MANABIE_LOGO = asset('assets/brand/manabie-logo.png');
export const MANABIE_MARK = asset('assets/brand/manabie-app.svg');

/**
 * Bộ mascot Manabie (bao gồm ảnh động GIF, hoạt cảnh Kéo co và các tư thế 3D)
 * Đã chuẩn hóa đường dẫn qua BASE_URL và loại bỏ ReparsePoint OneDrive.
 */
export const BRAND_MASCOTS = {
  welcomeAnimated: asset('assets/tutorial/popup-mascot-welcome-v3/mana-welcome-loop-v3.gif'),
  inspectAnimated: asset('assets/tutorial/popup-mascot-inspect-v5/mana-inspect-loop-v5.gif'),
  actionAnimated: asset('assets/tutorial/popup-mascot-action/mana-action-loop.gif'),
  cameraWaitAnimated: asset('assets/tutorial/popup-mascot-camera/mana-camera-wait-loop.gif'),
  phone: asset('assets/brand-mascot/mana-phone.png'),
  explore: asset('assets/brand-mascot/mana-explore.png'),
  inspect: asset('assets/brand-mascot/mana-inspect.png'),
  action: asset('assets/brand-mascot/mana-action.png'),
  nurture: asset('assets/brand-mascot/mana-nurture.png'),
  present: asset('assets/brand-mascot/mana-present.png'),
  submit: asset('assets/brand-mascot/mana-submit.png'),
  feedback: asset('assets/brand-mascot/mana-feedback.png'),
  security: asset('assets/brand-mascot/mana-security.png'),
  time: asset('assets/brand-mascot/mana-time.png'),
  sync: asset('assets/brand-mascot/mana-sync.png'),
  interact: asset('assets/brand-mascot/mana-interact.png'),
  chaoMung: asset('assets/mascot/01_chao_mung.png'),
  giangGiai: asset('assets/mascot/02_giang_giai.png'),
  suyNghi: asset('assets/mascot/03_suy_nghi.png'),
  lamViecNhom: asset('assets/mascot/05_lam_viec_nhom.png'),
  hoanThanh: asset('assets/mascot/09_hoan_thanh.png'),
  tongKet: asset('assets/mascot/10_tong_ket.png'),
  aiAssistant3d: asset('assets/debrief_ai_assistant_3d.png'),
  teacherInspiring3d: asset('assets/debrief_teacher_inspiring_3d.png'),
  arenaPreview: asset('assets/mission-arena-v2.png'),
  tugOfWarScene: asset('assets/mascot/tug-of-war-scene.png'),
} as const;
