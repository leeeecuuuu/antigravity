/**
 * 头像加载 composable — 从 IndexedDB 读取头像 Blob
 *
 * 与原 v7.1 管理面板脚本共享同一份 IndexedDB，
 * 支持情绪差分头像、全局头像回退、在线清单回退。
 *
 * 加载优先级：
 * 1. IndexedDB 本地 Blob（用户手动上传）
 * 2. 在线清单中的情绪差分头像
 * 3. 在线清单中的默认头像
 * 4. 占位符首字（终极回退）
 */
import { DB_NAME, DB_VERSION, STORE_AVATARS, STORE_MOOD_AVATARS, GLOBAL_CHAR_ID, CHAR_ID_SEPARATOR } from './constants';
import { getOnlineAvatarUrl, getOnlineMoodAvatarUrl, getOnlineNarrationAvatars } from './useOnlineAvatars';

// ===== 类型定义 =====

/** 头像记录 */
interface AvatarRecord {
  alias: string;
  imageBlob: Blob | null;
  sourceUrl?: string;
  mimeType?: string;
}

// ===== Blob URL 缓存 =====
/** 全局 Blob URL 缓存，避免重复创建 */
const blobUrlCache = new Map<string, string>();

/** 释放所有缓存的 Blob URL */
export function revokeAllBlobUrls(): void {
  for (const url of blobUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrlCache.clear();
}

// ===== IndexedDB 头像读取 =====

/** 打开数据库 */
function openAvatarDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = e => reject(new Error(`IndexedDB 打开失败: ${(e.target as IDBOpenDBRequest).error}`));
    request.onupgradeneeded = () => {
      // 不主动创建 store，依赖管理面板脚本
    };
  });
}

/** 从 avatars store 读取头像记录 */
async function getAvatarRecord(db: IDBDatabase, key: string): Promise<AvatarRecord | null> {
  if (!db.objectStoreNames.contains(STORE_AVATARS)) return null;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_AVATARS, 'readonly');
    const req = tx.objectStore(STORE_AVATARS).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/** 从 mood_avatars store 读取情绪差分头像记录 */
