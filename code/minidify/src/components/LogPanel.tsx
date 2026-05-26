import { useState } from 'react';
import { DownOutlined, UpOutlined, CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { useStore } from '../store/workflowStore';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function JsonPreview({ data }: { data: any }) {
  const [expanded, setExpanded] = useState(false);
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const preview = String(text).slice(0, 80);

  return (
    <div className="max-w-[300px]">
      <div
        className="text-[11px] font-mono text-slate-300 cursor-pointer hover:text-cyan-400 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <pre className="whitespace-pre-wrap break-all text-[10px]">{String(text)}</pre>
        ) : (
          <span>{preview}{String(text).length > 80 ? '...' : ''}</span>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success': return <CheckCircleFilled className="text-emerald-400 text-xs" />;
    case 'error': return <CloseCircleFilled className="text-red-400 text-xs" />;
    case 'running': return <LoadingOutlined className="text-cyan-400 text-xs animate-spin" />;
    default: return null;
  }
}

export default function LogPanel() {
  const logs = useStore((s) => s.executionLogs);
  const expanded = useStore((s) => s.logPanelExpanded);
  const toggleLogPanel = useStore((s) => s.toggleLogPanel);

  return (
    <div className="border-t border-slate-700/50 bg-[#0f1629]">
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={toggleLogPanel}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">
            执行日志
          </span>
          {logs.length > 0 && (
            <span className="text-[10px] bg-cyan-900/40 text-cyan-400 px-1.5 py-0.5 rounded">
              {logs.length}
            </span>
          )}
        </div>
        {expanded ? (
          <UpOutlined className="text-slate-500 text-xs" />
        ) : (
          <DownOutlined className="text-slate-500 text-xs" />
        )}
      </div>

      {/* 日志列表 */}
      {expanded && (
        <div className="max-h-[250px] overflow-auto">
          {logs.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500">
              暂无日志，运行工作流后查看
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700/50">
                  <th className="text-left px-3 py-1.5 font-medium">节点</th>
                  <th className="text-left px-3 py-1.5 font-medium">输出</th>
                  <th className="text-left px-3 py-1.5 font-medium w-16">耗时</th>
                  <th className="text-center px-3 py-1.5 font-medium w-10">状态</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.nodeId}
                    className="border-b border-slate-800/50 hover:bg-slate-800/20"
                  >
                    <td className="px-3 py-2 text-slate-300 font-medium">
                      {log.nodeName}
                    </td>
                    <td className="px-3 py-2">
                      {log.output !== null ? (
                        <JsonPreview data={log.output} />
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-400 font-mono">
                      {log.duration > 0 ? formatDuration(log.duration) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusIcon status={log.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
