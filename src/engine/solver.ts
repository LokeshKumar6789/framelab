import type { Analysis, Member, Model, Support } from './types.ts';

const supportDofs: Record<Support, boolean[]> = {
  free: [false, false, false],
  fixed: [true, true, true],
  pin: [true, true, false],
  rollerY: [false, true, false],
  rollerX: [true, false, false],
};
const zeros = (n: number, m = n): number[][] => Array.from({ length: n }, () => Array(m).fill(0));
const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const mv = (a: number[][], b: number[]) => a.map((row) => dot(row, b));
const transpose = (a: number[][]) => a[0].map((_, j) => a.map((row) => row[j]));
const multiply = (a: number[][], b: number[][]) => {
  const bt = transpose(b);
  return a.map((row) => bt.map((col) => dot(row, col)));
};

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}

/** Strict boundary validation for editor state and untrusted imported JSON. */
export function validateModel(input: unknown): asserts input is Model {
  if (!input || typeof input !== 'object')
    throw new ModelError('Choose a FrameLab model JSON file.');
  const m = input as Model;
  if (m.version !== 1)
    throw new ModelError('Unsupported model format. FrameLab expects version 1.');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 100)
    throw new ModelError('Give the model a name of 1–100 characters.');
  if (!Array.isArray(m.nodes) || m.nodes.length < 2 || m.nodes.length > 50)
    throw new ModelError('Use between 2 and 50 nodes.');
  if (!Array.isArray(m.members) || m.members.length < 1 || m.members.length > 100)
    throw new ModelError('Use between 1 and 100 members.');
  const ids = new Set<string>();
  const validId = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,20}$/.test(id);
  for (const node of m.nodes) {
    if (!node || !validId(node.id) || ids.has(node.id))
      throw new ModelError(
        'Node IDs must be unique, using letters, numbers, underscores or hyphens.',
      );
    ids.add(node.id);
    if (!Object.hasOwn(supportDofs, node.support))
      throw new ModelError(`Choose a valid support for ${node.id}.`);
    if (![node.x, node.y, node.fx, node.fy, node.mz].every(Number.isFinite))
      throw new ModelError(`Enter finite coordinates and loads for ${node.id}.`);
    if (Math.max(Math.abs(node.x), Math.abs(node.y)) > 10000)
      throw new ModelError('Keep coordinates within ±10,000 m.');
    if (Math.max(Math.abs(node.fx), Math.abs(node.fy), Math.abs(node.mz)) > 1e7)
      throw new ModelError('Nodal loads exceed the supported numerical range (10⁷).');
  }
  const memberIds = new Set<string>();
  const pairs = new Set<string>();
  const connected = new Set<string>();
  for (const member of m.members) {
    if (!member || !validId(member.id) || memberIds.has(member.id))
      throw new ModelError(
        'Member IDs must be unique, using letters, numbers, underscores or hyphens.',
      );
    memberIds.add(member.id);
    if (!ids.has(member.start) || !ids.has(member.end) || member.start === member.end)
      throw new ModelError(`${member.id} must connect two different existing nodes.`);
    const pair = [member.start, member.end].sort().join(':');
    if (pairs.has(pair))
      throw new ModelError(`${member.id} duplicates a member between the same nodes.`);
    pairs.add(pair);
    const a = m.nodes.find((n) => n.id === member.start)!;
    const b = m.nodes.find((n) => n.id === member.end)!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6)
      throw new ModelError(`${member.id} has zero or near-zero length.`);
    if (![member.e, member.a, member.i, member.q].every(Number.isFinite))
      throw new ModelError(`Enter finite properties and a load for ${member.id}.`);
    if (member.e <= 0 || member.a <= 0 || member.i <= 0)
      throw new ModelError(`E, A and I must be positive for ${member.id}.`);
    if (member.e > 1e5 || member.a > 1e8 || member.i > 1e12 || Math.abs(member.q) > 1e7)
      throw new ModelError(`${member.id} exceeds the supported property or load range.`);
    connected.add(member.start);
    connected.add(member.end);
  }
  for (const node of m.nodes)
    if (!connected.has(node.id))
      throw new ModelError(`${node.id} is not connected. Add a member or remove the node.`);
}

