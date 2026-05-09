/**
 * 气泡解析器 — 将原始消息文本解析为结构化的气泡/旁白数据
 *
 * 核心逻辑从 regex-对话渲染v7_1 的 processText 函数提取而来，
 * 改为纯函数实现，可被 Vue 的 computed 实时调用。
 */

// ===== 解析结果类型定义 =====

/** 对话气泡数据 */
export interface BubbleItem {
  type: 'bubble';
  /** 角色全名（原始大小写） */
  name: string;
  /** 角色名小写（用于匹配头像等） */
  nameLower: string;
  /** 情绪标签文本 */
  mood: string;
  /** 台词原文（不含方括号） */
  text: string;
  /** 是否为心里话（*...*） */
  isThought: boolean;
  /** 台词是否由方括号包裹（用于判断心里话） */
  hasBracket: boolean;
}

/** 旁白区块数据 */
export interface NarrationItem {
  type: 'narration';
  /** 旁白原始行数组 */
  lines: string[];
}

/** 原文区块数据（<now_plot> 标签外的内容，保留酒馆原生渲染） */
export interface HtmlBlock {
  type: 'html';
  /** 原始文本内容 */
  content: string;
}

/** 解析结果联合类型 */
export type ParsedBlock = BubbleItem | NarrationItem | HtmlBlock;

// ===== 内部辅助函数 =====

/**
 * 剥离 <now_plot> / <content> 等标签，规范化换行，
 * 并拆分出 <now_plot> 外部的原文块（如有）
 */
function extractPlotParts(raw: string): { preText: string; plotText: string; postText: string } {
  let text = raw.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');

  let preText = '';
  let plotText = text;
  let postText = '';

  const nowPlotMatch = text.match(/<now_plot\b[^>]*>([\s\S]*?)<\/now_plot>/i);
  if (nowPlotMatch) {
    const matchStart = nowPlotMatch.index!;
    const matchEnd = matchStart + nowPlotMatch[0].length;

    preText = text.substring(0, matchStart).trim();
    plotText = nowPlotMatch[1];
    postText = text.substring(matchEnd).trim();
  }

  // 剥离 plotText 中的 <content> 标签（保留内部文本）
  plotText = plotText.replace(/<\/?content\b[^>]*>/gi, '');

  return { preText, plotText, postText };
}

/**
 * 确保每个 @bubble: 标记独占一行
 * 对应原 extractSourceText 的换行修正
 */
function ensureBubbleNewlines(text: string): string {
  // 处理多行括号内的换行符（防止被割裂）
  text = text.replace(
    /(@bubble:[^|]+\|[^|]*\|)\[((?:(?!@bubble:)[\s\S])*?)\]/g,
    (_match, prefix: string, content: string) => {
      return prefix + '[' + content.replace(/\n/g, '@@DC_BR@@') + ']';
    },
  );

  // 确保 @bubble: 前有换行
  return text.replace(/([^\n])\s*(@bubble:)/g, (_match, prefix: string, marker: string) => {
    return prefix + '\n' + marker;
  });
}

/**
 * 判断文本是否为心里话格式（*...*）
 */
function isInnerThought(text: string): boolean {
  return /^\*.+\*$/.test(text.trim());
}

// ===== 气泡行匹配正则 =====

/** 第1优先级：三段含 [] — @bubble:角色名|情绪|[台词] */
const RE_TRIPLE_BRACKET = /^@bubble:([^|]+)\|([^|]*)\|\[(.+?)\]$/;
/** 第2优先级：三段无 [] — @bubble:角色名|情绪|台词 */
const RE_TRIPLE_PLAIN = /^@bubble:([^|]+)\|([^|]*)\|([^|]+)$/;
/** 第3优先级：旧四段兼容（含 []）— @bubble:别名|角色名|情绪|[台词] */
const RE_QUAD_BRACKET = /^@bubble:([^|]+)\|([^|]+)\|([^|]*)\|\[(.+?)\]$/;
/** 第4优先级：旧四段兼容（无 []）— @bubble:别名|角色名|情绪|台词 */
const RE_QUAD_PLAIN = /^@bubble:([^|]+)\|([^|]+)\|([^|]*)\|(.+)$/;

