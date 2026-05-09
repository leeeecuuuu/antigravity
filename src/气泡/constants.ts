/**
 * 对话气泡流式渲染 — 共享常量
 * 与原有 v7.1 脚本保持一致的 IndexedDB 存储键名、颜色系统、默认配置等
 */

// ===== IndexedDB 存储层常量 =====
/** IndexedDB 数据库名称 */
export const DB_NAME = 'BubbleDialogueAvatars';
/** IndexedDB 数据库版本 */
export const DB_VERSION = 4;
/** 头像 ObjectStore 名称 */
export const STORE_AVATARS = 'avatars';
/** 配置 ObjectStore 名称 */
export const STORE_CONFIG = 'config';
/** 情绪差分头像 ObjectStore 名称 */
export const STORE_MOOD_AVATARS = 'mood_avatars';
/** 角色 ID 分隔符 */
export const CHAR_ID_SEPARATOR = '__';
/** 全局角色 ID（跨卡共享） */
export const GLOBAL_CHAR_ID = '_global_';
/** IndexedDB config store 中在线清单 URL 的键名 */
export const AVATAR_MANIFEST_URL_KEY = 'avatar_online_manifest_url';
/** 在线清单 URL 的默认值（空字符串表示不启用在线头像模式） */
export const AVATAR_MANIFEST_DEFAULT_URL = '';

// ===== 8色系统 =====
/** 颜色代码表（1-8 循环分配） */
export const COLOR_PALETTE = [
  '#f47b67', // c1
  '#45ddc0', // c2
  '#e78bff', // c3
  '#f0b232', // c4
  '#58a6ff', // c5
  '#ff9a76', // c6
  '#7ee787', // c7
  '#d2a8ff', // c8
] as const;

// ===== 默认情绪词配色映射 =====
export interface MoodColorGroup {
  id: string;
  color: string;
  words: string[];
}

/** 默认情绪词配色分组 */
export const DEFAULT_MOOD_COLOR_GROUPS: MoodColorGroup[] = [
  {
    id: 'mood-joy',
    color: '#f59e0b',
    words: [
      '开心',
      '欢喜',
      '欣喜',
      '愉悦',
      '满足',
      '幸福',
      '甜蜜',
      '狂喜',
      '兴奋',
      '雀跃',
      '畅快',
      '陶醉',
      '得意',
      '骄傲',
      '自豪',
      '自信',
    ],
  },
  {
    id: 'mood-anger',
    color: '#ef4444',
    words: ['愤怒', '暴怒', '气愤', '愤慨', '暴躁', '怨恨', '敌意', '恼火', '窝火', '生气', '烦躁', '烦闷'],
  },
  {
    id: 'mood-sad',
    color: '#3b82f6',
    words: [
      '难过',
      '伤心',
      '心酸',
      '忧伤',
      '惆怅',
      '失落',
      '低落',
      '沮丧',
      '悲伤',
      '心痛',
      '悲痛',
      '痛苦',
      '委屈',
      '不甘',
      '失望',
      '受伤',
      '孤独',
      '寂寞',
      '落寞',
    ],
  },
  {
    id: 'mood-anxious',
    color: '#eab308',
    words: [
      '焦虑',
      '紧张',
      '不安',
      '忐忑',
      '担忧',
      '慌张',
      '焦躁',
      '害怕',
      '恐惧',
      '惊恐',
      '畏惧',
      '胆怯',
      '心慌',
      '警惕',
      '戒备',
    ],
  },
  {
    id: 'mood-calm',
    color: '#22c55e',
    words: [
      '平静',
      '淡然',
      '冷静',
      '沉稳',
      '从容',
      '坦然',
      '淡定',
      '温馨',
      '舒畅',
      '惬意',
      '温暖',
      '欣慰',
      '释然',
      '感动',
      '感恩',
    ],
  },
  {
    id: 'mood-shy',
    color: '#06b6d4',
    words: ['害羞', '尴尬', '窘迫', '难堪', '困惑', '迷茫', '疑惑', '纠结', '犹豫', '无奈', '无语'],
  },
  {
    id: 'mood-disgust',
    color: '#8b5cf6',
    words: ['厌恶', '嫌弃', '鄙视', '反感', '排斥', '抗拒', '不屑', '冷淡', '冷漠', '疏离', '麻木'],
  },
  { id: 'mood-love', color: '#ec4899', words: ['喜欢', '爱慕', '迷恋', '倾慕', '宠溺', '依恋', '心动', '认真'] },
];

// ===== 默认样式配置 =====
export const STYLE_DEFAULTS = {
  style_dialogueFontSize: 14.5,
  style_narrationFontSize: 14,
  style_dialogueSpacing: 10,
  style_textColorMode: 'global' as 'global' | 'character',
  style_globalTextColor: '#d9d9d9',
  style_markdownMode: 'basic' as 'basic' | 'full',
  style_dialogueFontWeight: 400,
  style_narrationFontWeight: 400,
  style_nameFontWeight: 800,
  style_narrationBgColor: '#ffffff',
  style_narrationBgOpacity: 0.04,
  style_avatarSize: 52,
  style_narrationIndent: 76,
  style_narrationFontFamily: 'Noto Sans SC',
  style_dialogueFontFamily: 'Noto Serif SC',
  style_nameFontFamily: 'Noto Serif SC',
  style_fontConfigUrl: '',
  style_narrationBorderRadius: 0,
  style_avatarShape: 'rounded' as 'rounded' | 'circle' | 'square',
  style_thoughtSuffixGap: 6,
  style_thoughtSuffixOffsetY: 5,
  style_narrationTextIndent: 0,
  style_narrationLineHeight: 1.75,
  style_narrationPaddingRight: 16,
} as const;

export type StyleConfig = {
  -readonly [K in keyof typeof STYLE_DEFAULTS]: (typeof STYLE_DEFAULTS)[K];
};
