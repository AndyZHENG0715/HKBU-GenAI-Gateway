import { AgentTool, ToolExecutionResult } from '../types';

export const calculatorTool: AgentTool = {
  name: 'calculator',
  displayName: 'Math Calculator',
  description:
    'Evaluate mathematical expressions, formulas, and arithmetic accurately (e.g. "Math.sqrt(144)", "2 ** 10", "Math.sin(Math.PI / 4)").',
  category: 'code',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate.',
      },
    },
    required: ['expression'],
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    const expr = String(args.expression || '').trim();
    if (!expr) return { output: '', error: 'Missing expression argument.' };

    try {
      // Safe math evaluator allowing standard Math methods and numbers
      const sanitized = expr.replace(/[^0-9+\-*/().,%^&|~<>=!?: eEMathPIsqrtabscosintanlogexpceilfloorroundminmax]/g, '');
      const fn = new Function('Math', `return (${sanitized});`);
      const result = fn(Math);
      return {
        output: String(result),
      };
    } catch (err: any) {
      return {
        output: '',
        error: `Calculation error: ${err.message || String(err)}`,
      };
    }
  },
};
