const base = import.meta.env.BASE_URL || '/';
const asset = (relPath: string) => `${base}${relPath.replace(/^\/+/, '')}`;

export interface PlayerCharacter {
  id: string;
  name: string;
  image: string;
  row: number;
  col: number;
  /** Tọa độ thực tế (px) đã đo trên sprite sheet 1024x969 */
  cropRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PlayerProfile {
  playerName: string;
  characterId: string;
  characterImage: string;
  characterName: string;
}

export const CHARACTERS_SPRITE_SHEET = asset('assets/characters/characters-sprite.png');

export const PLAYER_PROFILE_STORAGE_KEY = 'manabie_tug_player_profile_2026';

// Tọa độ cột và hàng thực tế đã phân tích trên ảnh sprite sheet tách nền 513x486
const COL_RANGES: Array<[number, number]> = [
  [10, 90],
  [99, 168],
  [179, 254],
  [260, 331],
  [343, 417],
  [429, 500],
];

const ROW_RANGES: Array<[number, number]> = [
  [26, 104],
  [112, 185],
  [191, 265],
  [271, 338],
  [347, 412],
  [418, 477],
];

const CHARACTER_NAMES: string[] = [
  // Hàng 1
  'Mana thông thái',
  'Robot Nano Xanh',
  'Thỏ Trắng Tinh Anh',
  'Cáo Cam Phi Hành',
  'Gấu Trúc Tre Xanh',
  'Cánh Cụt Mũ Len',
  // Hàng 2
  'Mèo Tím Vũ Trụ',
  'Gà Vàng Năng Động',
  'Quái Nhỏ Một Mắt',
  'Khủng Long Xanh Ngọc',
  'Mèo Trắng Đọc Sách',
  'Bạn Nhỏ Sao Hỏa',
  // Hàng 3
  'Bạn Nhỏ Sao Mộc',
  'Cừu Bông Học Bá',
  'Hổ Ngầu Kính Râm',
  'Thỏ Hồng Nơ Xinh',
  'Gấu Koala Xanh',
  'Robot Trắng Tương Lai',
  // Hàng 4
  'Tuần Lộc Khăn Xanh',
  'Cánh Cụt Kính Bơi',
  'Rồng Tím Đáng Yêu',
  'Ếch Xanh Vui Nhộn',
  'Bé Sao Băng Xanh',
  'Cáo Đỏ Thám Hiểm',
  // Hàng 5
  'Kỳ Lân Cầu Vồng',
  'Cú Nâu Thông Thái',
  'Sứa Biển Phát Sáng',
  'Cún Vàng Đáng Yêu',
  'Nấm Đỏ Tinh Nghịch',
  'Robot Mèo Cyber',
  // Hàng 6
  'Cá Voi Đại Dương',
  'Mầm Xanh Hiếu Học',
  'Cua Đỏ Vui Vẻ',
  'Cú Xanh Đọc Sách',
  'Hà Mã Thân Thiện',
  'Ngôi Sao Lấp Lánh',
];

export const PLAYER_CHARACTERS: PlayerCharacter[] = CHARACTER_NAMES.map((name, index) => {
  const row = Math.floor(index / 6);
  const col = index % 6;
  const [x1, x2] = COL_RANGES[col];
  const [y1, y2] = ROW_RANGES[row];
  const idNum = String(index + 1).padStart(2, '0');

  return {
    id: `character-${idNum}`,
    name,
    image: asset(`assets/characters/character-${idNum}.png`),
    row,
    col,
    cropRect: {
      x: x1,
      y: y1,
      width: x2 - x1 + 1,
      height: y2 - y1 + 1,
    },
  };
});

export function getCharacterById(characterId?: string | null): PlayerCharacter {
  if (!characterId) return PLAYER_CHARACTERS[0];
  return PLAYER_CHARACTERS.find((c) => c.id === characterId) || PLAYER_CHARACTERS[0];
}

export function loadSavedPlayerProfile(): PlayerProfile | null {
  try {
    const raw = sessionStorage.getItem(PLAYER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    if (
      parsed &&
      typeof parsed.playerName === 'string' &&
      parsed.playerName.trim().length > 0 &&
      typeof parsed.characterId === 'string'
    ) {
      const char = getCharacterById(parsed.characterId);
      return {
        playerName: parsed.playerName.trim().slice(0, 20),
        characterId: char.id,
        characterImage: char.image,
        characterName: char.name,
      };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function savePlayerProfile(profile: PlayerProfile): void {
  try {
    sessionStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage errors
  }
}
