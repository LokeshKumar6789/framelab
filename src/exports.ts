import type { Analysis, Model } from './engine/types.ts';

export function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'framelab-model';
export function resultsCsv(model: Model, result: Analysis) {
  const lines: (string | number)[][] = [
    ['FrameLab v1 — linear elastic 2D analysis'],
    ['Node', 'ux_mm', 'uy_mm', 'rotation_rad', 'Rx_kN', 'Ry_kN', 'Mz_kNm'],
    ...result.nodes.map((n) => [n.id, n.ux * 1000, n.uy * 1000, n.rz, n.rx, n.ry, n.rm]),
    [],
    [
      'Member',
      'x_m',
      'u_local_mm',
      'v_local_mm',
      'N_kN_tension_positive',
      'V_kN',
      'M_kNm_sagging_positive',
    ],
    ...result.members.flatMap((m) =>
      m.samples.map((s) => [m.id, s.x, s.u * 1000, s.v * 1000, s.n, s.shear, s.moment]),
    ),
    [],
    ['Equilibrium residual', 'Fx_kN', 'Fy_kN', 'Mz_kNm'],
    ['sum', result.equilibrium.fx, result.equilibrium.fy, result.equilibrium.mz],
    [],
    ['Input node', 'x_m', 'y_m', 'support', 'Fx_kN', 'Fy_kN', 'Mz_kNm'],
    ...model.nodes.map((n) => [n.id, n.x, n.y, n.support, n.fx, n.fy, n.mz]),
    [],
    ['Input member', 'start', 'end', 'E_GPa', 'A_cm2', 'I_cm4', 'q_local_y_kN_per_m'],
    ...model.members.map((m) => [m.id, m.start, m.end, m.e, m.a, m.i, m.q]),
    [],
    [
      'Scope',
      'Small-displacement Euler-Bernoulli; rigid joints; no capacity, buckling, shear deformation or design-code checks.',
    ],
    ...result.warnings.map((w) => ['Warning', w]),
  ];
  return lines
    .map((row) =>
      row
        .map((v) => (typeof v === 'number' ? v.toPrecision(12) : `"${v.replace(/"/g, '""')}"`))
        .join(','),
    )
    .join('\r\n');
}
