import type { WorkflowNode, WorkflowEdge } from '../types/workflow';

export const exampleNodes: WorkflowNode[] = [
  {
    id: 'start',
    type: 'start',
    position: { x: 100, y: 200 },
    data: {
      label: '开始',
      inputSchema: [{ key: 'message', type: 'string', label: '用户消息' }],
    },
  } as WorkflowNode,
  {
    id: 'extract_intent',
    type: 'prompt',
    position: { x: 350, y: 200 },
    data: {
      label: '提取意图',
      model: 'glm-5',
      systemPrompt:
        '你是一个意图分类器。只返回意图类别：refund（退款）、inquiry（咨询）、complaint（投诉）、other（其他）。只返回一个英文单词。',
      userPrompt: '分析用户消息的意图：{{message}}',
      temperature: 0.3,
      outputVariable: 'intent',
    },
  } as WorkflowNode,
  {
    id: 'check_intent',
    type: 'if',
    position: { x: 600, y: 200 },
    data: {
      label: '判断意图',
      variableName: 'intent',
      operator: 'contains',
      value: 'refund',
    },
  } as WorkflowNode,
  {
    id: 'process_refund',
    type: 'tool',
    position: { x: 880, y: 100 },
    data: {
      label: '处理退款',
      toolName: 'process_refund',
      params: { reason: '{{intent}}' },
      outputVariable: 'refund_result',
    },
  } as WorkflowNode,
  {
    id: 'refund_reply',
    type: 'prompt',
    position: { x: 1150, y: 100 },
    data: {
      label: '退款回复',
      model: 'glm-5',
      systemPrompt:
        '你是客服。退款已处理完毕，请根据退款结果写一封礼貌、有同理心的回复。',
      userPrompt: '退款结果：{{refund_result}}\n\n请给用户写回复。',
      temperature: 0.7,
      outputVariable: 'reply',
    },
  } as WorkflowNode,
  {
    id: 'general_reply',
    type: 'prompt',
    position: { x: 880, y: 340 },
    data: {
      label: '通用回复',
      model: 'glm-5',
      systemPrompt: '你是一个有帮助的客服助手，回答用户的问题。',
      userPrompt:
        '用户说：{{message}}\n意图类别：{{intent}}\n\n请给出合适的回复。',
      temperature: 0.7,
      outputVariable: 'reply',
    },
  } as WorkflowNode,
  {
    id: 'end',
    type: 'end',
    position: { x: 1400, y: 200 },
    data: {
      label: '结束',
      outputKey: 'reply',
    },
  } as WorkflowNode,
];

export const exampleEdges: WorkflowEdge[] = [
  { id: 'e1', source: 'start', target: 'extract_intent', type: 'smoothstep', animated: true, style: { stroke: '#06b6d4', strokeWidth: 2 } },
  { id: 'e2', source: 'extract_intent', target: 'check_intent', type: 'smoothstep', animated: true, style: { stroke: '#06b6d4', strokeWidth: 2 } },
  {
    id: 'e3',
    source: 'check_intent',
    target: 'process_refund',
    sourceHandle: 'true',
    label: '是退款',
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#10b981', strokeWidth: 2 },
  },
  {
    id: 'e4',
    source: 'check_intent',
    target: 'general_reply',
    sourceHandle: 'false',
    label: '其他',
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#f59e0b', strokeWidth: 2 },
  },
  { id: 'e5', source: 'process_refund', target: 'refund_reply', type: 'smoothstep', animated: true, style: { stroke: '#06b6d4', strokeWidth: 2 } },
  { id: 'e6', source: 'refund_reply', target: 'end', type: 'smoothstep', animated: true, style: { stroke: '#06b6d4', strokeWidth: 2 } },
  { id: 'e7', source: 'general_reply', target: 'end', type: 'smoothstep', animated: true, style: { stroke: '#06b6d4', strokeWidth: 2 } },
];
