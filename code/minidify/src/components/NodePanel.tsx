import { type NodeType } from '../types/workflow';

const nodeItems: { type: NodeType; label: string; icon: string; color: string }[] = [
  { type: 'start', label: '开始', icon: '▶', color: 'emerald' },
  { type: 'prompt', label: 'LLM 提示', icon: '✦', color: 'cyan' },
  { type: 'tool', label: '工具', icon: '⚡', color: 'amber' },
  { type: 'if', label: '条件判断', icon: '◆', color: 'violet' },
  { type: 'end', label: '结束', icon: '■', color: 'rose' },
];

const colorMap: Record<string, string> = {
  emerald: 'border-emerald-600/50 hover:border-emerald-400 hover:bg-emerald-900/20 text-emerald-300',
  cyan: 'border-cyan-600/50 hover:border-cyan-400 hover:bg-cyan-900/20 text-cyan-300',
  amber: 'border-amber-600/50 hover:border-amber-400 hover:bg-amber-900/20 text-amber-300',
  violet: 'border-violet-600/50 hover:border-violet-400 hover:bg-violet-900/20 text-violet-300',
  rose: 'border-rose-600/50 hover:border-rose-400 hover:bg-rose-900/20 text-rose-300',
};

export default function NodePanel() {
  const onDragStart = (event: React.DragEvent, type: NodeType) => {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-[180px] border-r border-slate-700/50 bg-[#0f1629] flex flex-col">
      <div className="px-3 py-3 border-b border-slate-700/50">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          节点面板
        </h3>
        <p className="text-[10px] text-slate-500 mt-1">拖拽节点到画布</p>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {nodeItems.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            className={`
              flex items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 cursor-grab
              active:cursor-grabbing transition-all duration-150 select-none
              ${colorMap[item.color]}
            `}
          >
            <span className="text-base">{item.icon}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
