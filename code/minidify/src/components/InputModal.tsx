import { useState, useMemo } from 'react';
import { Modal, Input, Form, message } from 'antd';
import { useStore } from '../store/workflowStore';
import type { StartNodeData } from '../types/workflow';

interface InputModalProps {
  open: boolean;
  onClose: () => void;
}

export default function InputModal({ open, onClose }: InputModalProps) {
  const nodes = useStore((s) => s.nodes);
  const runWorkflow = useStore((s) => s.runWorkflow);

  const startNode = useMemo(
    () => nodes.find((n) => n.type === 'start'),
    [nodes],
  );

  const schema = useMemo(() => {
    if (!startNode) return [];
    return (startNode.data as StartNodeData).inputSchema || [];
  }, [startNode]);

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await runWorkflow(values);
      message.success('工作流执行完成');
      onClose();
    } catch (err: any) {
      if (err.errorFields) return; // 表单验证失败
      message.error(`执行失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="运行工作流"
      open={open}
      onOk={handleRun}
      onCancel={onClose}
      okText="开始执行"
      cancelText="取消"
      confirmLoading={loading}
      className="[&_.ant-modal-content]:!bg-[#111827] [&_.ant-modal-header]:!bg-[#111827] [&_.ant-modal-title]:!text-slate-200 [&_.ant-modal-close]:!text-slate-400"
    >
      <Form form={form} layout="vertical" className="py-4">
        {schema.map((field) => (
          <Form.Item
            key={field.key}
            name={field.key}
            label={<span className="text-slate-300">{field.label}</span>}
            rules={[{ required: true, message: `请输入${field.label}` }]}
          >
            <Input.TextArea
              rows={3}
              placeholder={`输入${field.label}...`}
              className="!bg-slate-800 !border-slate-600 !text-slate-200 font-mono"
            />
          </Form.Item>
        ))}
        {schema.length === 0 && (
          <p className="text-slate-500 text-sm">Start 节点未定义输入变量</p>
        )}
      </Form>
    </Modal>
  );
}
