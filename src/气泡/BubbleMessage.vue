<template>
  <!-- 气泡消息：头像 + 角色名 + 情绪标签 + 台词 -->
  <div
    class="dc-msg"
    :data-name="bubble.nameLower"
    :data-ci="colorIndex"
    :data-thought="bubble.isThought ? '1' : '0'"
    :data-mood-group="moodState?.id || ''"
    :style="msgStyle"
  >
    <!-- 头像区域 -->
    <div class="dc-msg-avatar" :data-name="bubble.nameLower" :style="avatarContainerStyle">
      <img v-if="avatarUrl" :src="avatarUrl" :alt="bubble.name" />
      <div v-else class="dc-msg-avatar-ph" :style="avatarPlaceholderStyle">{{ bubble.name.charAt(0) || '?' }}</div>
    </div>

    <!-- 消息头部：角色名 + 情绪标签 -->
    <div class="dc-msg-header">
      <span class="dc-msg-name" :data-ci="colorIndex" :style="nameStyle">
        <template v-for="(ch, i) in nameChars" :key="i">
          <span v-if="i === 0" class="dc-ch" :style="{ color: accentColor }">{{ ch }}</span>
          <span v-else-if="i === 2" class="dc-cs" :style="{ color: accentColor }">{{ ch }}</span>
          <span v-else class="dc-cn">{{ ch }}</span>
        </template>
      </span>
      <span v-if="bubble.mood" class="dc-msg-mood" :data-mood-mapped="moodState ? '1' : '0'" :style="moodStyle">{{
        bubble.mood
      }}</span>
    </div>

    <!-- 台词文本 -->
    <div class="dc-msg-text" :style="textStyle">
      <span :class="textContentClass">{{ displayText }}</span>
      <span :class="quoteClass" :style="quoteStyle">{{ quoteChar }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 气泡消息组件 — 渲染单条对话气泡
 *
 * 保留原 v7.1 的全部视觉效果：
 * - 角色名首字+第三字染色
 * - 情绪标签胶囊样式（颜色跟随情绪词组）
 * - 心里话斜体 + 尾符切换
 * - 头像占位符颜色圈
 */
import type { BubbleItem } from './useBubbleParser';
import type { StyleConfig, MoodColorGroup } from './constants';
import type { MoodRenderState } from './useStyleConfig';
import { hexToRgba, clampNumber, buildFontStack, getDialogueLineHeight, getAvatarShapeRadius } from './useStyleConfig';

const props = defineProps<{
  /** 气泡数据 */
  bubble: BubbleItem;
  /** 颜色索引（1-8） */
  colorIndex: number;
  /** 颜色代码 */
  accentColor: string;
  /** 样式配置 */
  config: StyleConfig;
  /** 情绪渲染状态 */
  moodState: MoodRenderState | null;
  /** 头像 URL */
  avatarUrl: string | null;
  /** 角色自定义颜色（来自 IndexedDB） */
  customColor: string | null;
}>();

// ===== 角色名字符拆分 =====
const nameChars = computed(() => [...props.bubble.name]);

// ===== 台词显示文本 =====
const displayText = computed(() => {
  if (props.bubble.isThought) {
    // 心里话去掉首尾的 *
    return props.bubble.text.replace(/^\*|\*$/g, '');
  }
  return props.bubble.text;
});

// ===== 引号相关 =====
const quoteChar = computed(() => (props.bubble.isThought ? '\uFF0A' : '\u201D'));
const quoteClass = computed(() => {
  const base = `dc-msg-quote dc-c${props.colorIndex}`;
  return props.bubble.isThought ? `${base} dc-msg-quote-thought` : base;
});
const textContentClass = computed(() => {
  return props.bubble.isThought ? 'dc-msg-text-content dc-msg-text-content-thought' : 'dc-msg-text-content';
});

// ===== 计算样式 =====
const cfg = computed(() => props.config);

const avatarSize = computed(() => clampNumber(cfg.value.style_avatarSize, 36, 88));
const avatarShapeRadius = computed(() => getAvatarShapeRadius(cfg.value.style_avatarShape));
const dialogueLineHeight = computed(() =>
  getDialogueLineHeight(cfg.value.style_dialogueFontSize, cfg.value.style_dialogueSpacing),
);
const dialogueFontStack = computed(() =>
  buildFontStack(cfg.value.style_dialogueFontFamily, '"Source Han Serif SC",serif'),
);
const nameFontStack = computed(() => buildFontStack(cfg.value.style_nameFontFamily, '"Source Han Serif SC",serif'));

// 消息容器样式
const msgStyle = computed(() => ({
  paddingLeft: `${avatarSize.value + 24}px`,
  minHeight: `${Math.max(56, avatarSize.value + 4)}px`,
}));

// 头像容器样式
const avatarContainerStyle = computed(() => ({
  width: `${avatarSize.value}px`,
  height: `${avatarSize.value}px`,
  borderRadius: avatarShapeRadius.value,
}));

// 头像占位符样式
const avatarPlaceholderStyle = computed(() => ({
  fontSize: `${Math.max(16, Math.round(avatarSize.value * 0.38))}px`,
  borderRadius: avatarShapeRadius.value,
  background: props.customColor || props.accentColor,
}));

// 角色名样式
const nameStyle = computed(() => ({
  color: cfg.value.style_globalTextColor,
  fontWeight: String(cfg.value.style_nameFontWeight),
  fontFamily: nameFontStack.value,
}));

// 情绪标签样式
const moodStyle = computed(() => {
  const ms = props.moodState;
  if (ms) {
    return { color: ms.color, background: ms.background };
  }
  // 未映射的情绪词使用角色颜色
  const c = props.customColor || props.accentColor;
  return { color: c, background: hexToRgba(c, 0.15) };
});

// 台词文本样式
const textStyle = computed(() => {
  const textColor =
    cfg.value.style_textColorMode === 'character'
      ? props.customColor || cfg.value.style_globalTextColor
      : cfg.value.style_globalTextColor;
  return {
    fontSize: `${cfg.value.style_dialogueFontSize}px`,
    lineHeight: `${dialogueLineHeight.value}px`,
    color: textColor,
    fontWeight: String(cfg.value.style_dialogueFontWeight),
    fontFamily: dialogueFontStack.value,
  };
});

// 引号样式（心里话的间距和偏移）
const quoteStyle = computed(() => {
  if (!props.bubble.isThought) return {};
  return {
    marginLeft: `${clampNumber(cfg.value.style_thoughtSuffixGap, 0, 24)}px`,
    top: `${clampNumber(cfg.value.style_thoughtSuffixOffsetY, -24, 24)}px`,
  };
});
</script>
