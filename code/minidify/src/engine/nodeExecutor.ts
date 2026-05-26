import type {
  WorkflowNode,
  ExecutionContext,
  PromptNodeData,
  ToolNodeData,
  IfNodeData,
} from '../types/workflow';
import { replaceVars, replaceVarsInObj } from './templateEngine';
import { toolRegistry } from './builtinTools';
import { callLLM } from '../services/llm';

/** 条件判断 */
function evaluateCondition(
  value: any,
  operator: string,
  compareValue: string,
): boolean {
  const str = String(value ?? '');
  switch (operator) {
    case 'contains': return str.includes(compareValue);
    case 'equals': return str === compareValue;
    case 'not_empty': return str.length > 0;
    case 'gt': return Number(str) > Number(compareValue);
    case 'lt': return Number(str) < Number(compareValue);
    default: return false;
  }
}

/** 执行单个节点，返回结果 */
export async function executeNode(
  node: WorkflowNode,
  ctx: ExecutionContext,
): Promise<any> {
  const data = node.data as any;

  switch (node.type) {
    case 'start':
      return null;

    case 'end':
      return ctx.variables;

    case 'prompt': {
      const d = data as PromptNodeData;
      const sysMsg = replaceVars(d.systemPrompt, ctx.variables);
      const userMsg = replaceVars(d.userPrompt, ctx.variables);
      const response = await callLLM({
        model: d.model,
        system: sysMsg,
        user: userMsg,
        temperature: d.temperature,
      });
      ctx.variables[d.outputVariable] = response;
      return response;
    }

    case 'tool': {
      const d = data as ToolNodeData;
      const params = replaceVarsInObj(d.params, ctx.variables);
      const toolFn = toolRegistry[d.toolName];
      if (!toolFn) throw new Error(`未找到工具: ${d.toolName}`);
      const result = await toolFn(params);
      ctx.variables[d.outputVariable] = result;
      return result;
    }

    case 'if': {
      const d = data as IfNodeData;
      const val = ctx.variables[d.variableName];
      const result = evaluateCondition(val, d.operator, d.value);
      return result ? 'true' : 'false';
    }

    default:
      return null;
  }
}
