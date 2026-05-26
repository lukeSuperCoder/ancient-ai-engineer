import { useState } from 'react';
import { Button, Input, Modal, message, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  SettingOutlined,
  ExperimentOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useStore } from '../store/workflowStore';
import { exampleNodes, exampleEdges } from '../data/exampleWorkflow';
import InputModal from './InputModal';

export default function Toolbar() {
  const saveWorkflow = useStore((s) => s.saveWorkflow);
  const loadWorkflow = useStore((s) => s.loadWorkflow);
  const loadExampleWorkflow = useStore((s) => s.loadExampleWorkflow);
  const clearWorkflow = useStore((s) => s.clearWorkflow);
  const isRunning = useStore((s) => s.isRunning);
  const nodes = useStore((s) => s.nodes);

  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('mini-dify.api-key') || '',
  );
  const [showKey, setShowKey] = useState(false);
  const [inputModalOpen, setInputModalOpen] = useState(false);

  const handleSaveKey = () => {
    localStorage.setItem('mini-dify.api-key', apiKey);
    setApiKeyModalOpen(false);
    message.success('API Key 已保存');
  };

  const handleLoadExample = () => {
    loadExampleWorkflow(exampleNodes, exampleEdges);
    message.success('已加载智能客服示例');
  };

  const handleRun = () => {
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) {
      message.error('工作流缺少 Start 节点');
      return;
    }
    setInputModalOpen(true);
  };

  return (
    <>
      <div className="h-12 border-b border-slate-700/50 bg-[#0f1629] flex items-center justify-between px-4">
        {/* 左侧：项目标题 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 text-lg font-bold tracking-tight">
              Mini Dify
            </span>
            <span className="text-slate-500 text-xs">Workflow Builder</span>
          </div>
        </div>

        {/* 中间：操作按钮 */}
        <div className="flex items-center gap-2">
          <Tooltip title="加载示例">
            <Button
              size="small"
              icon={<ExperimentOutlined />}
              onClick={handleLoadExample}
              className="!bg-slate-800 !border-slate-600 !text-slate-300 hover:!bg-slate-700"
            >
              示例
            </Button>
          </Tooltip>

          <Tooltip title="保存工作流">
            <Button
              size="small"
              icon={<SaveOutlined />}
              onClick={() => {
                saveWorkflow();
                message.success('工作流已保存');
              }}
              className="!bg-slate-800 !border-slate-600 !text-slate-300 hover:!bg-slate-700"
            >
              保存
            </Button>
          </Tooltip>

          <Tooltip title="加载工作流">
            <Button
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => {
                const ok = loadWorkflow();
                message[ok ? 'success' : 'info'](
                  ok ? '工作流已加载' : '没有已保存的工作流',
                );
              }}
              className="!bg-slate-800 !border-slate-600 !text-slate-300 hover:!bg-slate-700"
            >
              加载
            </Button>
          </Tooltip>

          <div className="w-px h-6 bg-slate-700" />

          <Tooltip title="运行工作流">
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRun}
              loading={isRunning}
              className="!bg-cyan-600 hover:!bg-cyan-500 !border-cyan-600"
            >
              {isRunning ? '执行中...' : '运行'}
            </Button>
          </Tooltip>

          <Tooltip title="清空画布">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: '确认清空',
                  content: '将清空画布上所有节点和连线',
                  okText: '清空',
                  cancelText: '取消',
                  onOk: clearWorkflow,
                });
              }}
              className="!bg-transparent !border-slate-600 hover:!bg-red-900/30"
            />
          </Tooltip>
        </div>

        {/* 右侧：API Key 设置 */}
        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={() => setApiKeyModalOpen(true)}
          className="!bg-slate-800 !border-slate-600 !text-slate-300 hover:!bg-slate-700"
        >
          API Key
        </Button>
      </div>

      {/* API Key 弹窗 */}
      <Modal
        title="配置 API Key"
        open={apiKeyModalOpen}
        onOk={handleSaveKey}
        onCancel={() => setApiKeyModalOpen(false)}
        okText="保存"
        cancelText="取消"
        className="[&_.ant-modal-content]:!bg-[#111827] [&_.ant-modal-header]:!bg-[#111827] [&_.ant-modal-title]:!text-slate-200 [&_.ant-modal-close]:!text-slate-400"
      >
        <div className="py-4">
          <p className="text-xs text-slate-400 mb-2">
            用于调用 Anthropic Messages API（支持兼容接口）
          </p>
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            suffix={
              <span
                className="cursor-pointer text-slate-400 hover:text-slate-300"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              </span>
            }
            className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
          />
        </div>
      </Modal>

      {/* 运行输入弹窗 */}
      <InputModal open={inputModalOpen} onClose={() => setInputModalOpen(false)} />
    </>
  );
}
