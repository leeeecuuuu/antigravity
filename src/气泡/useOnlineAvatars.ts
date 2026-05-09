/**
 * 在线头像清单模块 — 从远程 JSON 文件加载角色头像 URL
 *
 * 清单 JSON 格式示例：
 * {
 *   "avatars": {
 *     "角色名": "https://example.com/avatar.png",
 *     "旁白": ["url1.png", "url2.png"]  // 数组表示多图随机
 *   },
 *   "mood_avatars": {
 *     "角色名": {
 *       "mood-calm": "https://example.com/calm.png"
 *     }
 *   }
 * }
 *
 * 加载优先级：IndexedDB 本地 Blob > 在线清单 URL > 占位符
 */
import { DB_NAME, DB_VERSION, STORE_CONFIG, AVATAR_MANIFEST_URL_KEY, AVATAR_MANIFEST_DEFAULT_URL } from './constants';

// ===== 类型定义 =====

/** 在线清单数据结构 */
export interface OnlineManifest {
  /** 角色名 → 单个 URL 或 URL 数组 */
  avatars: Record<string, string | string[]>;
  /** 角色名 → { 情绪组ID: URL } */
  mood_avatars?: Record<string, Record<string, string>>;
}

// ===== 内存缓存 =====

/** 已加载的清单（内存缓存，避免重复请求） */
let cachedManifest: OnlineManifest | null = null;
/** 清单是否已尝试加载过 */
let manifestLoaded = false;

// ===== 核心函数 =====

/**
 * 从 IndexedDB config store 读取清单 URL
 */
async function getManifestUrl(): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = e => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_CONFIG)) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction(STORE_CONFIG, 'readonly');
        const req = tx.objectStore(STORE_CONFIG).get(AVATAR_MANIFEST_URL_KEY);
        req.onsuccess = () => {
          db.close();
          const raw = req.result;
          // 兼容两种 config store 写法：{ key, value } 与直接存储字符串。
          const val = typeof raw === 'string' ? raw : raw?.value;
          const url = typeof val === 'string' && val.trim() ? val.trim() : AVATAR_MANIFEST_DEFAULT_URL;
          resolve(url ? url : null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      };
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {};
    } catch {
      resolve(null);
    }
  });
}

/**
 * 加载在线头像清单
 *
 * 首次调用时从 IndexedDB 获取清单 URL 并 fetch JSON，
 * 后续调用直接返回内存缓存。
 *
 * @returns 清单数据，或 null（无配置/加载失败）
 */
export async function loadOnlineManifest(): Promise<OnlineManifest | null> {
  // 已加载过直接返回缓存
  if (manifestLoaded) return cachedManifest;
  manifestLoaded = true;

  try {
    const url = await getManifestUrl();
    if (!url) return null;

    console.info('[气泡流式] 正在加载在线头像清单:', url);
    const resp = await fetch(url, { cache: 'default' });
    if (!resp.ok) {
      console.warn('[气泡流式] 在线清单加载失败:', resp.status, resp.statusText);
      return null;
    }

    const data = await resp.json();

    // 基本校验
    if (!data || typeof data !== 'object' || !data.avatars) {
      console.warn('[气泡流式] 在线清单格式无效，需要包含 avatars 字段');
      return null;
    }

    cachedManifest = {
      avatars: data.avatars || {},
      mood_avatars: data.mood_avatars || {},
    };

    console.info('[气泡流式] 在线清单加载成功，包含', Object.keys(cachedManifest.avatars).length, '个角色头像');

    return cachedManifest;
  } catch (err) {
    console.warn('[气泡流式] 在线清单加载异常:', err);
    return null;
  }
}

/**
 * 从在线清单获取角色默认头像 URL
 *
 * @param nameLower 角色名（小写）
 * @returns 头像 URL 字符串，或 null
 */
export function getOnlineAvatarUrl(nameLower: string): string | null {
  if (!cachedManifest) return null;

  // 在清单中查找（尝试小写和原始名都匹配）
  const entry =
    cachedManifest.avatars[nameLower] ||
    Object.entries(cachedManifest.avatars).find(([k]) => k.toLowerCase() === nameLower)?.[1];

  if (!entry) return null;

  // 数组：默认取第一张。旁白多图随机由 getOnlineNarrationAvatars + App.vue 的内容 hash 负责，
  // 避免普通角色头像在重渲染时随机跳变。
  if (Array.isArray(entry)) {
    if (entry.length === 0) return null;
    return typeof entry[0] === 'string' ? entry[0] : null;
  }

  // 单个字符串
  return typeof entry === 'string' ? entry : null;
}

/**
 * 从在线清单获取角色情绪差分头像 URL
 *
 * @param nameLower 角色名（小写）
 * @param moodGroupId 情绪组 ID（如 'mood-calm'）
 * @returns 情绪头像 URL，或 null
 */
export function getOnlineMoodAvatarUrl(nameLower: string, moodGroupId: string): string | null {
  if (!cachedManifest?.mood_avatars) return null;

  const charMoods =
    cachedManifest.mood_avatars[nameLower] ||
    Object.entries(cachedManifest.mood_avatars).find(([k]) => k.toLowerCase() === nameLower)?.[1];

  if (!charMoods || typeof charMoods !== 'object') return null;

  const url = charMoods[moodGroupId];
  return typeof url === 'string' ? url : null;
}

/**
 * 从在线清单获取旁白头像 URL 数组
 *
 * @returns 旁白头像 URL 数组（可能为空）
 */
export function getOnlineNarrationAvatars(): string[] {
  if (!cachedManifest) return [];

  const entry =
    cachedManifest.avatars['旁白'] || cachedManifest.avatars['narration'] || cachedManifest.avatars['Narration'];

  if (!entry) return [];

  if (Array.isArray(entry)) return entry.filter(u => typeof u === 'string');
  if (typeof entry === 'string') return [entry];
  return [];
}

/**
 * 重置清单缓存（用于测试或清单 URL 变更时）
 */
export function resetManifestCache(): void {
  cachedManifest = null;
  manifestLoaded = false;
}
