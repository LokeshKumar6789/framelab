import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, validateModel } from '../src/engine/solver.ts';
import type { Model, NodeResult } from '../src/engine/types.ts';

const reference = JSON.parse(
  readFileSync(new URL('./fixtures/pynite-reference.json', import.meta.url), 'utf8'),
) as {
  reference: string;
  version: string;
  cases: Record<string, { model: Model; nodes: NodeResult[] }>;
};
for (const [name, fixture] of Object.entries(reference.cases)) {
  test(`independent ${reference.reference} ${reference.version}: ${name} nodal displacements and reactions`, () => {
    validateModel(fixture.model);
    const calculated = analyze(fixture.model);
    for (const expected of fixture.nodes) {
      const actual = calculated.nodes.find((n) => n.id === expected.id)!;
      for (const key of ['ux', 'uy', 'rz', 'rx', 'ry', 'rm'] as const) {
        const tolerance = 1e-9 + 1e-7 * Math.abs(expected[key]);
        assert.ok(
          Math.abs(actual[key] - expected[key]) <= tolerance,
          `${name}/${expected.id}/${key}: FrameLab ${actual[key]}, Pynite ${expected[key]}`,
        );
      }
    }
  });
}
