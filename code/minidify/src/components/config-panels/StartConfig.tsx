import { Form, Input, Button } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useStore } from '../../store/workflowStore';
import type { StartNodeData } from '../../types/workflow';

export default function StartConfig() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const updateNodeData = useStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as StartNodeData;

  const update = (patch: Partial<StartNodeData>) => {
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
        <label className="text-[11px] text-slate-400 mb-1 block">输入变量</label>
        {(data.inputSchema || []).map((field, idx) => (
          <div key={idx} className="flex gap-1.5 mb-1.5 items-center">
            <Input
              value={field.key}
              onChange={(e) => {
                const schema = [...data.inputSchema];
                schema[idx] = { ...schema[idx], key: e.target.value };
                update({ inputSchema: schema });
              }}
              placeholder="变量名"
              size="small"
              className="flex-1 !bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
            />
            <Input
              value={field.label}
              onChange={(e) => {
                const schema = [...data.inputSchema];
                schema[idx] = { ...schema[idx], label: e.target.value };
                update({ inputSchema: schema });
              }}
              placeholder="显示名"
              size="small"
              className="flex-1 !bg-slate-800 !border-slate-600 !text-slate-200"
            />
            <Button
              size="small"
              danger
              icon={<MinusCircleOutlined />}
              onClick={() =>
                update({ inputSchema: data.inputSchema.filter((_, i) => i !== idx) })
              }
              className="!bg-transparent !border-slate-600"
            />
          </div>
        ))}
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() =>
            update({
              inputSchema: [
                ...data.inputSchema,
                { key: `var_${Date.now()}`, type: 'string', label: '新变量' },
              ],
            })
          }
          className="!border-slate-600 !text-slate-400 w-full mt-1"
        >
          添加变量
        </Button>
      </div>
    </div>
  );
}
