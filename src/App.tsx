import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { analyze, validateModel } from './engine/solver.ts';
import { cloneModel, examples, makeMember, makeNode } from './engine/examples.ts';
import { runBenchmarks } from './engine/benchmarks.ts';
import type { Analysis, Model, Support } from './engine/types.ts';
import FrameCanvas, { viewNames } from './components/FrameCanvas.tsx';
import type { Selection, View } from './components/FrameCanvas.tsx';
import { download, resultsCsv, slug } from './exports.ts';

const fmt = (n: number, digits = 2) =>
  Math.abs(n) < 1e-9
    ? '0.00'
    : n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const supportNames: Record<Support, string> = {
  free: 'Free',
  fixed: 'Fixed · X, Y, rotation',
  pin: 'Pinned · X, Y',
  rollerY: 'Roller · restrain Y',
  rollerX: 'Roller · restrain X',
};
const clone = cloneModel;
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    frame: (
      <>
        <path d="M4 19V5h16v14M4 5l16 14M1 21h6m10 0h6" />
        <circle cx="4" cy="19" r="1" />
        <circle cx="20" cy="19" r="1" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    undo: (
      <>
        <path d="M9 5 4 10l5 5M4 10h9a6 6 0 0 1 6 6" />
      </>
    ),
    redo: (
      <>
        <path d="m15 5 5 5-5 5m5-5h-9a6 6 0 0 0-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    compare: (
      <>
        <path d="M8 3v18m8-18v18M4 8h8m0 8h8" />
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    grid: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 10h16M10 4v16" />
      </>
    ),
    book: (
      <>
        <path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3ZM12 6v15" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.frame}
    </svg>
  );
}
function NumberField({
  label,
  value,
  unit,
  onChange,
  step = 'any',
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (n: number) => void;
  step?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {unit && <em>{unit}</em>}
      </span>
      <input
        type="number"
        aria-label={`${label}${unit ? ` (${unit})` : ''}`}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
    </label>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} onClose={onClose} aria-label={title}>
      <div className="modal-heading">
        <div>
          <span className="eyebrow">MODEL WORKSPACE</span>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={() => dialog.current?.close()}
          aria-label="Close model editor"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Comparison({
  baseline,
  result,
  onClear,
}: {
  baseline: { model: Model; result: Analysis };
  result: Analysis | null;
  onClear: () => void;
}) {
  const values = [
    {
      name: 'Peak displacement',
      unit: 'mm',
      old: baseline.result.maxDisplacement * 1000,
      now: result ? result.maxDisplacement * 1000 : null,
    },
    {
      name: 'Peak |moment|',
      unit: 'kN·m',
      old: baseline.result.maxMoment,
      now: result?.maxMoment ?? null,
    },
    {
      name: 'Peak |shear|',
      unit: 'kN',
      old: baseline.result.maxShear,
      now: result?.maxShear ?? null,
    },
  ];
  return (
    <section className="comparison">
      <div className="comparison-title">
        <Icon name="compare" />
        <div>
          <strong>One change. A new perspective.</strong>
          <p>Baseline: {baseline.model.name} · now edit your model</p>
        </div>
        <button className="text-button" onClick={onClear}>
          Clear baseline
        </button>
      </div>
      <div className="comparison-grid">
        {values.map((v) => (
          <div key={v.name}>
            <span>{v.name}</span>
            <p>
              {fmt(v.old)} <small>→</small> <strong>{v.now === null ? '—' : fmt(v.now)}</strong>{' '}
              <small>{v.unit}</small>
            </p>
            <em>
              {v.now === null
                ? 'Current model incomplete'
                : Math.abs(v.old) < 1e-9
                  ? 'Baseline is zero'
                  : `${(((v.now - v.old) / Math.abs(v.old)) * 100).toFixed(1)}% change`}
            </em>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [model, setModel] = useState<Model>(() => clone(examples[0].model));
  const [selected, setSelected] = useState<Selection>({ kind: 'member', id: 'M2' });
  const [view, setView] = useState<View>('deformed');
  const [page, setPage] = useState<'explore' | 'method' | 'validation'>('explore');
  const [loads, setLoads] = useState(true);
  const [defScale, setDefScale] = useState(40);
  const [baseline, setBaseline] = useState<{ model: Model; result: Analysis } | null>(null);
  const [editor, setEditor] = useState(false);
  const [notice, setNotice] = useState('');
  const [past, setPast] = useState<Model[]>([]),
    [future, setFuture] = useState<Model[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const computed = useMemo(() => {
    try {
      return { result: analyze(model), error: '' };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : 'Unable to analyze the model.',
      };
    }
  }, [model]);
  const { result, error } = computed;
  const benchmarks = useMemo(runBenchmarks, []);
  const member =
    selected.kind === 'member' ? model.members.find((m) => m.id === selected.id) : undefined;
  const node = selected.kind === 'node' ? model.nodes.find((n) => n.id === selected.id) : undefined;
  const memberResult = result?.members.find((m) => m.id === member?.id);
  const nodeResult = result?.nodes.find((n) => n.id === node?.id);

  function change(next: Model) {
    setPast((p) => [...p.slice(-49), clone(model)]);
    setFuture([]);
    setModel(next);
    setNotice('');
  }
  function mutate(fn: (next: Model) => void) {
    const next = clone(model);
    fn(next);
    change(next);
  }
  function updateMember(id: string, field: string, value: string | number) {
    mutate((m) => {
      m.members = m.members.map((x) => (x.id === id ? { ...x, [field]: value } : x));
    });
  }
  function updateNode(id: string, field: string, value: string | number) {
    mutate((m) => {
      m.nodes = m.nodes.map((x) => (x.id === id ? { ...x, [field]: value } : x));
    });
  }
  function undo() {
    if (!past.length) return;
    setFuture((f) => [clone(model), ...f]);
    setModel(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, clone(model)]);
    setModel(future[0]);
    setFuture((f) => f.slice(1));
  }
  function nextId(prefix: string, items: { id: string }[]) {
    let n = 1;
    while (items.some((i) => i.id === `${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  }
  function addNode() {
    if (model.nodes.length >= 50) return;
    const id = nextId('N', model.nodes);
    const finiteXs = model.nodes.map((n) => n.x).filter(Number.isFinite);
    mutate((m) => m.nodes.push(makeNode(id, Math.min(9999, Math.max(0, ...finiteXs) + 2), 0)));
    setSelected({ kind: 'node', id });
  }
  function addMember() {
    if (model.members.length >= 100) return;
    const pairs = new Set(model.members.map((m) => [m.start, m.end].sort().join(':')));
    for (const a of model.nodes)
      for (const b of model.nodes) {
        if (a.id !== b.id && !pairs.has([a.id, b.id].sort().join(':'))) {
          const id = nextId('M', model.members);
          mutate((m) => m.members.push(makeMember(id, a.id, b.id)));
          setSelected({ kind: 'member', id });
          return;
        }
      }
    setNotice('All node pairs already have members. Add a node first.');
  }
  async function importModel(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('Choose a model smaller than 1 MB.');
      const imported: unknown = JSON.parse(await file.text());
      validateModel(imported);
      change(clone(imported));
      setBaseline(null);
      setSelected({ kind: 'member', id: imported.members[0].id });
      setNotice('Model imported. All calculations run on this device.');
    } catch (e) {
      setNotice(`Import failed: ${e instanceof Error ? e.message : 'Invalid JSON'}`);
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  function loadExample(id: string) {
    const example = examples.find((e) => e.id === id);
    if (!example) return;
    change(clone(example.model));
    setBaseline(null);
    setSelected({
      kind: 'member',
      id: example.model.members.find((m) => m.q !== 0)?.id || example.model.members[0].id,
    });
  }
  const modelValid = useMemo(() => {
    try {
      validateModel(model);
      return true;
    } catch {
      return false;
    }
  }, [model]);

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage('explore');
            }}
            aria-label="FrameLab home"
          >
            <span className="brand-mark">
              <Icon name="frame" size={26} />
            </span>
            <strong>
              Frame<span>Lab</span>
            </strong>
            <span className="version">01</span>
          </a>
          <nav aria-label="Main navigation">
            {(['explore', 'method', 'validation'] as const).map((p) => (
              <button
                key={p}
                className={page === p ? 'nav-active' : ''}
                aria-current={page === p ? 'page' : undefined}
                onClick={() => setPage(p)}
              >
                {p === 'explore' ? 'The lab' : p === 'method' ? 'How it works' : 'Validation'}
              </button>
            ))}
          </nav>
          <div className="author">
            An independent project by{' '}
            <a
              href="https://www.linkedin.com/in/lokesh-kumar-xzis/"
              target="_blank"
              rel="noreferrer"
            >
              Lokesh Kumar <span>↗</span>
            </a>
          </div>
        </header>
        <main>
          <section className="intro">
            <div>
              <div className="eyebrow">
                <span className="small-line" /> STRUCTURAL BEHAVIOUR, MADE VISIBLE
              </div>
              <h1>
                Build intuition.
                <br className="mobile-break" /> <span>Follow the forces.</span>
              </h1>
              <p>A small change in your frame can change everything. Explore it.</p>
            </div>
            <div className="intro-note">
              <span className="status-dot" />
              <div>
                <strong>Your browser. Your workspace.</strong>
                <span>2D frames · linear elastic · kN + m</span>
              </div>
            </div>
          </section>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {page === 'explore' && (
            <>
              <div className="workspace-heading">
                <div>
                  <span className="eyebrow">EXPERIMENT 01</span>
                  <h2>{model.name || 'Untitled frame'}</h2>
                </div>
                <div className="actions">
                  <button className="secondary-button" onClick={() => fileInput.current?.click()}>
                    <Icon name="upload" /> Import
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!modelValid}
                    onClick={() =>
                      download(
                        `${slug(model.name)}.json`,
                        JSON.stringify(model, null, 2),
                        'application/json',
                      )
                    }
                  >
                    <Icon name="download" /> Save model
                  </button>
                  <button
                    className="primary-button"
                    disabled={!result}
                    onClick={() =>
                      result &&
                      setBaseline({ model: clone(model), result: structuredClone(result) })
                    }
                  >
                    <Icon name="compare" /> {baseline ? 'Replace baseline' : 'Capture baseline'}
                  </button>
                </div>
              </div>
              <div className="workspace">
                <aside className="inspector">
                  <div className="panel-heading">
                    <span>Model settings</span>
                    <Icon name="grid" size={17} />
                  </div>
                  <div className="inspector-body">
                    <label className="field">
                      <span>Start with an example</span>
                      <select
                        aria-label="Load an example"
                        value=""
                        onChange={(e) => loadExample(e.target.value)}
                      >
                        <option value="" disabled>
                          Choose a structure…
                        </option>
                        {examples.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="model-mini">
                      <span>{model.nodes.length} nodes</span>
                      <span>{model.members.length} members</span>
                      <button onClick={() => setEditor(true)}>Edit geometry ↗</button>
                    </div>
                    <div className="inspector-tabs" role="group" aria-label="Inspect entity type">
                      <button
                        className={selected.kind === 'member' ? 'active' : ''}
                        onClick={() =>
                          setSelected({ kind: 'member', id: model.members[0]?.id || '' })
                        }
                      >
                        Members
                      </button>
                      <button
                        className={selected.kind === 'node' ? 'active' : ''}
                        onClick={() => setSelected({ kind: 'node', id: model.nodes[0]?.id || '' })}
                      >
                        Nodes & loads
                      </button>
                    </div>
                    <label className="field">
                      <span>
                        {selected.kind === 'member' ? 'Selected member' : 'Selected node'}
                      </span>
                      <select
                        aria-label="Selected entity"
                        value={member?.id || node?.id || ''}
                        onChange={(e) => setSelected({ kind: selected.kind, id: e.target.value })}
                      >
                        <option value="" disabled>
                          Select an element
                        </option>
                        {(selected.kind === 'member' ? model.members : model.nodes).map((e) => (
                          <option key={e.id}>{e.id}</option>
                        ))}
                      </select>
                    </label>
                    {member && (
                      <>
                        <div className="connection-label">
                          <span>{member.start}</span>
                          <div />
                          <span>{member.end}</span>
                          <small>{memberResult ? `${fmt(memberResult.length)} m` : ''}</small>
                        </div>
                        <div className="section-label">SECTION PROPERTIES</div>
                        <NumberField
                          label="Elastic modulus"
                          unit="GPa"
                          value={member.e}
                          onChange={(v) => updateMember(member.id, 'e', v)}
                        />
                        <div className="field-pair">
                          <NumberField
                            label="Area"
                            unit="cm²"
                            value={member.a}
                            onChange={(v) => updateMember(member.id, 'a', v)}
                          />
                          <NumberField
                            label="Inertia"
                            unit="cm⁴"
                            value={member.i}
                            onChange={(v) => updateMember(member.id, 'i', v)}
                          />
                        </div>
                        <div className="section-label">MEMBER LOAD</div>
                        <NumberField
                          label="Uniform load"
                          unit="kN/m"
                          value={member.q}
                          onChange={(v) => updateMember(member.id, 'q', v)}
                        />
                        <p className="field-help">
                          Along local y. For a left-to-right horizontal member, a negative value
                          acts downwards.
                        </p>
                      </>
                    )}
                    {node && (
                      <>
                        <div className="field-pair">
                          <NumberField
                            label="X coordinate"
                            unit="m"
                            value={node.x}
                            onChange={(v) => updateNode(node.id, 'x', v)}
                          />
                          <NumberField
                            label="Y coordinate"
                            unit="m"
                            value={node.y}
                            onChange={(v) => updateNode(node.id, 'y', v)}
                          />
                        </div>
                        <label className="field">
                          <span>Support condition</span>
                          <select
                            aria-label="Support condition"
                            value={node.support}
                            onChange={(e) => updateNode(node.id, 'support', e.target.value)}
                          >
                            {Object.entries(supportNames).map(([value, name]) => (
                              <option key={value} value={value}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="section-label">NODAL LOADS · GLOBAL AXES</div>
                        <div className="field-pair">
                          <NumberField
                            label="Force X"
                            unit="kN"
                            value={node.fx}
                            onChange={(v) => updateNode(node.id, 'fx', v)}
                          />
                          <NumberField
                            label="Force Y"
                            unit="kN"
                            value={node.fy}
                            onChange={(v) => updateNode(node.id, 'fy', v)}
                          />
                        </div>
                        <NumberField
                          label="Moment Z"
                          unit="kN·m"
                          value={node.mz}
                          onChange={(v) => updateNode(node.id, 'mz', v)}
                        />
                        <p className="field-help">
                          +X right · +Y up · +moment counterclockwise. All connected members share
                          the node rotation.
                        </p>
                      </>
                    )}
                    <button className="wide-button" onClick={() => setEditor(true)}>
                      <Icon name="plus" size={16} /> Add nodes & members
                    </button>
                  </div>
                  <div className="inspector-footer">
                    <Icon name="book" size={17} />
                    <span>Curious about the calculations?</span>
                    <button
                      aria-label="Read the calculation method"
                      onClick={() => setPage('method')}
                    >
                      ↗
                    </button>
                  </div>
                </aside>
                <section className="canvas-panel" aria-label="Structural model">
                  <div className="canvas-toolbar">
                    <div className="view-switch" role="group" aria-label="Diagram view">
                      {(['model', 'deformed', 'moment', 'shear', 'axial'] as View[]).map((v) => (
                        <button
                          key={v}
                          aria-pressed={view === v}
                          onClick={() => setView(v)}
                          className={view === v ? 'active' : ''}
                        >
                          {v === 'model'
                            ? 'Model'
                            : v === 'deformed'
                              ? 'Deflection'
                              : v === 'moment'
                                ? 'Moment'
                                : v === 'shear'
                                  ? 'Shear'
                                  : 'Axial'}
                        </button>
                      ))}
                    </div>
                    <div className="history-buttons">
                      <button
                        className="icon-button"
                        aria-label="Undo change"
                        disabled={!past.length}
                        onClick={undo}
                      >
                        <Icon name="undo" size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Redo change"
                        disabled={!future.length}
                        onClick={redo}
                      >
                        <Icon name="redo" size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="canvas-topline">
                    <span>
                      <i className={`legend-dot ${view}`} />
                      {viewNames[view]}
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        checked={loads}
                        onChange={(e) => setLoads(e.target.checked)}
                      />{' '}
                      Show loads
                    </label>
                  </div>
                  <div className="canvas-wrap">
                    <FrameCanvas
                      model={model}
                      result={result}
                      view={view}
                      selected={selected}
                      onSelect={setSelected}
                      showLoads={loads}
                      deformationScale={defScale}
                    />
                  </div>
                  {view === 'deformed' && (
                    <div className="amplification">
                      <span>Deformation scale</span>
                      <input
                        aria-label="Deformation scale"
                        type="range"
                        min="1"
                        max="200"
                        step="1"
                        value={defScale}
                        onChange={(e) => setDefScale(Number(e.target.value))}
                      />
                      <strong>×{defScale}</strong>
                    </div>
                  )}
                  <div className="canvas-status">
                    <span className={error ? 'error-dot' : 'status-dot'} />
                    <strong>{error ? 'Review model' : 'Analysis up to date'}</strong>
                    <span>
                      {result
                        ? `${result.freeDofs} free degrees of freedom`
                        : 'Results withheld until the model is valid'}
                    </span>
                  </div>
                  {error && (
                    <div className="analysis-error" role="alert">
                      {error}
                    </div>
                  )}
                </section>
                <aside className="results-panel">
                  <div className="panel-heading">
                    <span>The response</span>
                    <span className="live-label">LIVE</span>
                  </div>
                  <div className="metrics">
                    <div className="metric primary-metric">
                      <span>
                        Peak displacement <small>↗</small>
                      </span>
                      <p>
                        {result ? fmt(result.maxDisplacement * 1000) : '—'} <em>mm</em>
                      </p>
                      <small>Along all members · sampled</small>
                    </div>
                    <div className="metric">
                      <span>Peak bending moment</span>
                      <p>
                        {result ? fmt(result.maxMoment) : '—'} <em>kN·m</em>
                      </p>
                      <small>Maximum absolute value</small>
                    </div>
                    <div className="metric">
                      <span>Peak shear force</span>
                      <p>
                        {result ? fmt(result.maxShear) : '—'} <em>kN</em>
                      </p>
                    </div>
                  </div>
                  <div className="reactions">
                    <div className="section-label">SUPPORT REACTIONS</div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Node</th>
                            <th>
                              Rx <small>kN</small>
                            </th>
                            <th>
                              Ry <small>kN</small>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {result?.nodes
                            .filter(
                              (n) => model.nodes.find((m) => m.id === n.id)?.support !== 'free',
                            )
                            .map((n) => (
                              <tr key={n.id}>
                                <td>
                                  <button onClick={() => setSelected({ kind: 'node', id: n.id })}>
                                    {n.id}
                                  </button>
                                </td>
                                <td>{fmt(n.rx)}</td>
                                <td>{fmt(n.ry)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="field-help">
                      Select a support to inspect its moment and displacement below.
                    </p>
                  </div>
                  <div className="results-actions">
                    <button
                      className="wide-button"
                      disabled={!result}
                      onClick={() =>
                        result &&
                        download(
                          `${slug(model.name)}-results.csv`,
                          resultsCsv(model, result),
                          'text/csv;charset=utf-8',
                        )
                      }
                    >
                      <Icon name="download" size={16} /> Export results CSV
                    </button>
                    <button
                      className="text-button"
                      disabled={!result}
                      onClick={() => window.print()}
                    >
                      Print calculation report ↗
                    </button>
                  </div>
                </aside>
              </div>
              {result?.warnings.map((w) => (
                <div className="warning" key={w}>
                  {w}
                </div>
              ))}
              {baseline && (
                <Comparison baseline={baseline} result={result} onClear={() => setBaseline(null)} />
              )}
              <div className="below-workspace">
                <section className="detail-card">
                  <div className="section-label">INSIDE THE ELEMENT</div>
                  <h3>
                    {member
                      ? `${member.id} · Member response`
                      : node
                        ? `${node.id} · Node response`
                        : 'Select a node or member'}
                  </h3>
                  {memberResult && (
                    <div className="detail-values">
                      <div>
                        <span>Axial force · tension +</span>
                        <strong>
                          {fmt(memberResult.samples[0].n)} <small>kN</small>
                        </strong>
                      </div>
                      <div>
                        <span>Start moment</span>
                        <strong>
                          {fmt(memberResult.samples[0].moment)} <small>kN·m</small>
                        </strong>
                      </div>
                      <div>
                        <span>End moment</span>
                        <strong>
                          {fmt(memberResult.samples[100].moment)} <small>kN·m</small>
                        </strong>
                      </div>
                    </div>
                  )}
                  {nodeResult && (
                    <div className="detail-values">
                      <div>
                        <span>Displacement X / Y</span>
                        <strong>
                          {fmt(nodeResult.ux * 1000)} / {fmt(nodeResult.uy * 1000)}{' '}
                          <small>mm</small>
                        </strong>
                      </div>
                      <div>
                        <span>Rotation</span>
                        <strong>
                          {fmt(nodeResult.rz * 1000, 3)} <small>mrad</small>
                        </strong>
                      </div>
                      <div>
                        <span>Reaction moment</span>
                        <strong>
                          {fmt(nodeResult.rm)} <small>kN·m</small>
                        </strong>
                      </div>
                    </div>
                  )}
                  {!result && <p>Resolve the model issue to see calculated results.</p>}
                </section>
                <section className="experiment-card">
                  <span className="experiment-number">↗</span>
                  <div>
                    <span className="section-label">TRY A SMALL EXPERIMENT</span>
                    <h3>What does twice the stiffness do?</h3>
                    <p>
                      Capture a baseline. Double the selected member’s inertia. Watch how the frame
                      shares the load.
                    </p>
                  </div>
                </section>
              </div>
            </>
          )}
          {page === 'method' && (
            <section className="info-page">
              <div className="info-intro">
                <span className="eyebrow">THE MATH IS PART OF THE PRODUCT</span>
                <h2>From a frame to a system of equations.</h2>
                <p>
                  FrameLab assembles a direct-stiffness model with three degrees of freedom at each
                  node: horizontal displacement, vertical displacement, and rotation.
                </p>
              </div>
              <div className="method-grid">
                <article>
                  <span className="step">01</span>
                  <h3>Define the element</h3>
                  <p>
                    Each member is a prismatic, linear elastic Euler–Bernoulli beam. E, A, I and
                    length define its 6 × 6 local stiffness matrix. All joints are rigid; a pinned
                    support releases the ground rotation, not the connections between members.
                  </p>
                  <code>EA/L · 12EI/L³ · 6EI/L² · 4EI/L</code>
                </article>
                <article>
                  <span className="step">02</span>
                  <h3>Assemble & constrain</h3>
                  <p>
                    Transform each element to global axes and assemble the global matrix. Uniform
                    transverse loads become consistent nodal forces and moments. Remove restrained
                    degrees of freedom.
                  </p>
                  <code>K = Σ TᵀkT &nbsp; · &nbsp; Kff uf = Ff</code>
                </article>
                <article>
                  <span className="step">03</span>
                  <h3>Solve & recover</h3>
                  <p>
                    A scaled, partial-pivot solve gives nodal displacement. Recover reactions and
                    local end forces. Member deflection includes the exact uniform-load correction
                    between nodes.
                  </p>
                  <code>R = Ku − F &nbsp; · &nbsp; flocal = klocal ulocal − feq</code>
                </article>
              </div>
              <div className="method-bottom">
                <article>
                  <h3>Conventions you can inspect</h3>
                  <ul>
                    <li>Geometry: m. Loads: kN and kN·m. Displayed deflections: mm.</li>
                    <li>Input E: GPa; A: cm²; I: cm⁴. Converted internally to kN and m.</li>
                    <li>
                      Local x points from the member start to end. Local y is 90° counterclockwise
                      from local x.
                    </li>
                    <li>
                      Axial force is positive in tension. Positive bending moment is sagging.
                      Diagrams plot positive values toward local +y.
                    </li>
                    <li>
                      Peak moment is found from endpoints and zero shear. Peak displacement is
                      sampled at 101 positions per member.
                    </li>
                  </ul>
                </article>
                <article>
                  <h3>A deliberately bounded first release</h3>
                  <p>
                    For learning and preliminary behaviour exploration. The model assumes small
                    displacements, small rotations and constant member properties.
                  </p>
                  <p>
                    It excludes shear deformation, joint releases, settlements, geometric
                    nonlinearity, buckling, capacity checks and design-code compliance. It does not
                    establish structural adequacy.
                  </p>
                  <p>
                    Use nodes to introduce point loads within a member. Split that member into two
                    connected members.
                  </p>
                </article>
              </div>
              <details className="matrix-details">
                <summary>Inspect the current model’s assembled matrix and load vector</summary>
                {result ? (
                  <>
                    <p>
                      DOF order: {model.nodes.map((n) => `${n.id}[ux, uy, rz]`).join(' → ')}. Mixed
                      stiffness units follow kN, m and rad.
                    </p>
                    <div className="table-scroll">
                      <table className="matrix">
                        <tbody>
                          {result.stiffness.map((row, i) => (
                            <tr key={i}>
                              <th>{i + 1}</th>
                              {row.map((v, j) => (
                                <td key={j}>{Math.abs(v) < 1e-10 ? '0' : v.toExponential(2)}</td>
                              ))}
                              <td className="load-column">{result.loads[i].toExponential(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p>
                      Free-DOF relative residual: {result.relativeResidual.toExponential(3)}. Global
                      equilibrium residuals: Fx {result.equilibrium.fx.toExponential(3)} kN, Fy{' '}
                      {result.equilibrium.fy.toExponential(3)} kN, Mz{' '}
                      {result.equilibrium.mz.toExponential(3)} kN·m.
                    </p>
                  </>
                ) : (
                  <p>{error}</p>
                )}
              </details>
            </section>
          )}
          {page === 'validation' && (
            <section className="info-page">
              <div className="info-intro">
                <span className="eyebrow">EVIDENCE BEFORE CONFIDENCE</span>
                <h2>Calculations with a reference point.</h2>
                <p>
                  These benchmarks run the same solver used in the workspace, right here in your
                  browser. Each result is compared with a closed-form analytical solution.
                </p>
              </div>
              <div className="validation-banner">
                <Icon name="check" size={30} />
                <div>
                  <strong>
                    {benchmarks.filter((b) => b.relativeError < 1e-8).length} / {benchmarks.length}{' '}
                    live benchmarks passing
                  </strong>
                  <span>
                    Relative tolerance: 10⁻⁸ · steel E = 200 GPa · A = 60 cm² · I = 8,000 cm⁴
                  </span>
                </div>
              </div>
              <div className="table-scroll benchmark-table">
                <table>
                  <thead>
                    <tr>
                      <th>Benchmark</th>
                      <th>Reference</th>
                      <th>Expected</th>
                      <th>Calculated</th>
                      <th>Relative error</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarks.map((b) => (
                      <tr key={b.name}>
                        <td>{b.name}</td>
                        <td>
                          <code>{b.expression}</code>
                        </td>
                        <td>
                          {fmt(b.expected, 6)} {b.unit}
                        </td>
                        <td>
                          {fmt(b.actual, 6)} {b.unit}
                        </td>
                        <td>{b.relativeError.toExponential(2)}</td>
                        <td>
                          <span className={b.relativeError < 1e-8 ? 'pass' : 'fail'}>
                            {b.relativeError < 1e-8 ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="method-bottom">
                <article>
                  <h3>Beyond the happy path</h3>
                  <p>
                    The repository also tests load reversal, rotated geometry, mesh refinement,
                    scaling, equilibrium, support reactions and unstable structures. Invalid inputs
                    and mechanisms produce an explicit error instead of plausible-looking results.
                  </p>
                  <p>
                    Full test commands and independent cross-check instructions are included in the
                    repository.
                  </p>
                </article>
                <article>
                  <h3>What this evidence means</h3>
                  <p>
                    These tests verify specific behaviours within the stated linear model. They do
                    not certify the software for design or verify every possible input.
                  </p>
                  <p>
                    The repository includes independent PyniteFEA 3.2.0 reference results for all
                    four examples, checking nodal displacements, rotations and reactions.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => {
                      loadExample('beam');
                      setPage('explore');
                    }}
                  >
                    Explore the benchmark beam <Icon name="arrow" />
                  </button>
                </article>
              </div>
            </section>
          )}
        </main>
        <footer>
          <span className="footer-brand">
            <Icon name="frame" size={17} /> FrameLab <span> / </span> An open engineering
            experiment.
          </span>
          <span>
            Original project · Lokesh Kumar <span className="footer-divider">|</span> v1.0 ·
            Learning & exploration
          </span>
        </footer>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => void importModel(e.target.files?.[0])}
      />
      {editor && (
        <Modal title="Shape your structure" onClose={() => setEditor(false)}>
          <label className="field model-name">
            <span>Model name</span>
            <input
              aria-label="Model name"
              maxLength={100}
              value={model.name}
              onChange={(e) =>
                mutate((m) => {
                  m.name = e.target.value;
                })
              }
            />
          </label>
          <div className="editor-section">
            <h3>
              Nodes <small>Global coordinates in metres</small>
            </h3>
            <button
              className="secondary-button"
              disabled={model.nodes.length >= 50}
              onClick={addNode}
            >
              <Icon name="plus" size={15} /> Add node
            </button>
          </div>
          <div className="table-scroll">
            <table className="editor-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>X · m</th>
                  <th>Y · m</th>
                  <th>Support</th>
                  <th>Fx · kN</th>
                  <th>Fy · kN</th>
                  <th>Mz · kN·m</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {model.nodes.map((n) => (
                  <tr key={n.id}>
                    <th>{n.id}</th>
                    {(['x', 'y'] as const).map((k) => (
                      <td key={k}>
                        <input
                          type="number"
                          step="any"
                          aria-label={`${n.id} ${k}`}
                          value={Number.isFinite(n[k]) ? n[k] : ''}
                          onChange={(e) =>
                            updateNode(
                              n.id,
                              k,
                              e.target.value === '' ? NaN : Number(e.target.value),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <select
                        aria-label={`${n.id} support`}
                        value={n.support}
                        onChange={(e) => updateNode(n.id, 'support', e.target.value)}
                      >
                        {Object.entries(supportNames).map(([v, name]) => (
                          <option key={v} value={v}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {(['fx', 'fy', 'mz'] as const).map((k) => (
                      <td key={k}>
                        <input
                          type="number"
                          step="any"
                          aria-label={`${n.id} ${k}`}
                          value={Number.isFinite(n[k]) ? n[k] : ''}
                          onChange={(e) =>
                            updateNode(
                              n.id,
                              k,
                              e.target.value === '' ? NaN : Number(e.target.value),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="icon-button remove"
                        aria-label={`Remove node ${n.id} and connected members`}
                        onClick={() =>
                          mutate((m) => {
                            m.nodes = m.nodes.filter((x) => x.id !== n.id);
                            m.members = m.members.filter((x) => x.start !== n.id && x.end !== n.id);
                          })
                        }
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="editor-section">
            <h3>
              Members <small>Rigid joints · local transverse loads</small>
            </h3>
            <button
              className="secondary-button"
              disabled={model.nodes.length < 2 || model.members.length >= 100}
              onClick={addMember}
            >
              <Icon name="plus" size={15} /> Add member
            </button>
          </div>
          <div className="table-scroll">
            <table className="editor-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>E · GPa</th>
                  <th>A · cm²</th>
                  <th>I · cm⁴</th>
                  <th>q · kN/m</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {model.members.map((m) => (
                  <tr key={m.id}>
                    <th>{m.id}</th>
                    {(['start', 'end'] as const).map((k) => (
                      <td key={k}>
                        <select
                          aria-label={`${m.id} ${k}`}
                          value={m[k]}
                          onChange={(e) => updateMember(m.id, k, e.target.value)}
                        >
                          {model.nodes.map((n) => (
                            <option key={n.id}>{n.id}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                    {(['e', 'a', 'i', 'q'] as const).map((k) => (
                      <td key={k}>
                        <input
                          type="number"
                          step="any"
                          aria-label={`${m.id} ${k}`}
                          value={Number.isFinite(m[k]) ? m[k] : ''}
                          onChange={(e) =>
                            updateMember(
                              m.id,
                              k,
                              e.target.value === '' ? NaN : Number(e.target.value),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="icon-button remove"
                        aria-label={`Remove member ${m.id}`}
                        onClick={() =>
                          mutate((next) => {
                            next.members = next.members.filter((x) => x.id !== m.id);
                          })
                        }
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && (
            <div className="analysis-error" role="alert">
              {error}
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          <div className="modal-footer">
            <span>Changes apply immediately. Undo is available in the workspace.</span>
            <button className="primary-button" onClick={() => setEditor(false)}>
              Back to the lab <Icon name="arrow" />
            </button>
          </div>
        </Modal>
      )}
      <section className="print-report">
        <h1>FrameLab · Calculation report</h1>
        <p>
          Independent project by Lokesh Kumar · Version 1.0 ·{' '}
          {new Date().toLocaleDateString('en-GB')}
        </p>
        <h2>{model.name}</h2>
        <p>
          Linear elastic, small-displacement 2D Euler–Bernoulli frame. Prismatic members, rigid
          joints. No capacity, buckling or code-compliance checks.
        </p>
        {result && (
          <>
            <FrameCanvas
              model={model}
              result={result}
              view="deformed"
              selected={{ kind: 'member', id: '' }}
              onSelect={() => {}}
              showLoads
              deformationScale={defScale}
            />
            <h3>Inputs · nodes</h3>
            <table>
              <thead>
                <tr>
                  <th>Node</th>
                  <th>X / Y (m)</th>
                  <th>Support</th>
                  <th>Fx / Fy (kN)</th>
                  <th>Mz (kN·m)</th>
                </tr>
              </thead>
              <tbody>
                {model.nodes.map((n) => (
                  <tr key={n.id}>
                    <td>{n.id}</td>
                    <td>
                      {n.x} / {n.y}
                    </td>
                    <td>{n.support}</td>
                    <td>
                      {n.fx} / {n.fy}
                    </td>
                    <td>{n.mz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Inputs · members</h3>
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Start → End</th>
                  <th>E (GPa)</th>
                  <th>A (cm²)</th>
                  <th>I (cm⁴)</th>
                  <th>q (kN/m)</th>
                </tr>
              </thead>
              <tbody>
                {model.members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>
                      {m.start} → {m.end}
                    </td>
                    <td>{m.e}</td>
                    <td>{m.a}</td>
                    <td>{m.i}</td>
                    <td>{m.q}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Calculated response</h3>
            <p>
              Peak sampled displacement: {fmt(result.maxDisplacement * 1000, 4)} mm. Peak |moment|:{' '}
              {fmt(result.maxMoment, 4)} kN·m. Peak |shear|: {fmt(result.maxShear, 4)} kN.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Node</th>
                  <th>ux / uy (mm)</th>
                  <th>θ (rad)</th>
                  <th>Rx / Ry (kN)</th>
                  <th>Mz (kN·m)</th>
                </tr>
              </thead>
              <tbody>
                {result.nodes.map((n) => (
                  <tr key={n.id}>
                    <td>{n.id}</td>
                    <td>
                      {fmt(n.ux * 1000, 4)} / {fmt(n.uy * 1000, 4)}
                    </td>
                    <td>{n.rz.toPrecision(6)}</td>
                    <td>
                      {fmt(n.rx, 4)} / {fmt(n.ry, 4)}
                    </td>
                    <td>{fmt(n.rm, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Free-DOF relative residual: {result.relativeResidual.toExponential(3)}.</p>
            {result.warnings.map((w) => (
              <p key={w}>Warning: {w}</p>
            ))}
            <p>
              Local x follows start → end. Local +y is 90° counterclockwise. Positive nodal moments
              are counterclockwise. Uniform loads act in local y. Deflection is amplified ×
              {defScale} in the illustration; displayed magnitudes are actual values. Displacement
              peaks are sampled at 101 positions per member.
            </p>
          </>
        )}
      </section>
    </>
  );
}
