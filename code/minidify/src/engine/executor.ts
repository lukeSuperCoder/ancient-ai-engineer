import type {
  WorkflowNode,
  WorkflowEdge,
  ExecutionContext,
  ExecutionLog,
} from '../types/workflow';
import { executeNode } from './nodeExecutor';

/** 从 Start 节点开始顺序遍历执行工作流 */
export async function executeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  input: Record<string, any>,
  onLog?: (log: ExecutionLog) => void,
): Promise<ExecutionContext> {
  const ctx: ExecutionContext = {
    variables: { ...input },
    logs: [],
  };

  // 找到 Start 节点
  let currentNodeId: string | null = nodes.find((n) => n.type === 'start')?.id ?? null;
  if (!currentNodeId) throw new Error('工作流缺少 Start 节点');

  while (currentNodeId) {
    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) break;

    const startTime = Date.now();
    const log: ExecutionLog = {
      nodeId: node.id,
      nodeName: (node.data as any).label || node.type,
      timestamp: startTime,
      input: JSON.parse(JSON.stringify(ctx.variables)),
      output: null,
      duration: 0,
      status: 'running',
    };
    ctx.logs.push(log);
    onLog?.({ ...log });

    try {
      const result = await executeNode(node, ctx);

      log.output = result;
      log.duration = Date.now() - startTime;
      log.status = 'success';
      onLog?.({ ...log });
    } catch (err: any) {
      log.output = null;
      log.duration = Date.now() - startTime;
      log.status = 'error';
      log.error = err.message;
      onLog?.({ ...log });
      throw err;
    }

    if (node.type === 'end') break;

    // 找下一个节点
    currentNodeId = getNextNodeId(node, ctx.logs[ctx.logs.length - 1].output, edges);
  }

  return ctx;
}

/** 根据 edge 的 sourceHandle 获取下一个节点 */
function getNextNodeId(
  node: WorkflowNode,
  result: any,
  edges: WorkflowEdge[],
): string | null {
  const outEdges = edges.filter((e) => e.source === node.id);

  if (node.type === 'if') {
    // If 节点：根据结果匹配 sourceHandle
    const matched = outEdges.find(
      (e) => (e.sourceHandle as string) === result,
    );
    // 未匹配到则尝试走无 handle 的默认边
    return matched?.target ?? outEdges[0]?.target ?? null;
  }

  // 普通节点：走第一条边
  return outEdges[0]?.target ?? null;
}
