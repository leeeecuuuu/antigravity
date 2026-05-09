/**
 * 样式配置 composable — 从 IndexedDB 读取样式设置
 *
 * 与原 v7.1 管理面板脚本共享同一份 IndexedDB config store，
 * 确保用户在面板中调整的样式能即时反映在流式渲染中。
 */
import {
  DB_NAME,
  DB_VERSION,
  STORE_CONFIG,
  STYLE_DEFAULTS,
  DEFAULT_MOOD_COLOR_GROUPS,
  type StyleConfig,
  type MoodColorGroup,
  COLOR_PALETTE,
} from './constants';

// ===== IndexedDB 读取工具 =====

/** 打开 IndexedDB 数据库（只读，不创建） */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = e => reject(new Error(`IndexedDB 打开失败: ${(e.target as IDBOpenDBRequest).error}`));
    // 不处理 onupgradeneeded，数据库应该已经由管理面板脚本创建
    request.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
      }
    };
  });
}

/** 从 config store 读取单个配置值 */
async function getConfigValue(db: IDBDatabase, key: string): Promise<any> {
  if (!db.objectStoreNames.contains(STORE_CONFIG)) return null;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_CONFIG, 'readonly');
    const req = tx.objectStore(STORE_CONFIG).get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => resolve(null);
  });
}

// ===== 样式配置加载 =====

/** 从 IndexedDB 加载完整样式配置（合并默认值） */
export async function loadStyleConfig(): Promise<StyleConfig> {
  const cfg = { ...STYLE_DEFAULTS } as StyleConfig;

  try {
    const db = await openDB();
    const keys = Object.keys(STYLE_DEFAULTS) as (keyof StyleConfig)[];

    await Promise.all(
      keys.map(async key => {
        const val = await getConfigValue(db, key);
        if (val !== null && val !== undefined && val !== '') {
          // 数值类型键需要解析
          const defaultVal = STYLE_DEFAULTS[key];
          if (typeof defaultVal === 'number') {
            const parsed = parseFloat(val);
            if (Number.isFinite(parsed)) {
              (cfg as any)[key] = parsed;
            }
          } else {
            (cfg as any)[key] = val;
          }
        }
      }),
    );

    db.close();
  } catch (err) {
    console.warn('[气泡流式] 样式配置加载失败，使用默认值:', err);
  }

  return cfg;
}

// ===== 情绪词配色映射 =====

export interface MoodRenderState {
  color: string;
  background: string;
  id: string;
}

/** 构建情绪词 → 配色的快速查找映射表 */
function buildMoodColorMap(groups: MoodColorGroup[]): Map<string, MoodRenderState> {
  const map = new Map<string, MoodRenderState>();
  for (const group of groups) {
    const bg = hexToRgba(group.color, 0.15);
    for (const word of group.words) {
      map.set(word, { color: group.color, background: bg, id: group.id });
    }
  }
  return map;
}

/** 从 IndexedDB 加载情绪配置，回退到默认 */
export async function loadMoodColorMap(): Promise<Map<string, MoodRenderState>> {
  try {
    const db = await openDB();
    const raw = await getConfigValue(db, 'mood_config');
    db.close();

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.groups) && parsed.groups.length) {
        return buildMoodColorMap(parsed.groups);
      }
    }
  } catch {
    /* 读取失败，使用默认值 */
  }

  return buildMoodColorMap(DEFAULT_MOOD_COLOR_GROUPS);
}

// ===== 颜色分配器 =====

/**
 * 创建角色颜色分配器（1-8 循环分配，与原系统一致）
 * 同一角色名始终获得同一颜色索引
 */
export function createColorAllocator() {
  const colorMap = new Map<string, number>();
  let colorIndex = 0;

  return {
    /** 获取角色的颜色索引（1-8） */
    getColorIndex(nameLower: string): number {
      const existing = colorMap.get(nameLower);
      if (existing !== undefined) return existing;
      colorIndex = (colorIndex % 8) + 1;
      colorMap.set(nameLower, colorIndex);
      return colorIndex;
    },

    /** 获取颜色代码 */
    getColor(nameLower: string): string {
      const idx = this.getColorIndex(nameLower);
      return COLOR_PALETTE[idx - 1];
    },

    /** 重置分配器 */
    reset() {
      colorMap.clear();
      colorIndex = 0;
    },
  };
}

// ===== 工具函数 =====

/** HEX 颜色转 rgba 字符串 */
export function hexToRgba(hex: string, alpha: number): string {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) {
    return `rgba(255,255,255,${Math.min(1, Math.max(0, alpha))})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha))})`;
}

/** 限制数值范围 */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** 构建字体栈字符串 */
export function buildFontStack(family: string, fallback: string): string {
  const trimmed = (family || '').trim();
  return trimmed ? `"${trimmed.replace(/"/g, '\\"')}",${fallback}` : fallback;
}

/** 计算对话行高 */
export function getDialogueLineHeight(fontSize: number, spacing: number): number {
  const safeFontSize = Number.isFinite(fontSize) ? fontSize : 14.5;
  const safeSpacing = Number.isFinite(spacing) ? spacing : 10;
  const computed = Math.max(safeFontSize * 1.35, safeFontSize + safeSpacing);
  return Math.round(computed * 100) / 100;
}

/** 获取头像形状的 border-radius */
export function getAvatarShapeRadius(shape: string): string {
  if (shape === 'circle') return '50%';
  if (shape === 'square') return '0px';
  return '8px';
}

// ===== 角色自定义颜色读取 =====

/** 从 IndexedDB 读取角色自定义主题色 */
export async function loadCharacterColor(charId: string, nameLower: string): Promise<string | null> {
  try {
    const db = await openDB();
    const key = `color_${charId}__${nameLower}`;
    const val = await getConfigValue(db, key);
    db.close();
    return val || null;
  } catch {
    return null;
  }
}

/** 获取当前角色卡 ID */
export function getCurrentCharId(): string {
  try {
    const context = SillyTavern?.getContext?.();
    if (context?.characterId != null) return String(context.characterId);
  } catch {
    /* ignore */
  }
  return '';
}
