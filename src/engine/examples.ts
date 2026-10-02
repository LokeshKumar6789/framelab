import type { FrameNode, Model, Member, Support } from './types.ts';

export const makeNode = (
  id: string,
  x: number,
  y: number,
  support: Support = 'free',
  fx = 0,
  fy = 0,
  mz = 0,
): FrameNode => ({ id, x, y, support, fx, fy, mz });
export const makeMember = (id: string, start: string, end: string, q = 0): Member => ({
  id,
  start,
  end,
  e: 200,
  a: 60,
  i: 8000,
  q,
});

export const examples: { id: string; title: string; caption: string; model: Model }[] = [
  {
    id: 'portal',
    title: 'Portal frame',
    caption: 'Gravity meets lateral load',
    model: {
      version: 1,
      name: 'The everyday portal',
      nodes: [
        makeNode('N1', 0, 0, 'fixed'),
        makeNode('N2', 0, 4, 'free', 20),
        makeNode('N3', 6, 4),
        makeNode('N4', 6, 0, 'fixed'),
      ],
      members: [
        makeMember('M1', 'N1', 'N2'),
        makeMember('M2', 'N2', 'N3', -10),
        makeMember('M3', 'N4', 'N3'),
      ],
    },
  },
  {
    id: 'beam',
    title: 'Simply supported beam',
    caption: 'A familiar benchmark',
    model: {
      version: 1,
      name: 'One span, a thousand lessons',
      nodes: [makeNode('N1', 0, 0, 'pin'), makeNode('N2', 6, 0, 'rollerY')],
      members: [makeMember('M1', 'N1', 'N2', -10)],
    },
  },
  {
    id: 'cantilever',
    title: 'Cantilever',
    caption: 'Follow the load to the support',
    model: {
      version: 1,
      name: 'The cantilever experiment',
      nodes: [makeNode('N1', 0, 0, 'fixed'), makeNode('N2', 4, 0, 'free', 0, -10)],
      members: [makeMember('M1', 'N1', 'N2')],
    },
  },
  {
    id: 'continuous',
    title: 'Continuous beam',
    caption: 'Discover moment redistribution through stiffness',
    model: {
      version: 1,
      name: 'Two spans, connected',
      nodes: [
        makeNode('N1', 0, 0, 'pin'),
        makeNode('N2', 4, 0, 'rollerY'),
        makeNode('N3', 8, 0, 'rollerY'),
      ],
      members: [makeMember('M1', 'N1', 'N2', -10), makeMember('M2', 'N2', 'N3', -10)],
    },
  },
];

export function cloneModel(model: Model): Model {
  return structuredClone(model);
}
