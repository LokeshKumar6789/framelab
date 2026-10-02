# FrameLab launch material

Publish only after substituting the actual public repository and demo URLs. The project has been built and verified locally; this document does not claim that a public deployment already exists.

## LinkedIn post draft

I built FrameLab, an independent open-source project for exploring how 2D frames behave.

The idea is simple: change a support, adjust a member's stiffness, or apply a load, and immediately see what happens to the deflected shape, reactions and internal forces.

One experiment I enjoyed: doubling only the horizontal beam's inertia in a portal frame reduced the peak displacement from 6.94 mm to 5.32 mm. The forces changed too, because the members share load according to their stiffness.

The project includes an original TypeScript direct-stiffness solver, an interactive React interface, model import/export, baseline comparison and printable calculations. It runs entirely in the browser.

I verified the implemented behaviour with 48 automated tests, classical analytical solutions, and independent Pynite comparisons for four example models.

This is a learning and behaviour-exploration tool with a clearly stated linear-elastic scope. All examples are synthetic, and the project is independent of my employer's work.

Try the demo: ADD_ACTUAL_DEMO_URL

Explore the code: ADD_ACTUAL_REPOSITORY_URL

I'd welcome feedback from structural engineers and developers on the interaction and verification approach.

#StructuralEngineering #ComputationalEngineering #OpenSource #React #TypeScript

## Suggested 60–75 second recording

1. 0–10 s: Open the default portal and point out forces, supports and the deflected shape.
2. 10–20 s: Switch to bending moment, then shear.
3. 20–40 s: Capture a baseline, select M2 and change I from 8000 to 16000 cm⁴. Show the three comparison metrics.
4. 40–50 s: Open How it works and the assembled stiffness matrix.
5. 50–65 s: Open Validation and its five live analytical benchmarks.
6. Final frame: Your actual demo and GitHub links.

## Resume entry

**FrameLab — Independent structural analysis project** | React, TypeScript, numerical methods

- Developed a browser-based 2D frame explorer with an original stiffness-method solver, interactive force/deflection diagrams and baseline comparison.
- Verified supported linear behaviour with 48 automated tests, analytical beam solutions and independent Pynite reference cases; implemented model validation and instability detection.

## Interview preparation

Be ready to explain:

- Why each node needs three DOFs and how the transformation matrix works.
- Why uniform loading needs consistent nodal moments.
- Why a fixed-fixed loaded beam still deflects between its nodes.
- Why changing one member's stiffness redistributes forces.
- What the program omits, and what the tests actually establish.
- Why the browser-first architecture avoids a hosted numerical backend.

Describe AI assistance honestly if asked, and demonstrate understanding of the solver and validation decisions.
