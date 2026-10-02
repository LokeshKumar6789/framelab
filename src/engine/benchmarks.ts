import { analyze } from './solver.ts';
import { cloneModel, examples, makeMember, makeNode } from './examples.ts';
import type { Model } from './types.ts';

export function runBenchmarks() {
  const beam = analyze(cloneModel(examples[1].model));
  const cantilever = analyze(cloneModel(examples[2].model));
  const fixed: Model = {
    version: 1,
    name: 'Fixed beam',
    nodes: [makeNode('A', 0, 0, 'fixed'), makeNode('B', 6, 0, 'fixed')],
    members: [makeMember('AB', 'A', 'B', -10)],
  };
  const fixedResult = analyze(fixed);
  const axial: Model = {
    version: 1,
    name: 'Axial bar',
    nodes: [makeNode('A', 0, 0, 'fixed'), makeNode('B', 4, 0, 'free', 100)],
    members: [makeMember('AB', 'A', 'B')],
  };
  const ei = 200e6 * 8000e-8,
    ea = 200e6 * 60e-4;
  return [
    {
      name: 'Simply supported · deflection',
      expression: '5wL⁴ / 384EI',
      expected: ((5 * 10 * 6 ** 4) / (384 * ei)) * 1000,
      actual: beam.maxDisplacement * 1000,
      unit: 'mm',
    },
    {
      name: 'Simply supported · moment',
      expression: 'wL² / 8',
      expected: (10 * 6 ** 2) / 8,
      actual: beam.maxMoment,
      unit: 'kN·m',
    },
    {
      name: 'Cantilever · tip deflection',
      expression: 'PL³ / 3EI',
      expected: ((10 * 4 ** 3) / (3 * ei)) * 1000,
      actual: cantilever.maxDisplacement * 1000,
      unit: 'mm',
    },
    {
      name: 'Fixed beam · deflection',
      expression: 'wL⁴ / 384EI',
      expected: ((10 * 6 ** 4) / (384 * ei)) * 1000,
      actual: fixedResult.maxDisplacement * 1000,
      unit: 'mm',
    },
    {
      name: 'Axial bar · extension',
      expression: 'PL / EA',
      expected: ((100 * 4) / ea) * 1000,
      actual: analyze(axial).nodes[1].ux * 1000,
      unit: 'mm',
    },
  ].map((test) => ({
    ...test,
    relativeError: Math.abs(test.actual - test.expected) / Math.max(Math.abs(test.expected), 1e-12),
  }));
}
