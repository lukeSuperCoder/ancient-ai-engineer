import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../types/workflow';
import { useStore } from '../../store/workflowStore';

function StartNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const executionLogs = useStore((s) => s.executionLogs);
  const log = executionLogs.find((l) => l.nodeId === id);

  return (
    <div
      className={`
        min-w-[140px] rounded-lg border-2 bg-[#111827] shadow-lg
        ${selected ? 'border-emerald-400 shadow-emerald-500/30' : 'border-emerald-600/50'}
        ${log?.status === 'running' ? 'node-executing' : ''}
        ${log?.status === 'success' ? 'border-green-400' : ''}
        ${log?.status === 'error' ? 'border-red-500' : ''}
      `}
    >
      <div className="flex items-center gap-2 rounded-t-md bg-emerald-600/20 px-3 py-1.5">
        <span className="text-sm">▶</span>
        <span className="text-xs font-semibold text-emerald-300">
          {(data as any).label || '开始'}
        </span>
      </div>
      <div className="px-3 py-2">
        {((data as any).inputSchema || []).map((s: any) => (
          <div key={s.key} className="text-[10px] text-slate-400">
            <span className="rounded bg-slate-700/50 px-1 font-mono">
              {s.key}
            </span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400 !w-2 !h-2" />
    </div>
  );
}

export default memo(StartNode);
