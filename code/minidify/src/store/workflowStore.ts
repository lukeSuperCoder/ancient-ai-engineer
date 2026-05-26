import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
  addEdge,
} from '@xyflow/react';
import type {
  WorkflowNode,
  WorkflowEdge,
  ExecutionLog,
  NodeType,
  StartNodeData,
  EndNodeData,
  PromptNodeData,
  ToolNodeData,
  IfNodeData,
} from '../types/workflow';
import { executeWorkflow } from '../engine/executor';

const STORAGE_KEY = 'mini-dify.workflow.current';

/** 创建各类型节点的默认数据 */
function createDefaultData(type: NodeType): Record<string, unknown> {
  switch (type) {
    case 'start':
      return {
        label: '开始',
        inputSchema: [{ key: 'message', type: 'string', label: '用户消息' }],
      } as StartNodeData;
    case 'end':
      return { label: '结束', outputKey: 'reply' } as EndNodeData;
    case 'prompt':
      return {
        label: 'LLM 提示',
        model: import.meta.env.VITE_MODEL_ID || 'glm-5',
        systemPrompt: '你是一个有用的助手。',
        userPrompt: '{{message}}',
        temperature: 0.7,
        outputVariable: 'llm_output',
      } as PromptNodeData;
    case 'tool':
      return {
        label: '工具',
        toolName: 'current_time',
        params: {},
        outputVariable: 'tool_output',
      } as ToolNodeData;
    case 'if':
      return {
        label: '条件判断',
        variableName: 'intent',
        operator: 'contains',
        value: '',
      } as IfNodeData;
  }
}

interface WorkflowStore {
  // 画布状态
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;

  // 执行状态
  isRunning: boolean;
  executionLogs: ExecutionLog[];
  variables: Record<string, any>;

  // 日志面板
  logPanelExpanded: boolean;

  // 操作
  onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<Record<string, unknown>>) => void;
  selectNode: (id: string | null) => void;
  clearWorkflow: () => void;

  // 持久化
  saveWorkflow: () => void;
  loadWorkflow: () => boolean;
  loadExampleWorkflow: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;

  // 执行
  runWorkflow: (input: Record<string, any>) => Promise<void>;

  // 面板
  toggleLogPanel: () => void;
}

export const useStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isRunning: false,
  executionLogs: [],
  variables: {},
  logPanelExpanded: false,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    const newEdge = {
      id: `e_${Date.now()}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
      type: 'smoothstep' as const,
      animated: true,
      style: { stroke: '#06b6d4', strokeWidth: 2 },
    };
    set({ edges: [...get().edges, newEdge] });
  },

  addNode: (type, position) => {
    const id = `${type}_${Date.now()}`;
    const newNode: WorkflowNode = {
      id,
      type,
      position,
      data: createDefaultData(type),
    } as WorkflowNode;
    set({ nodes: [...get().nodes, newNode] });
  },

  removeNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
  },

  updateNodeData: (id, data) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  clearWorkflow: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      executionLogs: [],
      variables: {},
    });
    localStorage.removeItem(STORAGE_KEY);
  },

  saveWorkflow: () => {
    const { nodes, edges } = get();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ nodes, edges, savedAt: Date.now() }),
    );
  },

  loadWorkflow: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      set({ nodes: data.nodes || [], edges: data.edges || [] });
      return true;
    } catch {
      return false;
    }
  },

  loadExampleWorkflow: (nodes, edges) => {
    set({ nodes, edges, selectedNodeId: null, executionLogs: [], variables: {} });
  },

  runWorkflow: async (input) => {
    const { nodes, edges } = get();
    set({ isRunning: true, executionLogs: [], variables: {} });

    try {
      const ctx = await executeWorkflow(
        nodes,
        edges,
        input,
        (log) => {
          // 逐步更新日志，触发 UI 重渲染
          const logs = [...get().executionLogs];
          const idx = logs.findIndex((l) => l.nodeId === log.nodeId);
          if (idx >= 0) {
            logs[idx] = log;
          } else {
            logs.push(log);
          }
          set({ executionLogs: logs });
        },
      );
      set({ variables: ctx.variables });
    } catch (err: any) {
      console.error('工作流执行失败:', err);
    } finally {
      set({ isRunning: false });
    }
  },

  toggleLogPanel: () => set({ logPanelExpanded: !get().logPanelExpanded }),
}));
