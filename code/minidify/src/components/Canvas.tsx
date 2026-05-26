import { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import StartNode from './nodes/StartNode';
import EndNode from './nodes/EndNode';
import PromptNode from './nodes/PromptNode';
import ToolNode from './nodes/ToolNode';
import IfNode from './nodes/IfNode';

import { useStore } from '../store/workflowStore';
import type { NodeType } from '../types/workflow';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  prompt: PromptNode,
  tool: ToolNode,
  if: IfNode,
};

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#06b6d4', strokeWidth: 2 },
};

export default function Canvas() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const addNode = useStore((s) => s.addNode);
  const selectNode = useStore((s) => s.selectNode);

  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!type || !reactFlowInstance.current) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type, position);
    },
    [addNode],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => selectNode(node.id),
    [selectNode],
  );

  const onPaneClick = useCallback(() => selectNode(null), [selectNode]);

  const minimapNodeColor = useCallback((node: any) => {
    switch (node.type) {
      case 'start': return '#10b981';
      case 'end': return '#f43f5e';
      case 'prompt': return '#06b6d4';
      case 'tool': return '#f59e0b';
      case 'if': return '#8b5cf6';
      default: return '#64748b';
    }
  }, []);

  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        className="bg-[#0a0e1a]"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(6, 182, 212, 0.15)"
        />
        <Controls
          className="!bg-[#111827] !border-slate-700 !rounded-lg [&>button]:!bg-[#111827] [&>button]:!border-slate-700 [&>button]:!text-cyan-400 [&>button:hover]:!bg-slate-800"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(0, 0, 0, 0.7)"
          className="!bg-[#0f1629] !border-slate-700 !rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}
