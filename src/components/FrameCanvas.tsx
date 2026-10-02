import type { Analysis, Model, Support } from '../engine/types.ts';
export type View = 'model' | 'deformed' | 'moment' | 'shear' | 'axial';
export type Selection = { kind: 'node' | 'member'; id: string };
interface Props {
  model: Model;
  result: Analysis | null;
  view: View;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  showLoads: boolean;
  deformationScale: number;
}
export const viewNames: Record<View, string> = {
  model: 'Geometry',
  deformed: 'Deflection',
  moment: 'Bending moment',
  shear: 'Shear force',
  axial: 'Axial force',
};

function SupportSymbol({ type, x, y }: { type: Support; x: number; y: number }) {
  if (type === 'free') return null;
  if (type === 'fixed')
    return (
      <g transform={`translate(${x},${y})`} className="support-symbol">
        <path d="M-18 7H18" strokeWidth="3" />
        {[-15, -7, 1, 9, 17].map((n) => (
          <path key={n} d={`M${n} 7l-7 9`} />
        ))}
      </g>
    );
  return (
    <g
      transform={`translate(${x},${y}) rotate(${type === 'rollerX' ? -90 : 0})`}
      className="support-symbol"
    >
      <path d="M0 6L-12 24H12Z" fill="#f9faf5" />
      {type !== 'pin' && (
        <>
          <circle cx="-7" cy="29" r="3" />
          <circle cx="7" cy="29" r="3" />
        </>
      )}
      <path d={`M-18 ${type === 'pin' ? 28 : 35}H18`} />
    </g>
  );
}

