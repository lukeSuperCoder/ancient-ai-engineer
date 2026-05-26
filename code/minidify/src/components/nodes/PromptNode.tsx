import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../../types/workflow';
import { useStore } from '../../store/workflowStore';

function PromptNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const d = data as any;
  const executionLogs = useStore((s) => s.executionLogs);
  const log = executionLogs.find((l) => l.nodeId === id);

  return (
    <div
      className={`
        min-w-[160px] max-w-[200px] rounded-lg border-2 bg-[#111827] shadow-lg
        ${selected ? 'border-cyan-400 shadow-cyan-500/30' : 'border-cyan-600/50'}
        ${log?.status === 'running' ? 'node-executing' : ''}
        ${log?.status === 'success' ? 'border-green-400' : ''}
        ${log?.status === 'error' ? 'border-red-500' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyan-400 !w-2 !h-2" />

      <div className="flex items-center gap-2 rounded-t-md bg-cyan-600/20 px-3 py-1.5">
        <span className="text-sm">✦</span>
        <span className="text-xs font-semibold text-cyan-300">
          {d.label || 'LLM'}
        </span>
      </div>

      <div className="space-y-1 px-3 py-2">
        <div className="text-[10px] text-slate-400 truncate">
          模型: <span className="font-mono text-cyan-400/80">{d.model || 'default'}</span>
        </div>
        <div className="text-[10px] text-slate-500 truncate">
          {d.systemPrompt || '未配置'}
        </div>
        <div className="text-[10px] text-slate-400">
          → <span className="rounded bg-cyan-900/30 px-1 font-mono">{d.outputVariable || 'output'}</span>
        </div>
      </div>

      {log?.status === 'success' && log.output && (
        <div className="border-t border-cyan-800/30 px-3 py-1.5">
          <div className="text-[10px] text-cyan-400/70 truncate font-mono">
            {String(log.output).slice(0, 40)}...
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-cyan-400 !w-2 !h-2" />
    </div>
  );
}

export default memo(PromptNode);
