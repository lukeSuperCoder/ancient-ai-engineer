import { Input, Select, Button } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useStore } from '../../store/workflowStore';
import { toolInfoList } from '../../engine/builtinTools';
import type { ToolNodeData } from '../../types/workflow';

export default function ToolConfig() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as ToolNodeData;

  const update = (patch: Partial<ToolNodeData>) => {
    updateNodeData(node.id, { ...data, ...patch });
  };

  const selectedTool = toolInfoList.find((t) => t.name === data.toolName);

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
        <label className="text-[11px] text-slate-400 mb-1 block">选择工具</label>
        <Select
          value={data.toolName}
          onChange={(v) => update({ toolName: v, params: {} })}
          size="small"
          className="w-full"
          options={toolInfoList.map((t) => ({
            value: t.name,
            label: `${t.name} - ${t.description}`,
          }))}
          popupClassName="[&_.ant-select-item]:!bg-slate-800 [&_.ant-select-item-option-selected]:!bg-slate-700"
        />
      </div>

      {selectedTool && selectedTool.params.length > 0 && (
        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">
            参数{' '}
            <span className="text-amber-500">支持 {'{{变量名}}'}</span>
          </label>
          {selectedTool.params.map((p) => (
            <div key={p.key} className="mb-1.5">
              <div className="text-[10px] text-slate-500 mb-0.5">{p.label}</div>
              <Input
                value={data.params[p.key] || ''}
                onChange={(e) =>
                  update({ params: { ...data.params, [p.key]: e.target.value } })
                }
                placeholder={p.label}
                size="small"
                className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">输出变量名</label>
        <Input
          value={data.outputVariable}
          onChange={(e) => update({ outputVariable: e.target.value })}
          size="small"
          className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
        />
      </div>
    </div>
  );
}