/** Euler–Bernoulli element in local axes; internal units kN, m, rad. */
export function localStiffness(member: Member, l: number): number[][] {
  const ea = (member.e * 1e6 * member.a * 1e-4) / l;
  const ei = member.e * 1e6 * member.i * 1e-8;
  const b = (12 * ei) / l ** 3,
    c = (6 * ei) / l ** 2,
    d = (4 * ei) / l,
    f = (2 * ei) / l;
  return [
    [ea, 0, 0, -ea, 0, 0],
    [0, b, c, 0, -b, c],
    [0, c, d, 0, -c, f],
    [-ea, 0, 0, ea, 0, 0],
    [0, -b, -c, 0, b, -c],
    [0, c, f, 0, -c, d],
  ];
}

/** Diagonal equilibration and partial-pivot Gaussian elimination. No regularisation. */
function solveSystem(k: number[][], f: number[]): number[] {
  if (!f.length) return [];
  const n = f.length;
  const scale = k.map((row, i) => Math.sqrt(row[i]));
  if (scale.some((x) => !Number.isFinite(x) || x <= 0))
    throw new ModelError(
      'The frame is unstable. Check supports and disconnected degrees of freedom.',
    );
  const a = k.map((row, i) => [...row.map((x, j) => x / scale[i] / scale[j]), f[i] / scale[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10)
      throw new ModelError(
        'The frame is unstable or too ill-conditioned. Add restraints, connect the frame, or review extreme stiffness differences.',
      );
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / a[col][col];
      for (let j = col + 1; j <= n; j++) a[row][j] -= factor * a[col][j];
      a[row][col] = 0;
    }
  }
  const y = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let rhs = a[i][n];
    for (let j = i + 1; j < n; j++) rhs -= a[i][j] * y[j];
    y[i] = rhs / a[i][i];
  }
  const result = y.map((x, i) => x / scale[i]);
  if (!result.every(Number.isFinite))
    throw new ModelError(
      'The analysis exceeded the numerical range. Review geometry and stiffness.',
    );
  return result;
}

