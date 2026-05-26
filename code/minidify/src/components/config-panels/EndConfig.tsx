import { Input } from 'antd';
import { useStore } from '../../store/workflowStore';
import type { EndNodeData } from '../../types/workflow';

export default function EndConfig() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as EndNodeData;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">节点名称</label>
        <Input
          value={data.label}
          onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          size="small"
          className="!bg-slate-800 !border-slate-600 !text-slate-200"
        />
      </div>
      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">输出变量名</label>
        <Input
          value={data.outputKey}
          onChange={(e) => updateNodeData(node.id, { outputKey: e.target.value })}
          size="small"
          className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
        />
      </div>
    </div>
  );
}
