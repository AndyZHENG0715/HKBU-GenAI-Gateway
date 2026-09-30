import { AgentTool, ToolExecutionResult } from '../types';

let pyodidePromise: Promise<any> | null = null;

async function getPyodideInstance(): Promise<any> {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = new Promise(async (resolve, reject) => {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Pyodide can only run in a browser environment.');
      }

      // 1. Ensure pyodide.js script is loaded in window
      if (!(window as any).loadPyodide) {
        await new Promise<void>((res, rej) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
          script.async = true;
          script.onload = () => res();
          script.onerror = () => rej(new Error('Failed to load Pyodide WebAssembly runtime from CDN.'));
          document.head.appendChild(script);
        });
      }

      // 2. Initialize Pyodide
      const pyodide = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
      });

      // 3. Pre-load standard data science packages
      try {
        await pyodide.loadPackage(['numpy', 'pandas', 'matplotlib']);
      } catch (pkgErr) {
        console.warn('Could not pre-load optional packages:', pkgErr);
      }

      resolve(pyodide);
    } catch (err) {
      pyodidePromise = null;
      reject(err);
    }
  });

  return pyodidePromise;
}

export const pythonTool: AgentTool = {
  name: 'python_interpreter',
  displayName: 'Python (WebAssembly)',
  description:
    'Execute Python code directly inside the user browser via WebAssembly (Pyodide). Supports standard library, numpy, pandas, and matplotlib plotting. Output text, calculations, and plots are returned directly. Never runs on the server.',
  category: 'code',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The complete Python script or code snippet to execute.',
      },
    },
    required: ['code'],
  },
  execute: async (args: Record<string, any>): Promise<ToolExecutionResult> => {
    const code = String(args.code || '');
    if (!code.trim()) {
      return { output: '', error: 'No Python code provided to execute.' };
    }

    try {
      const pyodide = await getPyodideInstance();

      // Setup output capture and matplotlib Agg backend
      const wrapperCode = `
import sys, io, base64

_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
_orig_stdout = sys.stdout
_orig_stderr = sys.stderr
sys.stdout = _stdout_buf
sys.stderr = _stderr_buf

_extracted_images = []

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
except Exception:
    plt = None

_exec_result = None
_exec_error = None

try:
    _exec_namespace = {}
    _compiled = compile(${JSON.stringify(code)}, '<string>', 'exec')
    exec(_compiled, _exec_namespace)
except Exception as _e:
    import traceback
    _exec_error = traceback.format_exc()

# Collect matplotlib figures if any
if plt is not None:
    try:
        for _fignum in plt.get_fignums():
            _fig = plt.figure(_fignum)
            _img_buf = io.BytesIO()
            _fig.savefig(_img_buf, format='png', bbox_inches='tight', dpi=120)
            _img_buf.seek(0)
            _extracted_images.append("data:image/png;base64," + base64.b64encode(_img_buf.read()).decode('utf-8'))
            plt.close(_fig)
    except Exception:
        pass

sys.stdout = _orig_stdout
sys.stderr = _orig_stderr

_out_str = _stdout_buf.getvalue()
_err_str = _stderr_buf.getvalue()
`;

      await pyodide.runPythonAsync(wrapperCode);

      const outStr = pyodide.globals.get('_out_str') || '';
      const errStr = pyodide.globals.get('_err_str') || '';
      const execError = pyodide.globals.get('_exec_error') || '';
      const imagesPyList = pyodide.globals.get('_extracted_images');
      const images: string[] = imagesPyList ? imagesPyList.toJs() : [];

      let finalOutput = outStr;
      if (errStr) {
        finalOutput += (finalOutput ? '\n' : '') + `[Stderr]:\n${errStr}`;
      }

      if (execError) {
        return {
          output: finalOutput || '(Execution terminated with error)',
          error: execError,
          images: images.length > 0 ? images : undefined,
        };
      }

      return {
        output: finalOutput || '(Code executed successfully with no stdout)',
        images: images.length > 0 ? images : undefined,
      };
    } catch (err: any) {
      return {
        output: '',
        error: `Pyodide Execution Error: ${err.message || String(err)}`,
      };
    }
  },
};
