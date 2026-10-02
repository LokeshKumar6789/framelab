export type Support = 'free' | 'fixed' | 'pin' | 'rollerY' | 'rollerX';
export interface FrameNode {
  id: string;
  x: number;
  y: number;
  support: Support;
  fx: number;
  fy: number;
  mz: number;
}
export interface Member {
  id: string;
  start: string;
  end: string;
  e: number; // GPa
  a: number; // cm²
  i: number; // cm⁴
  q: number; // kN/m along the local +y axis
}
export interface Model {
  version: 1;
  name: string;
  nodes: FrameNode[];
  members: Member[];
}
export interface NodeResult {
  id: string;
  ux: number; // m
  uy: number; // m
  rz: number; // rad
  rx: number; // kN
  ry: number; // kN
  rm: number; // kN m
}
export interface Sample {
  x: number;
  u: number;
  v: number;
  n: number;
  shear: number;
  moment: number;
}
export interface MemberResult {
  id: string;
  length: number;
  c: number;
  s: number;
  endForces: number[];
  localDisplacements: number[];
  samples: Sample[];
  maxMoment: number;
  maxShear: number;
  maxAxial: number;
}
export interface Analysis {
  nodes: NodeResult[];
  members: MemberResult[];
  maxDisplacement: number; // sampled along every member, m
  maxMoment: number;
  maxShear: number;
  maxAxial: number;
  equilibrium: { fx: number; fy: number; mz: number };
  relativeResidual: number;
  freeDofs: number;
  warnings: string[];
  stiffness: number[][];
  loads: number[];
  displacement: number[];
}
