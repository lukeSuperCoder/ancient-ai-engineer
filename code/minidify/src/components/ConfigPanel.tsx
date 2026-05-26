import { Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useStore } from '../store/workflowStore';
import StartConfig from './config-panels/StartConfig';
import EndConfig from './config-panels/EndConfig';
import PromptConfig from './config-panels/PromptConfig';
import ToolConfig from './config-panels/ToolConfig';
import IfConfig from './config-panels/IfConfig';

const typeLabels: Record<string, string> = {
  start: '开始节点',
  end: '结束节点',
  prompt: 'LLM 提示节点',
  tool: '工具节点',
  if: '条件判断节点',
};

const typeColors: Record<string, string> = {
  start: 'text-emerald-400',
  end: 'text-rose-400',
  prompt: 'text-cyan-400',
  tool: 'text-amber-400',
  if: 'text-violet-400',
};

export default function ConfigPanel() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const removeNode = useStore((s) => s.removeNode);

  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <div className="w-[280px] border-l border-slate-700/50 bg-[#0f1629] flex items-center justify-center">
        <p className="text-xs text-slate-500">点击节点查看配置</p>
      </div>
    );
  }

  const renderConfig = () => {
    switch (node.type ?? '') {
      case 'start': return <StartConfig />;
      case 'end': return <EndConfig />;
      case 'prompt': return <PromptConfig />;
      case 'tool': return <ToolConfig />;
      case 'if': return <IfConfig />;
      default: return null;
    }
  };

  return (
    <div className="w-[280px] border-l border-slate-700/50 bg-[#0f1629] flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700/50">
        <div>
          <span className={`text-xs font-semibold ${typeColors[node.type ?? ''] || 'text-slate-300'}`}>
            {typeLabels[node.type ?? ''] || node.type}
          </span>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            {node.id}
          </div>
        </div>
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeNode(node.id)}
          className="!bg-transparent !border-slate-600 hover:!bg-red-900/30"
        />
      </div>

      {/* 配置表单 */}
      <div className="flex-1 overflow-auto p-3">
        {renderConfig()}
      </div>
    </div>
  );
}