export default function FrameCanvas({
  model,
  result,
  view,
  selected,
  onSelect,
  showLoads,
  deformationScale,
}: Props) {
  const safeNodes = model.nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  const minX = Math.min(0, ...safeNodes.map((n) => n.x)),
    maxX = Math.max(1, ...safeNodes.map((n) => n.x));
  const minY = Math.min(0, ...safeNodes.map((n) => n.y)),
    maxY = Math.max(1, ...safeNodes.map((n) => n.y));
  const scale = Math.min(500 / Math.max(maxX - minX, 1), 290 / Math.max(maxY - minY, 1));
  const ox = 370 - ((maxX + minX) * scale) / 2,
    oy = 265 + ((maxY + minY) * scale) / 2;
  const point = (x: number, y: number) => [ox + x * scale, oy - y * scale];
  const [ax, ay] = [70, 450];
  const max = result
    ? view === 'moment'
      ? result.maxMoment
      : view === 'shear'
        ? result.maxShear
        : result.maxAxial
    : 0;
  const diagramScale = max > 1e-12 ? 58 / max : 0;
  const colors = {
    moment: '#bf6a36',
    shear: '#426cbb',
    axial: '#90649c',
    deformed: '#17836e',
    model: '#143e38',
  };
  const pathFrom = (points: number[][]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');
  return (
    <svg
      className="frame-canvas"
      viewBox="0 0 740 510"
      role="img"
      aria-label={`${viewNames[view]} diagram. Select a node or member to edit it.`}
    >
      <defs>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.85" fill="#cdd5cd" />
        </pattern>
        <marker id="load-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0 0L7 3.5L0 7Z" fill="#cb6b35" />
        </marker>
        <marker id="axis-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0 0L6 3L0 6Z" fill="#87948a" />
        </marker>
      </defs>
      <rect width="740" height="510" fill="url(#dots)" />
      <g className="axis">
        <path
          d={`M${ax} ${ay - 35}V${ay}H${ax + 40}`}
          fill="none"
          stroke="#87948a"
          markerEnd="url(#axis-arrow)"
        />
        <path d={`M${ax} ${ay}V${ay - 35}`} stroke="#87948a" markerEnd="url(#axis-arrow)" />
        <text x={ax + 45} y={ay + 4}>
          X
        </text>
        <text x={ax - 4} y={ay - 43}>
          Y
        </text>
        <text x={ax + 65} y={ay + 4} className="canvas-note">
          m · global axes
        </text>
      </g>
      {model.members.map((member) => {
        const a = safeNodes.find((n) => n.id === member.start),
          b = safeNodes.find((n) => n.id === member.end);
        if (!a || !b) return null;
        const pa = point(a.x, a.y),
          pb = point(b.x, b.y);
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        if (l < 1e-6) return null;
        const c = (b.x - a.x) / l,
          s = (b.y - a.y) / l;
        const r = result?.members.find((m) => m.id === member.id);
        const active = selected.kind === 'member' && selected.id === member.id;
        const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
        let curve: number[][] = [];
        if (r && view === 'deformed')
          curve = r.samples.map((p) =>
            point(
              a.x + c * p.x + (c * p.u - s * p.v) * deformationScale,
              a.y + s * p.x + (s * p.u + c * p.v) * deformationScale,
            ),
          );
        if (r && (view === 'moment' || view === 'shear' || view === 'axial'))
          curve = r.samples.map((p) => {
            const base = point(a.x + c * p.x, a.y + s * p.x);
            const value = view === 'moment' ? p.moment : view === 'shear' ? p.shear : p.n;
            return [base[0] - s * value * diagramScale, base[1] - c * value * diagramScale];
          });
        return (
          <g key={member.id}>
            {curve.length > 0 && (
              <>
                {view !== 'deformed' && (
                  <path
                    d={`${pathFrom([pa, ...curve, pb])}Z`}
                    fill={colors[view]}
                    fillOpacity="0.14"
                  />
                )}
                <path d={pathFrom(curve)} stroke={colors[view]} strokeWidth="2.5" fill="none" />
              </>
            )}
            <line
              x1={pa[0]}
              y1={pa[1]}
              x2={pb[0]}
              y2={pb[1]}
              stroke={active ? '#143e38' : '#6f817b'}
              strokeWidth={active ? 5 : 3.5}
              strokeDasharray={view === 'deformed' ? '7 5' : undefined}
              opacity={view === 'deformed' ? 0.5 : 1}
            />
            <line
              x1={pa[0]}
              y1={pa[1]}
              x2={pb[0]}
              y2={pb[1]}
              stroke="transparent"
              strokeWidth="24"
              className="canvas-hit"
              role="button"
              aria-label={`Select member ${member.id}`}
              tabIndex={0}
              onClick={() => onSelect({ kind: 'member', id: member.id })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect({ kind: 'member', id: member.id });
                }
              }}
            />
            <g
              className="member-label"
              transform={`translate(${mid[0] + (Math.abs(c) < 0.5 ? 26 : 0)},${mid[1] + (Math.abs(c) < 0.5 ? 0 : 24)})`}
              pointerEvents="none"
            >
              <rect x="-23" y="-12" width="46" height="23" rx="5" />
              <text textAnchor="middle" dy="4">
                {member.id}
              </text>
            </g>
            {view === 'model' && (
              <text
                x={mid[0] - s * 36}
                y={mid[1] - c * 26}
                textAnchor="middle"
                className="dimension"
              >
                {l.toFixed(2)} m
              </text>
            )}
            {showLoads && member.q !== 0 && Number.isFinite(member.q) && (
              <g className="load-graphic">
                {Array.from({ length: 7 }, (_, i) => {
                  const t = (i + 0.5) / 7,
                    px = pa[0] + t * (pb[0] - pa[0]),
                    py = pa[1] + t * (pb[1] - pa[1]);
                  const direction = Math.sign(member.q);
                  return (
                    <line
                      key={i}
                      x1={px + s * direction * 40}
                      y1={py + c * direction * 40}
                      x2={px + s * direction * 10}
                      y2={py + c * direction * 10}
                      markerEnd="url(#load-arrow)"
                    />
                  );
                })}
                <text
                  x={mid[0] + s * Math.sign(member.q) * 58}
                  y={mid[1] + c * Math.sign(member.q) * 58}
                  textAnchor="middle"
                >
                  {member.q} kN/m
                </text>
              </g>
            )}
          </g>
        );
      })}
      {safeNodes.map((n) => {
        const [x, y] = point(n.x, n.y),
          active = selected.kind === 'node' && selected.id === n.id;
        return (
          <g key={n.id}>
            <SupportSymbol type={n.support} x={x} y={y} />
            {active && <circle cx={x} cy={y} r="14" fill="#d8e6ac" />}
            <circle cx={x} cy={y} r="6" fill="#fdfefb" stroke="#143e38" strokeWidth="2.5" />
            <circle
              cx={x}
              cy={y}
              r="15"
              fill="transparent"
              className="canvas-hit"
              role="button"
              tabIndex={0}
              aria-label={`Select node ${n.id}`}
              onClick={() => onSelect({ kind: 'node', id: n.id })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect({ kind: 'node', id: n.id });
                }
              }}
            />
            <text x={x - 19} y={y - 13} className="node-label">
              {n.id}
            </text>
            {showLoads && n.fx !== 0 && Number.isFinite(n.fx) && (
              <g className="load-graphic">
                <line
                  x1={x - Math.sign(n.fx) * 78}
                  y1={y}
                  x2={x - Math.sign(n.fx) * 14}
                  y2={y}
                  markerEnd="url(#load-arrow)"
                />
                <text x={x - Math.sign(n.fx) * 50} y={y - 11} textAnchor="middle">
                  {n.fx} kN
                </text>
              </g>
            )}
            {showLoads && n.fy !== 0 && Number.isFinite(n.fy) && (
              <g className="load-graphic">
                <line
                  x1={x}
                  y1={y + Math.sign(n.fy) * 72}
                  x2={x}
                  y2={y + Math.sign(n.fy) * 14}
                  markerEnd="url(#load-arrow)"
                />
                <text x={x + 10} y={y + Math.sign(n.fy) * 62}>
                  {n.fy} kN
                </text>
              </g>
            )}
            {showLoads && n.mz !== 0 && Number.isFinite(n.mz) && (
              <g className="load-graphic">
                <path
                  d={
                    n.mz > 0
                      ? `M${x + 22} ${y + 13}A26 26 0 1 0 ${x - 23} ${y + 12}`
                      : `M${x - 23} ${y + 12}A26 26 0 1 1 ${x + 22} ${y + 13}`
                  }
                  fill="none"
                  markerEnd="url(#load-arrow)"
                />
                <text x={x + 30} y={y - 20}>
                  {n.mz} kN·m
                </text>
              </g>
            )}
          </g>
        );
      })}
      <text x="670" y="473" textAnchor="end" className="canvas-note">
        {view === 'deformed'
          ? `Deflection amplified ×${deformationScale}`
          : view === 'model'
            ? 'Click a node or member to edit'
            : 'Positive plotted on local +y side'}
      </text>
    </svg>
  );
}
