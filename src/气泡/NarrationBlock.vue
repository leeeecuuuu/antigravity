<template>
  <!-- 旁白区块：以旁白角色气泡形式渲染 -->
  <div
    class="dc-msg dc-msg-narration"
    data-name="旁白"
    data-ci="0"
    data-thought="0"
    data-mood-group=""
    :style="msgStyle"
  >
    <!-- 头像区域：支持图片或占位符 -->
    <div class="dc-msg-avatar" data-name="旁白" :style="avatarContainerStyle">
      <img v-if="avatarUrl" :src="avatarUrl" alt="旁白" />
      <div v-else class="dc-msg-avatar-ph" :style="avatarPlaceholderStyle">旁</div>
    </div>

    <!-- 旁白角色名 -->
    <div class="dc-msg-header">
      <span class="dc-msg-name" :style="nameStyle">
        <span class="dc-cn">旁</span>
        <span class="dc-cn">白</span>
      </span>
    </div>

    <!-- 旁白正文（支持 Markdown 基础模式） -->
    <div class="dc-msg-text" :style="textStyle" v-html="renderedContent"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * 旁白区块组件 — 渲染旁白文本
 *
 * 使用与对话气泡相同的消息结构（头像+名字+正文），
 * 支持图片头像或 "旁" 字灰色占位符。
 * 支持 Markdown 基础格式（粗体、斜体、删除线、行内代码）。
 */
import type { StyleConfig } from './constants';
import { clampNumber, buildFontStack, getAvatarShapeRadius } from './useStyleConfig';

const props = defineProps<{
  /** 旁白原始行数组 */
  lines: string[];
  /** 样式配置 */
  config: StyleConfig;
  /** 旁白头像 URL（可选，null 则显示占位符） */
  avatarUrl?: string | null;
}>();

// ===== 计算样式 =====
const cfg = computed(() => props.config);

const avatarSize = computed(() => clampNumber(cfg.value.style_avatarSize, 36, 88));
const avatarShapeRadius = computed(() => getAvatarShapeRadius(cfg.value.style_avatarShape));
const narrationFontStack = computed(() =>
  buildFontStack(cfg.value.style_narrationFontFamily, '"Source Han Sans SC",sans-serif'),
);

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
  background: 'rgba(255,255,255,0.12)',
}));

// 旁白角色名样式
const nameStyle = computed(() => ({
  color: cfg.value.style_globalTextColor,
  fontWeight: String(cfg.value.style_nameFontWeight),
  fontFamily: narrationFontStack.value,
}));

// 旁白正文样式
const textStyle = computed(() => ({
  fontSize: `${cfg.value.style_narrationFontSize}px`,
  color: cfg.value.style_globalTextColor,
  fontWeight: String(cfg.value.style_narrationFontWeight),
  fontFamily: narrationFontStack.value,
  lineHeight: String(clampNumber(cfg.value.style_narrationLineHeight, 1.2, 3.0)),
}));

// ===== Markdown 渲染 =====

/** HTML 转义 */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 基础 Markdown 渲染（粗体、斜体、删除线、行内代码）
 * 与原 v7.1 的 mdBasic 保持一致
 */
function mdBasic(text: string): string {
  let result = esc(text);
  // 粗体
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 斜体
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 删除线
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // 行内代码
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  return result;
}

/** 按空行切分自然段，保留段内单换行 */
function splitParagraphs(lines: string[]): string[][] {
  const paragraphs: string[][] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.some(line => line.trim().length > 0)) {
      paragraphs.push(current);
    }
    current = [];
  };

  for (const line of lines) {
    if (line.trim().length === 0) {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();

  return paragraphs;
}

/** 渲染一个自然段；段内单换行用 <br> 保留，空行则交给 splitParagraphs 分段 */
function renderParagraph(lines: string[]): string {
  return lines.map(line => mdBasic(line.trim())).join('<br>');
}

/** 渲染旁白内容为 HTML */
const renderedContent = computed(() => {
  const textIndent = clampNumber(cfg.value.style_narrationTextIndent, 0, 4);

  if (cfg.value.style_markdownMode === 'full') {
    // 完整模式：使用更复杂的 Markdown 解析
    return renderFullMarkdown(props.lines, textIndent);
  }

  // 基础模式：空行切分自然段，段内单换行保留为 <br>
  return splitParagraphs(props.lines)
    .map(paragraph => `<p style="margin:0.5em 0;text-indent:${textIndent}em">${renderParagraph(paragraph)}</p>`)
    .join('');
});

/**
 * 完整 Markdown 渲染
 * 支持标题、引用、列表、分割线、代码块等
 */
function renderFullMarkdown(lines: string[], textIndent: number): string {
  let html = '';
  let inCode = false;
  const codeBuf: string[] = [];
  let paragraphBuf: string[] = [];
  const codeFenceRe = /^`{3}/;

  const flushParagraph = () => {
    if (paragraphBuf.some(line => line.trim().length > 0)) {
      html += `<p style="margin:0.5em 0;text-indent:${textIndent}em">${renderParagraph(paragraphBuf)}</p>`;
    }
    paragraphBuf = [];
  };

  const flushCodeBlock = () => {
    html += `<pre style="background:rgba(255,255,255,0.06);padding:10px 14px;border-radius:6px;overflow-x:auto;margin:0.5em 0"><code>${codeBuf.join('\n')}</code></pre>`;
    codeBuf.length = 0;
  };

  for (const line of lines) {
    // 代码块处理
    if (codeFenceRe.test(line.trim())) {
      if (inCode) {
        flushCodeBlock();
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(esc(line));
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // 标题
    const hm = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      flushParagraph();
      const lvl = hm[1].length;
      html += `<h${lvl} style="margin:0.6em 0 0.3em;font-weight:700;color:rgba(255,255,255,0.9)">${mdBasic(hm[2])}</h${lvl}>`;
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      html += '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:0.8em 0"/>';
      continue;
    }

    // 引用
    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      html += `<blockquote style="border-left:3px solid rgba(255,255,255,0.2);padding-left:12px;margin:0.5em 0;color:rgba(255,255,255,0.6)">${mdBasic(trimmed.replace(/^>\s?/, ''))}</blockquote>`;
      continue;
    }

    // 普通段落
    paragraphBuf.push(line);
  }

  flushParagraph();

  // 未闭合的代码块
  if (inCode) {
    flushCodeBlock();
  }

  return html;
}
</script>
