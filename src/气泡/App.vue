<template>
  <div class="dc-root" :style="rootStyle">
    <template v-for="(block, index) in parsedBlocks" :key="index">
      <!-- 对话气泡 -->
      <BubbleMessage
        v-if="block.type === 'bubble'"
        :bubble="block"
        :color-index="getColorIndex(block.nameLower)"
        :accent-color="getAccentColor(block.nameLower)"
        :config="styleConfig"
        :mood-state="getMoodState(block.mood)"
        :avatar-url="avatarUrls.get(block.nameLower) ?? null"
        :custom-color="customColors.get(block.nameLower) ?? null"
      />
      <!-- 旁白区块 -->
      <NarrationBlock
        v-else-if="block.type === 'narration'"
        :lines="block.lines"
        :config="styleConfig"
        :avatar-url="pickNarrationAvatar(block.lines)"
      />
      <!-- 原文区块 (如 <details> 摘要等 <now_plot> 外的内容) -->
      <div
        v-else-if="block.type === 'html'"
        class="dc-html-block"
        v-html="renderHtml(block.content)"
      ></div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 气泡流式渲染根组件
 *
 * 通过 injectStreamingMessageContext() 获取响应式 message 数据，
 * 实时解析 @bubble: 格式并渲染为气泡/旁白组件。
 *
 * 改进：
 * - 流式中也立即加载头像（不再延迟到流式结束）
 * - 新角色名出现时增量加载
 * - 支持旁白多头像随机抽取
 * - 支持在线头像清单回退
 */
import { injectStreamingMessageContext } from '@util/streaming';
import { parseBubbleMessage, type ParsedBlock, type BubbleItem } from './useBubbleParser';
import {
  loadStyleConfig,
  loadMoodColorMap,
  createColorAllocator,
  loadCharacterColor,
  getCurrentCharId,
  type MoodRenderState,
  type StyleConfig,
} from './useStyleConfig';
import { STYLE_DEFAULTS } from './constants';
import { loadAvatarUrl, loadNarrationAvatars, revokeAllBlobUrls } from './useAvatars';
import { loadOnlineManifest } from './useOnlineAvatars';
import BubbleMessage from './BubbleMessage.vue';
import NarrationBlock from './NarrationBlock.vue';

// ===== 流式消息上下文 =====
const context = injectStreamingMessageContext();

// ===== 原文块渲染 =====
function renderHtml(content: string): string {
  if (!content) return '';
  // 使用酒馆接口进行格式化，将得到包含原生 markdown/html 解析结果的内容
  // message_id 传入当前消息楼层号以适配一些特定宏
  const rawHtml = formatAsDisplayedMessage(content, { message_id: context.message_id });
  // 流式替换：为了应用正确的样式，将 mes_text 替换为 mes_streaming，与流式外层容器保持一致
  return rawHtml.replaceAll('mes_text', 'mes_streaming');
}

// ===== 样式配置（异步加载） =====
const styleConfig = ref<StyleConfig>({ ...STYLE_DEFAULTS });

// ===== 情绪词映射（异步加载） =====
const moodColorMap = ref<Map<string, MoodRenderState>>(new Map());

// ===== 颜色分配器 =====
const colorAllocator = createColorAllocator();

// ===== 头像 URL 缓存（角色名 → URL） =====
const avatarUrls = ref<Map<string, string | null>>(new Map());

// ===== 角色自定义颜色缓存 =====
const customColors = ref<Map<string, string | null>>(new Map());

// ===== 旁白头像 URL 数组（多图随机） =====
const narrationAvatarUrls = ref<string[]>([]);

// ===== 解析消息内容 =====
const parsedBlocks = computed<ParsedBlock[]>(() => {
  return parseBubbleMessage(context.message);
});

// ===== 根容器样式 =====
const rootStyle = computed(() => ({
  fontFamily: '"Noto Sans SC","Source Han Sans SC",sans-serif',
  fontSize: '1rem',
  lineHeight: '1.75',
  color: 'rgba(255,255,255,0.85)',
}));

// ===== 颜色相关方法 =====
function getColorIndex(nameLower: string): number {
  return colorAllocator.getColorIndex(nameLower);
}

function getAccentColor(nameLower: string): string {
  // 优先使用自定义颜色
  const custom = customColors.value.get(nameLower);
  if (custom) return custom;
  return colorAllocator.getColor(nameLower);
}

