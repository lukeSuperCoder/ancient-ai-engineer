import { ReactFlowProvider } from '@xyflow/react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Toolbar from './components/Toolbar';
import NodePanel from './components/NodePanel';
import Canvas from './components/Canvas';
import ConfigPanel from './components/ConfigPanel';
import LogPanel from './components/LogPanel';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#06b6d4',
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        },
      }}
    >
      <ReactFlowProvider>
        <div className="h-screen flex flex-col bg-[#0a0e1a] text-slate-200">
          <Toolbar />
          <div className="flex-1 flex overflow-hidden">
            <NodePanel />
            <Canvas />
            <ConfigPanel />
          </div>
          <LogPanel />
        </div>
      </ReactFlowProvider>
    </ConfigProvider>
  );
}
