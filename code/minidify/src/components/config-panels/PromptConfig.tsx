import { Input, Slider, Select } from 'antd';
import { useStore } from '../../store/workflowStore';
import type { PromptNodeData } from '../../types/workflow';

export default function PromptConfig() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as PromptNodeData;

  const update = (patch: Partial<PromptNodeData>) => {
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
        <label className="text-[11px] text-slate-400 mb-1 block">模型</label>
        <Input
          value={data.model}
          onChange={(e) => update({ model: e.target.value })}
          size="small"
          className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
        />
      </div>

      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">
          System Prompt
        </label>
        <Input.TextArea
          value={data.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          rows={3}
          className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono !text-xs"
        />
      </div>

      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">
          User Prompt{' '}
          <span className="text-cyan-500">支持 {'{{变量名}}'}</span>
        </label>
        <Input.TextArea
          value={data.userPrompt}
          onChange={(e) => update({ userPrompt: e.target.value })}
          rows={4}
          className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono !text-xs"
        />
      </div>

      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">
          Temperature: {data.temperature}
        </label>
        <Slider
          min={0}
          max={1}
          step={0.1}
          value={data.temperature}
          onChange={(v) => update({ temperature: v })}
          className="[&_.ant-slider-track]:!bg-cyan-500 [&_.ant-slider-handle]:!bg-cyan-400"
        />
      </div>

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
