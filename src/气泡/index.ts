/**
 * 对话气泡流式渲染 — 入口脚本
 *
 * 使用框架提供的 mountStreamingMessages API 挂载流式界面，
 * 替代原 regex 模板的渲染职责。
 *
 * 编译后输出为酒馆助手脚本 JSON，可直接导入使用。
 */
import { mountStreamingMessages } from '@util/streaming';
import { hasBubbleContent } from './useBubbleParser';
import App from './App.vue';

// 引入气泡样式（通过 style-loader 注入到 DOM）
import './bubble.css';

/**
 * 等待 jQuery ready 后初始化
 * 使用 host: 'div' 模式，继承酒馆原生样式环境
 */
$(() => {
  const { unmount } = mountStreamingMessages(() => createApp(App), {
    host: 'div',
    mode: 'append-streaming',
    /**
     * 楼层过滤器：只对包含 @bubble: 格式或 <now_plot> 标签的 AI 消息启用流式渲染
     * 其他消息保持酒馆原生渲染
     */
    filter: (_messageId: number, message: string) => {
      return hasBubbleContent(message);
    },
  });

  // 页面卸载时清理
  $(window).on('pagehide', () => unmount());
});