function getMoodState(mood: string): MoodRenderState | null {
  if (!mood) return null;
  return moodColorMap.value.get(mood.trim()) ?? null;
}

/**
 * 计算稳定字符串 hash，用于旁白头像抽取。
 * 同一条消息内相同内容的旁白会得到相同 hash，重渲染/流式更新时不会随机跳变。
 */
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 为旁白块按内容稳定选取头像 URL。
 */
function pickNarrationAvatar(lines: string[]): string | null {
  const urls = narrationAvatarUrls.value;
  if (urls.length === 0) return null;
  const seed = hashString(lines.join('\n').trim());
  return urls[seed % urls.length];
}

// ===== 收集所有唯一角色名 =====
const uniqueNames = computed<string[]>(() => {
  const names = new Set<string>();
  for (const block of parsedBlocks.value) {
    if (block.type === 'bubble') {
      names.add(block.nameLower);
    }
  }
  return [...names];
});

// ===== 已加载过头像的角色名集合（避免重复加载） =====
const loadedAvatarNames = new Set<string>();

// ===== 加载单个角色的头像和颜色 =====
async function loadSingleAvatar(charId: string, nameLower: string): Promise<void> {
  // 查找该角色的情绪组 ID（取最后一次出现的情绪）
  let moodGroupId: string | undefined;
  for (const block of parsedBlocks.value) {
    if (block.type === 'bubble' && block.nameLower === nameLower && block.mood) {
      const ms = moodColorMap.value.get(block.mood.trim());
      if (ms) moodGroupId = ms.id;
    }
  }

  // 加载头像
  const url = await loadAvatarUrl(charId, nameLower, moodGroupId);
  avatarUrls.value.set(nameLower, url);

  // 加载自定义颜色
  const color = await loadCharacterColor(charId, nameLower);
  customColors.value.set(nameLower, color);
}

// ===== 加载所有角色头像和颜色 =====
async function loadAllAvatarsAndColors(): Promise<void> {
  const charId = getCurrentCharId();
  const names = uniqueNames.value;

  await Promise.all(
    names.map(async nameLower => {
      await loadSingleAvatar(charId, nameLower);
      loadedAvatarNames.add(nameLower);
    }),
  );

  // 触发响应式更新
  avatarUrls.value = new Map(avatarUrls.value);
  customColors.value = new Map(customColors.value);
}

// ===== 增量加载新出现角色的头像 =====
async function loadNewAvatars(): Promise<void> {
  const charId = getCurrentCharId();
  const newNames = uniqueNames.value.filter(n => !loadedAvatarNames.has(n));
  if (newNames.length === 0) return;

  await Promise.all(
    newNames.map(async nameLower => {
      await loadSingleAvatar(charId, nameLower);
      loadedAvatarNames.add(nameLower);
    }),
  );

  // 触发响应式更新
  avatarUrls.value = new Map(avatarUrls.value);
  customColors.value = new Map(customColors.value);
}

// ===== 生命周期 =====

// 初始化：加载配置、在线清单、头像
onMounted(async () => {
  // 并行加载样式配置、情绪映射和在线清单
  const [config, moodMap] = await Promise.all([
    loadStyleConfig(),
    loadMoodColorMap(),
    loadOnlineManifest(), // 加载在线头像清单（内存缓存）
  ]);
  styleConfig.value = config;
  moodColorMap.value = moodMap;

  // 立即加载头像（不再等流式结束）
  await loadAllAvatarsAndColors();

  // 加载旁白多头像
  const charId = getCurrentCharId();
  narrationAvatarUrls.value = await loadNarrationAvatars(charId);
});

// 监听角色名变化 → 增量加载新角色头像
watch(uniqueNames, () => {
  loadNewAvatars();
});

// 监听流式结束 → 完整刷新头像（更新情绪差分头像）
watch(
  () => context.during_streaming,
  async streaming => {
    if (!streaming) {
      // 流式传输结束，完整刷新（情绪差分头像可能需要更新）
      loadedAvatarNames.clear();
      await loadAllAvatarsAndColors();

      // 刷新旁白头像
      const charId = getCurrentCharId();
      narrationAvatarUrls.value = await loadNarrationAvatars(charId);
    }
  },
);

// 组件卸载时清理 Blob URL
onUnmounted(() => {
  revokeAllBlobUrls();
});
</script>