/**
 * 尝试从一行文本中匹配 @bubble: 格式
 * @returns 匹配结果，或 null 表示非气泡行
 */
function matchBubbleLine(line: string): BubbleItem | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('@bubble:')) return null;

  let m: RegExpMatchArray | null;
  let charName: string;
  let mood: string;
  let tx: string;
  let hasBracket = false;

  // 第1优先级：三段含 []
  m = trimmed.match(RE_TRIPLE_BRACKET);
  if (m) {
    charName = m[1].trim();
    mood = m[2].trim();
    tx = m[3].trim();
    hasBracket = true;
  }

  // 第2优先级：三段无 []
  if (!m) {
    m = trimmed.match(RE_TRIPLE_PLAIN);
    if (m) {
      charName = m[1].trim();
      mood = m[2].trim();
      tx = m[3].trim();
    }
  }

  // 第3优先级：旧四段含 []
  if (!m) {
    m = trimmed.match(RE_QUAD_BRACKET);
    if (m) {
      charName = m[2].trim();
      mood = m[3].trim();
      tx = m[4].trim();
      hasBracket = true;
    }
  }

  // 第4优先级：旧四段无 []
  if (!m) {
    m = trimmed.match(RE_QUAD_PLAIN);
    if (m) {
      charName = m[2].trim();
      mood = m[3].trim();
      tx = m[4].trim();
    }
  }

  if (!m) return null;

  // 还原多行括号中的换行标记
  tx = tx!.replace(/@@DC_BR@@/g, '\n');

  const thought = hasBracket && isInnerThought(tx!);

  return {
    type: 'bubble',
    name: charName!,
    nameLower: charName!.toLowerCase(),
    mood: mood!,
    text: tx!,
    isThought: thought,
    hasBracket,
  };
}

// ===== 核心解析函数 =====

/**
 * 将原始消息文本解析为结构化的气泡/旁白数据数组
 *
 * @param rawMessage 原始消息内容（可能包含 <now_plot> 标签、HTML 等）
 * @returns 解析后的 ParsedBlock 数组
 */
export function parseBubbleMessage(rawMessage: string): ParsedBlock[] {
  if (!rawMessage || !rawMessage.trim()) return [];

  // 步骤1: 拆分出 <now_plot> 外部的原文块与内部剧情文本
  const { preText, plotText, postText } = extractPlotParts(rawMessage);

  const blocks: ParsedBlock[] = [];

  // 前置原文块
  if (preText) {
    blocks.push({ type: 'html', content: preText });
  }

  // 步骤2: 确保剧情文本中 @bubble: 标记独占一行
  const prepared = ensureBubbleNewlines(plotText);

  // 步骤3: 按行解析剧情部分
  const lines = prepared.split('\n');
  let narrationBuffer: string[] = [];

  /** 将缓冲的旁白行刷新为 NarrationItem */
  const flushNarration = () => {
    // 检查是否有实际内容（不全是空行）
    const hasContent = narrationBuffer.some(l => l.trim().length > 0);
    if (hasContent) {
      blocks.push({ type: 'narration', lines: [...narrationBuffer] });
    }
    narrationBuffer = [];
  };

  for (const line of lines) {
    const bubble = matchBubbleLine(line);
    if (bubble) {
      flushNarration();
      blocks.push(bubble);
    } else {
      narrationBuffer.push(line);
    }
  }

  // 刷新最后的旁白缓冲
  flushNarration();

  // 后置原文块
  if (postText) {
    blocks.push({ type: 'html', content: postText });
  }

  return blocks;
}

/**
 * 判断消息是否包含气泡格式内容
 * 用于 mountStreamingMessages 的 filter 函数
 */
export function hasBubbleContent(message: string): boolean {
  return message.includes('@bubble:') || message.includes('<now_plot>');
}
