import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../types/workflow';
import { useStore } from '../../store/workflowStore';

function IfNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const d = data as any;
  const executionLogs = useStore((s) => s.executionLogs);
  const log = executionLogs.find((l) => l.nodeId === id);

  return (
    <div
      className={`
        min-w-[160px] rounded-lg border-2 bg-[#111827] shadow-lg
        ${selected ? 'border-violet-400 shadow-violet-500/30' : 'border-violet-600/50'}
        ${log?.status === 'running' ? 'node-executing' : ''}
        ${log?.status === 'success' ? 'border-green-400' : ''}
        ${log?.status === 'error' ? 'border-red-500' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-violet-400 !w-2 !h-2" />

      <div className="flex items-center gap-2 rounded-t-md bg-violet-600/20 px-3 py-1.5">
        <span className="text-sm">◆</span>
        <span className="text-xs font-semibold text-violet-300">
          {d.label || '条件判断'}
        </span>
      </div>

      <div className="space-y-1 px-3 py-2">
        <div className="text-[10px] text-slate-400">
          <span className="font-mono text-violet-400/80">{d.variableName}</span>
          {' '}{d.operator}{' '}
          <span className="font-mono text-violet-400/80">{d.value || '?'}</span>
        </div>
      </div>

      {/* 两个分支输出端口 */}
      <div className="relative">
        <Handle
          type="source"
          position={Position.Bottom}
          id="true"
          style={{ left: '30%' }}
          className="!bg-emerald-400 !w-2 !h-2"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          style={{ left: '70%' }}
          className="!bg-amber-400 !w-2 !h-2"
        />
        <div className="flex justify-between px-4 pb-2">
          <span className="text-[9px] text-emerald-400/70">T</span>
          <span className="text-[9px] text-amber-400/70">F</span>
        </div>
      </div>
    </div>
  );
}

export default memo(IfNode);
