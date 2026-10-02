import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, validateModel, localStiffness } from '../src/engine/solver.ts';
import { examples, cloneModel, makeNode, makeMember } from '../src/engine/examples.ts';
import { runBenchmarks } from '../src/engine/benchmarks.ts';
import { resultsCsv, slug } from '../src/exports.ts';
import type { Model } from '../src/engine/types.ts';

const close = (a: number, b: number, rel = 1e-8) =>
  assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} differs from ${b}`);
const beam = () => cloneModel(examples[1].model);
const cantilever = () => cloneModel(examples[2].model);
const portal = () => cloneModel(examples[0].model);
const ei = 200e6 * 8000e-8;

for (const b of runBenchmarks())
  test(`analytical: ${b.name}`, () => assert.ok(b.relativeError < 1e-8));
test('simply supported UDL reactions and rotations', () => {
  const r = analyze(beam());
  close(r.nodes[0].ry, 30);
  close(r.nodes[1].ry, 30);
  close(r.nodes[0].rm, 0);
  close(r.nodes[0].rz, (-10 * 6 ** 3) / (24 * ei));
  close(r.nodes[1].rz, (10 * 6 ** 3) / (24 * ei));
});
test('cantilever point load: root reaction, rotation and bending', () => {
  const r = analyze(cantilever());
  close(r.nodes[0].ry, 10);
  close(r.nodes[0].rm, 40);
  close(r.nodes[1].rz, (-10 * 4 ** 2) / (2 * ei));
  close(r.members[0].samples[0].moment, -40);
  close(r.members[0].samples[100].moment, 0);
});
test('fixed-fixed beam has interior deflection despite zero nodal displacement', () => {
  const m = beam();
  m.nodes.forEach((n) => {
    n.support = 'fixed';
  });
  const r = analyze(m);
  assert.equal(r.freeDofs, 0);
  close(r.nodes[0].rm, 30);
  close(r.nodes[1].rm, -30);
  close(r.maxDisplacement, (10 * 6 ** 4) / (384 * ei));
  close(r.members[0].samples[50].moment, 15);
});
test('cantilever UDL includes quartic deflection term', () => {
  const m = cantilever();
  m.nodes[1].fy = 0;
  m.members[0].q = -7;
  const r = analyze(m);
  close(r.nodes[1].uy, (-7 * 4 ** 4) / (8 * ei));
  close(r.members[0].samples[50].v, (-7 * 2 ** 2 * (6 * 4 ** 2 - 4 * 4 * 2 + 2 ** 2)) / (24 * ei));
});
test('cantilever tip moment', () => {
  const m = cantilever();
  m.nodes[1].fy = 0;
  m.nodes[1].mz = 12;
  const r = analyze(m);
  close(r.nodes[1].uy, (12 * 4 ** 2) / (2 * ei));
  close(r.nodes[1].rz, (12 * 4) / ei);
  close(r.nodes[0].rm, -12);
});
test('midspan point load is represented by a shared node', () => {
  const m: Model = {
    version: 1,
    name: 'Point load beam',
    nodes: [
      makeNode('A', 0, 0, 'pin'),
      makeNode('B', 3, 0, 'free', 0, -20),
      makeNode('C', 6, 0, 'rollerY'),
    ],
    members: [makeMember('AB', 'A', 'B'), makeMember('BC', 'B', 'C')],
  };
  const r = analyze(m);
  close(r.nodes[1].uy, (-20 * 6 ** 3) / (48 * ei));
  close(r.maxMoment, (20 * 6) / 4);
});
test('two-span continuous beam UDL has classical support reactions', () => {
  const r = analyze(cloneModel(examples[3].model));
  close(r.nodes[0].ry, 15);
  close(r.nodes[1].ry, 50);
  close(r.nodes[2].ry, 15);
  close(r.members[0].samples[100].moment, -20);
  close(r.members[1].samples[0].moment, -20);
});
test('portal satisfies global equilibrium', () => {
  const r = analyze(portal());
  close(r.equilibrium.fx, 0);
  close(r.equilibrium.fy, 0);
  close(r.equilibrium.mz, 0);
  assert.ok(r.relativeResidual < 1e-10);
});
test('load reversal reverses every displacement and reaction', () => {
  const m = portal(),
    a = analyze(m);
  m.nodes.forEach((n) => {
    n.fx *= -1;
    n.fy *= -1;
    n.mz *= -1;
  });
  m.members.forEach((n) => {
    n.q *= -1;
  });
  const b = analyze(m);
  a.nodes.forEach((n, i) => {
    for (const key of ['ux', 'uy', 'rz', 'rx', 'ry', 'rm'] as const)
      close(n[key], -b.nodes[i][key]);
  });
});
test('doubling all elastic moduli halves displacement and preserves forces', () => {
  const m = portal(),
    a = analyze(m);
  m.members.forEach((n) => {
    n.e *= 2;
  });
  const b = analyze(m);
  a.nodes.forEach((n, i) => {
    close(n.ux, b.nodes[i].ux * 2);
    close(n.uy, b.nodes[i].uy * 2);
    close(n.rx, b.nodes[i].rx);
  });
});
test('doubling the load doubles displacement and bending', () => {
  const m = beam(),
    a = analyze(m);
  m.members[0].q *= 2;
  const b = analyze(m);
  close(b.maxDisplacement, a.maxDisplacement * 2);
  close(b.maxMoment, a.maxMoment * 2);
});
test('refining an element preserves its end response', () => {
  const coarse = beam(),
    a = analyze(coarse);
  const refined = beam();
  refined.nodes.push(makeNode('MID', 3, 0));
  refined.members = [makeMember('M1', 'N1', 'MID', -10), makeMember('M2', 'MID', 'N2', -10)];
  const b = analyze(refined);
  close(a.maxDisplacement, b.maxDisplacement);
  close(a.maxMoment, b.maxMoment);
  close(a.nodes[0].rz, b.nodes[0].rz);
  close(a.nodes[1].ry, b.nodes[1].ry);
});
test('coordinate rotation preserves a cantilever response', () => {
  const m = cantilever(),
    a = analyze(m),
    theta = 0.73,
    c = Math.cos(theta),
    s = Math.sin(theta);
  m.nodes.forEach((n) => {
    const { x, y, fx, fy } = n;
    n.x = c * x - s * y;
    n.y = s * x + c * y;
    n.fx = c * fx - s * fy;
    n.fy = s * fx + c * fy;
  });
  const b = analyze(m);
  close(b.nodes[1].ux, -s * a.nodes[1].uy);
  close(b.nodes[1].uy, c * a.nodes[1].uy);
  close(a.maxMoment, b.maxMoment);
  close(b.equilibrium.mz, 0);
});
test('coordinate translation preserves response', () => {
  const m = portal(),
    a = analyze(m);
  m.nodes.forEach((n) => {
    n.x += 100;
    n.y -= 20;
  });
  const b = analyze(m);
  close(a.maxDisplacement, b.maxDisplacement);
  close(a.maxMoment, b.maxMoment);
  close(b.equilibrium.mz, 0);
});
test('member reversal with reversed local load preserves global response', () => {
  const m = beam(),
    a = analyze(m),
    member = m.members[0];
  [member.start, member.end] = [member.end, member.start];
  member.q *= -1;
  const b = analyze(m);
  close(a.maxDisplacement, b.maxDisplacement);
  close(a.nodes[0].ry, b.nodes[0].ry);
});
test('vertical member uniform local load transforms into global force', () => {
  const m: Model = {
    version: 1,
    name: 'Vertical cantilever',
    nodes: [makeNode('A', 0, 0, 'fixed'), makeNode('B', 0, 4)],
    members: [makeMember('AB', 'A', 'B', 5)],
  };
  const r = analyze(m);
  close(r.nodes[0].rx, 20);
  close(r.nodes[0].rm, -40);
  close(r.nodes[1].ux, (-5 * 4 ** 4) / (8 * ei));
});
test('rollerX restrains global X only', () => {
  const m: Model = {
    version: 1,
    name: 'Vertical beam',
    nodes: [makeNode('A', 0, 0, 'pin'), makeNode('B', 0, 6, 'rollerX')],
    members: [makeMember('AB', 'A', 'B', 10)],
  };
  const r = analyze(m);
  close(r.nodes[0].rx, 30);
  close(r.nodes[1].rx, 30);
  close(r.nodes[1].ry, 0);
});
test('unrestrained frame raises an instability error, even without load', () => {
  const m = beam();
  m.nodes.forEach((n) => {
    n.support = 'free';
  });
  m.members[0].q = 0;
  assert.throws(() => analyze(m), /unstable|ill-conditioned/);
});
test('one pinned support leaves a rigid-body mechanism', () => {
  const m = beam();
  m.nodes[1].support = 'free';
  assert.throws(() => analyze(m), /unstable|ill-conditioned/);
});
test('unrestrained disconnected component is rejected', () => {
  const m = beam();
  m.nodes.push(makeNode('A', 0, 5), makeNode('B', 5, 5));
  m.members.push(makeMember('AB', 'A', 'B'));
  assert.throws(() => analyze(m), /unstable|ill-conditioned/);
});
test('zero load produces zero response and a useful warning', () => {
  const m = beam();
  m.members[0].q = 0;
  const r = analyze(m);
  close(r.maxDisplacement, 0);
  assert.match(r.warnings[0], /No loads/);
});
test('large displacement flags limits of the linear model', () => {
  const m = cantilever();
  m.members[0].i = 10;
  const r = analyze(m);
  assert.ok(r.warnings.length > 0);
});
test('element and assembled stiffness matrices are symmetric', () => {
  const m = portal();
  for (const matrix of [localStiffness(m.members[0], 4), analyze(m).stiffness])
    matrix.forEach((row, i) => row.forEach((v, j) => close(v, matrix[j][i])));
});
test('solver does not modify the input model', () => {
  const m = portal(),
    before = JSON.stringify(m);
  analyze(m);
  assert.equal(JSON.stringify(m), before);
});

const invalid: [string, (m: Model) => void, RegExp][] = [
  [
    'zero length',
    (m) => {
      m.nodes[1].x = 0;
    },
    /zero or near-zero/,
  ],
  [
    'negative stiffness',
    (m) => {
      m.members[0].i = -1;
    },
    /positive/,
  ],
  [
    'NaN input',
    (m) => {
      m.nodes[0].x = NaN;
    },
    /finite/,
  ],
  [
    'infinite load',
    (m) => {
      m.nodes[0].fx = Infinity;
    },
    /finite/,
  ],
  [
    'duplicate node IDs',
    (m) => {
      m.nodes[1].id = m.nodes[0].id;
    },
    /unique/,
  ],
  [
    'duplicate member IDs',
    (m) => {
      m.members.push({ ...m.members[0] });
    },
    /unique/,
  ],
  [
    'duplicate node pair',
    (m) => {
      m.members.push({ ...m.members[0], id: 'M2' });
    },
    /duplicates/,
  ],
  [
    'invalid endpoint',
    (m) => {
      m.members[0].end = 'missing';
    },
    /existing nodes/,
  ],
  [
    'orphan node',
    (m) => {
      m.nodes.push(makeNode('ORPHAN', 8, 0));
    },
    /not connected/,
  ],
  [
    'empty name',
    (m) => {
      m.name = '';
    },
    /name/,
  ],
  [
    'large coordinate',
    (m) => {
      m.nodes[0].x = 10001;
    },
    /coordinates/,
  ],
];
for (const [name, edit, expected] of invalid)
  test(`invalid input: ${name}`, () => {
    const m = beam();
    edit(m);
    assert.throws(() => analyze(m), expected);
  });
test('untrusted JSON shape and version are validated', () => {
  for (const value of [
    null,
    [],
    { version: 2 },
    { version: 1, name: 'X', nodes: [null, {}], members: [{}] },
  ])
    assert.throws(() => validateModel(value));
});
test('node limit is enforced before matrix allocation', () => {
  const m = beam();
  m.nodes = Array.from({ length: 51 }, (_, i) => makeNode(`N${i}`, i, 0));
  assert.throws(() => analyze(m), /50 nodes/);
});
test('model serialization round trip preserves results', () => {
  const m = portal();
  const decoded = JSON.parse(JSON.stringify(m));
  validateModel(decoded);
  close(analyze(decoded).maxMoment, analyze(m).maxMoment);
});
test('CSV includes every station and input model', () => {
  const m = portal(),
    r = analyze(m),
    csv = resultsCsv(m, r);
  assert.match(csv, /rotation_rad/);
  assert.match(csv, /q_local_y_kN_per_m/);
  assert.ok(csv.split('\r\n').length > 303);
  assert.equal(slug('Frame / Test'), 'frame-test');
});