async function getMoodAvatarRecord(db: IDBDatabase, key: string): Promise<AvatarRecord | null> {
  if (!db.objectStoreNames.contains(STORE_MOOD_AVATARS)) return null;
  return new Promise(resolve => {
    const tx = db.transaction(STORE_MOOD_AVATARS, 'readonly');
    const req = tx.objectStore(STORE_MOOD_AVATARS).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/** 将头像记录转为 Blob URL */
function recordToBlobUrl(record: AvatarRecord | null, cacheKey: string): string | null {
  if (!record) return null;

  // 检查缓存
  if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey)!;

  // 有 Blob 数据，直接创建 URL
  if (record.imageBlob) {
    const url = URL.createObjectURL(record.imageBlob);
    blobUrlCache.set(cacheKey, url);
    return url;
  }

  // 有远程 URL，直接返回（利用浏览器缓存，不转 Blob）
  if (record.sourceUrl && record.sourceUrl !== 'null' && record.sourceUrl.startsWith('http')) {
    return record.sourceUrl;
  }

  return null;
}

// ===== 公开 API =====

/**
 * 加载角色头像 URL
 *
 * 查找顺序（IndexedDB 优先 → 在线清单回退）：
 * 1. IndexedDB 情绪差分头像（当前角色卡）
 * 2. IndexedDB 默认头像（当前角色卡）
 * 3. IndexedDB 情绪差分头像（全局）
 * 4. IndexedDB 默认头像（全局）
 * 5. 在线清单情绪差分头像
 * 6. 在线清单默认头像
 * 7. null → 使用占位符首字
 *
 * @param charId 当前角色卡 ID
 * @param nameLower 角色名（小写）
 * @param moodGroupId 情绪组 ID（可选）
 * @returns 头像 URL 或 null
 */
export async function loadAvatarUrl(charId: string, nameLower: string, moodGroupId?: string): Promise<string | null> {
  try {
    const db = await openAvatarDB();
    const safeCharId = charId || GLOBAL_CHAR_ID;

    // 1. 当前角色卡的情绪差分头像
    if (moodGroupId) {
      const moodKey = `${safeCharId}__${nameLower}__${moodGroupId}`;
      const moodRecord = await getMoodAvatarRecord(db, moodKey);
      const moodUrl = recordToBlobUrl(moodRecord, `mood_${moodKey}`);
      if (moodUrl) {
        db.close();
        return moodUrl;
      }
    }

    // 2. 当前角色卡的默认头像
    const avatarKey = `${safeCharId}__${nameLower}`;
    const avatarRecord = await getAvatarRecord(db, avatarKey);
    const avatarUrl = recordToBlobUrl(avatarRecord, avatarKey);
    if (avatarUrl) {
      db.close();
      return avatarUrl;
    }

    // 3. 全局情绪差分头像
    if (moodGroupId && safeCharId !== GLOBAL_CHAR_ID) {
      const globalMoodKey = `${GLOBAL_CHAR_ID}__${nameLower}__${moodGroupId}`;
      const globalMoodRecord = await getMoodAvatarRecord(db, globalMoodKey);
      const globalMoodUrl = recordToBlobUrl(globalMoodRecord, `mood_${globalMoodKey}`);
      if (globalMoodUrl) {
        db.close();
        return globalMoodUrl;
      }
    }

    // 4. 全局默认头像
    if (safeCharId !== GLOBAL_CHAR_ID) {
      const globalKey = `${GLOBAL_CHAR_ID}__${nameLower}`;
      const globalRecord = await getAvatarRecord(db, globalKey);
      const globalUrl = recordToBlobUrl(globalRecord, globalKey);
      if (globalUrl) {
        db.close();
        return globalUrl;
      }
    }

    db.close();

    // === IndexedDB 中无本地头像，尝试在线清单 ===

    // 5. 在线清单情绪差分头像
    if (moodGroupId) {
      const onlineMoodUrl = getOnlineMoodAvatarUrl(nameLower, moodGroupId);
      if (onlineMoodUrl) return onlineMoodUrl;
    }

    // 6. 在线清单默认头像
    const onlineUrl = getOnlineAvatarUrl(nameLower);
    if (onlineUrl) return onlineUrl;

    return null;
  } catch (err) {
    console.warn('[气泡流式] 头像加载失败:', err);
    return null;
  }
}

/**
 * 加载旁白头像 URL 数组（用于多头像随机抽取）
 *
 * 查找顺序：
 * 1. IndexedDB 中所有匹配 *__旁白 的头像记录
 * 2. 在线清单中旁白的 URL 数组
 *
 * @param charId 当前角色卡 ID
 * @returns 头像 URL 数组
 */
export async function loadNarrationAvatars(charId: string): Promise<string[]> {
  const urls: string[] = [];
  const safeCharId = charId || GLOBAL_CHAR_ID;
  const narrationSuffixes = [
    `${CHAR_ID_SEPARATOR}旁白`,
    `${CHAR_ID_SEPARATOR}narration`,
    `${CHAR_ID_SEPARATOR}Narration`,
  ];
  const isNarrationKey = (key: string): boolean => narrationSuffixes.some(suffix => key.endsWith(suffix));
  const isCurrentCharKey = (key: string): boolean => key.startsWith(`${safeCharId}${CHAR_ID_SEPARATOR}`);
  const isGlobalKey = (key: string): boolean => key.startsWith(`${GLOBAL_CHAR_ID}${CHAR_ID_SEPARATOR}`);

  try {
    const db = await openAvatarDB();
    if (db.objectStoreNames.contains(STORE_AVATARS)) {
      // 扫描所有 key，收集匹配当前角色卡或全局的 "旁白" 头像。
      const groupedKeys = await new Promise<{ current: string[]; global: string[] }>(resolve => {
        const tx = db.transaction(STORE_AVATARS, 'readonly');
        const store = tx.objectStore(STORE_AVATARS);
        const current: string[] = [];
        const global: string[] = [];

        // 使用 openCursor 遍历所有记录
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = e => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const key = String(cursor.key);
            if (isNarrationKey(key)) {
              if (isCurrentCharKey(key)) current.push(key);
              else if (isGlobalKey(key)) global.push(key);
            }
            cursor.continue();
          } else {
            resolve({ current, global });
          }
        };
        cursorReq.onerror = () => resolve({ current, global });
      });

      // 当前角色卡优先；若当前角色卡没有旁白头像，则使用全局旁白头像。
      const keys = groupedKeys.current.length > 0 ? groupedKeys.current : groupedKeys.global;
      keys.sort();
      for (const key of keys) {
        const record = await getAvatarRecord(db, key);
        const url = recordToBlobUrl(record, key);
        if (url) urls.push(url);
      }
    }
    db.close();
  } catch (err) {
    console.warn('[气泡流式] 旁白头像扫描失败:', err);
  }

  // 如果 IndexedDB 中没有旁白头像，尝试在线清单
  if (urls.length === 0) {
    const onlineUrls = getOnlineNarrationAvatars();
    urls.push(...onlineUrls);
  }

  return urls;
}
