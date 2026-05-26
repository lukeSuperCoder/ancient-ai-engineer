import type { ToolInfo } from '../types/workflow';

type ToolFunction = (params: Record<string, string>) => Promise<string>;

export const toolRegistry: Record<string, ToolFunction> = {
  /** 获取当前时间 */
  current_time: async () => {
    return new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  },

  /** 文本处理：大小写、长度 */
  text_transform: async (params) => {
    const { text, action } = params;
    switch (action) {
      case 'upper': return text.toUpperCase();
      case 'lower': return text.toLowerCase();
      case 'length': return String(text.length);
      default: return text;
    }
  },

  /** 简单计算器（仅支持基础四则运算） */
  calculate: async (params) => {
    const sanitized = params.expression.replace(/[^0-9+\-*/().]/g, '');
    if (!sanitized) return '无效表达式';
    try {
      return String(Function(`"use strict"; return (${sanitized})`)());
    } catch {
      return '计算错误';
    }
  },

  /** JSON 格式化 */
  format_json: async (params) => {
    try {
      return JSON.stringify(JSON.parse(params.text), null, 2);
    } catch {
      return '无效 JSON';
    }
  },

  /** 模拟退款处理 */
  process_refund: async (params) => {
    return JSON.stringify({
      status: '已退款',
      reason: params.reason || '用户申请',
      orderId: 'ORD-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      processedAt: new Date().toISOString(),
    });
  },
};

/** 工具元信息（用于配置面板下拉选择） */
export const toolInfoList: ToolInfo[] = [
  {
    name: 'current_time',
    description: '获取当前时间',
    params: [],
  },
  {
    name: 'text_transform',
    description: '文本处理（大小写/长度）',
    params: [
      { key: 'text', type: 'string', label: '输入文本' },
      { key: 'action', type: 'string', label: '操作（upper/lower/length）' },
    ],
  },
  {
    name: 'calculate',
    description: '简单计算器',
    params: [
      { key: 'expression', type: 'string', label: '计算表达式' },
    ],
  },
  {
    name: 'format_json',
    description: 'JSON 格式化',
    params: [
      { key: 'text', type: 'string', label: 'JSON 文本' },
    ],
  },
  {
    name: 'process_refund',
    description: '模拟退款处理',
    params: [
      { key: 'reason', type: 'string', label: '退款原因' },
    ],
  },
];
