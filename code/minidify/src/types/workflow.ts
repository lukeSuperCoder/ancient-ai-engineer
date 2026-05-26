import type { Node, Edge } from '@xyflow/react';

// 节点类型
export type NodeType = 'start' | 'end' | 'prompt' | 'tool' | 'if';

// 各节点数据类型（添加索引签名以兼容 ReactFlow）
export interface StartNodeData extends Record<string, unknown> {
  label: string;
  inputSchema: { key: string; type: string; label: string }[];
}

export interface EndNodeData extends Record<string, unknown> {
  label: string;
  outputKey: string;
}

export interface PromptNodeData extends Record<string, unknown> {
  label: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  outputVariable: string;
}

export interface ToolNodeData extends Record<string, unknown> {
  label: string;
  toolName: string;
  params: Record<string, string>;
  outputVariable: string;
}

export interface IfNodeData extends Record<string, unknown> {
  label: string;
  variableName: string;
  operator: 'contains' | 'equals' | 'not_empty' | 'gt' | 'lt';
  value: string;
}

// 节点和边（直接使用 ReactFlow 类型）
export type WorkflowNode = Node;
export type WorkflowEdge = Edge;

// 执行日志
export interface ExecutionLog {
  nodeId: string;
  nodeName: string;
  timestamp: number;
  input: any;
  output: any;
  duration: number;
  status: 'running' | 'success' | 'error';
  error?: string;
}

// 执行上下文
export interface ExecutionContext {
  variables: Record<string, any>;
  logs: ExecutionLog[];
}

// 工具注册信息
export interface ToolInfo {
  name: string;
  description: string;
  params: { key: string; type: string; label: string }[];
}
