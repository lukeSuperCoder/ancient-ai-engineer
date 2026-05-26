import { Input, Select } from 'antd';
import { useStore } from '../../store/workflowStore';
import type { IfNodeData } from '../../types/workflow';

const operators = [
  { value: 'contains', label: '包含 (contains)' },
  { value: 'equals', label: '等于 (equals)' },
  { value: 'not_empty', label: '非空 (not_empty)' },
  { value: 'gt', label: '大于 (gt)' },
  { value: 'lt', label: '小于 (lt)' },
];

export default function IfConfig() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as IfNodeData;

  const update = (patch: Partial<IfNodeData>) => {
    updateNodeData(node.id, { ...data, ...patch });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">节点名称</label>
        <Input
          value={data.label}
          onChange={(e) => update({ label: e.target.value })}
          size="small"
          className="!bg-slate-800 !border-slate-600 !text-slate-200"
        />
      </div>

      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">判断变量</label>
        <Input
          value={data.variableName}
          onChange={(e) => update({ variableName: e.target.value })}
          size="small"
          placeholder="变量名"
          className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
        />
      </div>

      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">操作符</label>
        <Select
          value={data.operator}
          onChange={(v) => update({ operator: v })}
          size="small"
          className="w-full"
          options={operators}
          popupClassName="[&_.ant-select-item]:!bg-slate-800 [&_.ant-select-item-option-selected]:!bg-slate-700"
        />
      </div>

      {data.operator !== 'not_empty' && (
        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">比较值</label>
          <Input
            value={data.value}
            onChange={(e) => update({ value: e.target.value })}
            size="small"
            className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
          />
        </div>
      )}
    </div>
  );
}