export function analyze(model: Model): Analysis {
  validateModel(model);
  const size = model.nodes.length * 3;
  const k = zeros(size);
  const f = model.nodes.flatMap((n) => [n.fx, n.fy, n.mz]);
  const elements = model.members.map((member) => {
    const ai = model.nodes.findIndex((n) => n.id === member.start),
      bi = model.nodes.findIndex((n) => n.id === member.end);
    const a = model.nodes[ai],
      b = model.nodes[bi];
    const l = Math.hypot(b.x - a.x, b.y - a.y),
      c = (b.x - a.x) / l,
      s = (b.y - a.y) / l;
    const t = [
      [c, s, 0, 0, 0, 0],
      [-s, c, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0],
      [0, 0, 0, -s, c, 0],
      [0, 0, 0, 0, 0, 1],
    ];
    const kl = localStiffness(member, l),
      tt = transpose(t);
    const kg = multiply(multiply(tt, kl), t);
    const ql = [
      0,
      (member.q * l) / 2,
      (member.q * l ** 2) / 12,
      0,
      (member.q * l) / 2,
      (-member.q * l ** 2) / 12,
    ];
    const qg = mv(tt, ql);
    const dofs = [ai * 3, ai * 3 + 1, ai * 3 + 2, bi * 3, bi * 3 + 1, bi * 3 + 2];
    dofs.forEach((i, u) => {
      f[i] += qg[u];
      dofs.forEach((j, v) => {
        k[i][j] += kg[u][v];
      });
    });
    return { member, l, c, s, t, kl, ql, dofs };
  });
  const restrained = model.nodes.flatMap((n) => supportDofs[n.support]);
  const free = restrained.flatMap((x, i) => (x ? [] : [i]));
  const uf = solveSystem(
    free.map((i) => free.map((j) => k[i][j])),
    free.map((i) => f[i]),
  );
  const u = Array(size).fill(0);
  free.forEach((i, n) => {
    u[i] = uf[n];
  });
  const ku = mv(k, u);
  const residual = ku.map((x, i) => x - f[i]);
  const relativeResidual =
    Math.max(0, ...free.map((i) => Math.abs(residual[i]))) / Math.max(1, ...f.map(Math.abs));
  if (!Number.isFinite(relativeResidual) || relativeResidual > 1e-7)
    throw new ModelError(
      'The numerical equilibrium check failed. Review extreme geometry or stiffness differences.',
    );
  const nodes = model.nodes.map((node, i) => ({
    id: node.id,
    ux: u[3 * i],
    uy: u[3 * i + 1],
    rz: u[3 * i + 2],
    rx: restrained[3 * i] ? residual[3 * i] : 0,
    ry: restrained[3 * i + 1] ? residual[3 * i + 1] : 0,
    rm: restrained[3 * i + 2] ? residual[3 * i + 2] : 0,
  }));
  let maxDisplacement = 0;
  const members = elements.map(({ member, l, c, s, t, kl, ql, dofs }) => {
    const d = mv(
      t,
      dofs.map((i) => u[i]),
    );
    const forces = mv(kl, d).map((x, i) => x - ql[i]);
    const ei = member.e * 1e6 * member.i * 1e-8;
    const momentAt = (x: number) => -forces[2] + forces[1] * x + (member.q * x * x) / 2;
    const candidates = [0, l];
    if (member.q !== 0) {
      const x = -forces[1] / member.q;
      if (x > 0 && x < l) candidates.push(x);
    }
    const samples = Array.from({ length: 101 }, (_, i) => {
      const r = i / 100,
        x = r * l;
      const axial = d[0] * (1 - r) + d[3] * r;
      // Hermite interpolation plus the exact uniform-load particular solution.
      const v =
        (1 - 3 * r ** 2 + 2 * r ** 3) * d[1] +
        l * (r - 2 * r ** 2 + r ** 3) * d[2] +
        (3 * r ** 2 - 2 * r ** 3) * d[4] +
        l * (-(r ** 2) + r ** 3) * d[5] +
        (member.q * x ** 2 * (l - x) ** 2) / (24 * ei);
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(axial, v));
      return {
        x,
        u: axial,
        v,
        n: -forces[0],
        shear: forces[1] + member.q * x,
        moment: momentAt(x),
      };
    });
    return {
      id: member.id,
      length: l,
      c,
      s,
      endForces: forces,
      localDisplacements: d,
      samples,
      maxMoment: Math.max(...candidates.map((x) => Math.abs(momentAt(x)))),
      maxShear: Math.max(Math.abs(forces[1]), Math.abs(forces[1] + member.q * l)),
      maxAxial: Math.abs(forces[0]),
    };
  });
  const total = f.map((x, i) => x + (restrained[i] ? residual[i] : 0));
  const equilibrium = { fx: 0, fy: 0, mz: 0 };
  model.nodes.forEach((n, i) => {
    equilibrium.fx += total[3 * i];
    equilibrium.fy += total[3 * i + 1];
    equilibrium.mz += total[3 * i + 2] + n.x * total[3 * i + 1] - n.y * total[3 * i];
  });
  const warnings: string[] = [];
  const shortest = Math.min(...members.map((m) => m.length));
  if (maxDisplacement / shortest > 0.02)
    warnings.push(
      'Large displacement relative to member length. Small-displacement linear analysis may be inappropriate.',
    );
  if (Math.max(...u.filter((_, i) => i % 3 === 2).map(Math.abs)) > 0.05)
    warnings.push('A nodal rotation exceeds 0.05 rad. Review the small-rotation assumption.');
  if (f.every((x) => x === 0))
    warnings.push('No loads are applied. Add a nodal force, moment, or member load.');
  return {
    nodes,
    members,
    maxDisplacement,
    maxMoment: Math.max(...members.map((m) => m.maxMoment)),
    maxShear: Math.max(...members.map((m) => m.maxShear)),
    maxAxial: Math.max(...members.map((m) => m.maxAxial)),
    equilibrium,
    relativeResidual,
    freeDofs: free.length,
    warnings,
    stiffness: k,
    loads: f,
    displacement: u,
  };
}
