// Runs the code from the editor and shows the result. Everything happens in your browser, with no internet needed.
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { createRoot, type Root } from 'react-dom/client';
import { transform } from 'sucrase';

// The page inside the preview frame. It is plain on purpose, like a new React app.
const FRAME = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 16px; font-family: system-ui, sans-serif; font-size: 16px; line-height: 1.5; color: #1b201d; background: #ffffff; }
button, input, select, textarea { font: inherit; }
button { padding: 6px 14px; border-radius: 8px; border: 1.5px solid #1b201d; background: #ffffff; cursor: pointer; }
</style></head><body><div id="root"></div></body></html>`;

class Boundary extends React.Component<{ onError: (message: string) => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(String((error as any)?.message ?? error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Turns the editor's code into a component. The code may import only from 'react', the same as the tests allow.
function build(code: string): React.ComponentType {
  const js = transform(code, { transforms: ['jsx', 'imports'], jsxRuntime: 'automatic', production: true }).code;
  const module: { exports: any } = { exports: {} };
  const need = (name: string) => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsxRuntime;
    throw new Error(`The preview can only import from 'react', not '${name}'.`);
  };
  new Function('require', 'module', 'exports', js)(need, module, module.exports);
  const Component = module.exports.default;
  if (typeof Component !== 'function') throw new Error('The file needs a default export that is a component.');
  return Component;
}

export function LivePreview(props: { code: string; runKey: number }) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const root = React.useRef<Root | null>(null);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!ready) return;
    // Wait for a short pause in typing before running the code again.
    const timer = setTimeout(() => {
      const target = frame.current?.contentDocument?.getElementById('root');
      if (!target) return;
      try {
        const Component = build(props.code);
        if (!root.current) root.current = createRoot(target);
        setError('');
        root.current.render(
          <Boundary key={`${props.runKey}:${props.code}`} onError={setError}>
            <Component />
          </Boundary>,
        );
      } catch (err: any) {
        setError(String(err?.message ?? err).split('\n')[0]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [props.code, props.runKey, ready]);

  React.useEffect(
    () => () => {
      const old = root.current;
      root.current = null;
      // Unmount after the current render finishes, as React asks.
      if (old) setTimeout(() => old.unmount(), 0);
    },
    [],
  );

  return (
    <div className="stack" style={{ gap: 10 }}>
      <iframe ref={frame} className="preview-frame" title="Live preview" srcDoc={FRAME} onLoad={() => setReady(true)} />
      {error && <p className="note miss small" role="status"><b>The preview could not run this code.</b> {error}</p>}
    </div>
  );
}
