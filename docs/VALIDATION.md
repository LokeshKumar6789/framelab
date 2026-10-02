# Validation evidence

Verified on 2 October 2026. This evidence applies to FrameLab's implemented linear model; it is not design certification.

## Automated checks

`npm run check` runs 48 tests, strict TypeScript checking and the production build. Every test passed for the initial release.

| Group       | Evidence                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Analytical  | Simply supported UDL deflection/moment/reactions/rotation, cantilever force/UDL/moment response, fixed-fixed UDL, axial extension, midspan point load, continuous beam               |
| Invariants  | Load reversal and scaling, E scaling, mesh refinement, coordinate rotation/translation, reversal of member orientation with corresponding local-load sign                            |
| Equilibrium | Portal global forces and moment; element and assembled-matrix symmetry                                                                                                               |
| Robustness  | Unsupported models, unrestrained frames, pin mechanisms, disconnected components, nonfinite data, invalid properties, duplicate IDs/members, orphan nodes, zero length, input limits |
| Data        | Input immutability, model serialization and result CSV coverage                                                                                                                      |
| Independent | Four PyniteFEA 3.2.0 nodal-response fixtures                                                                                                                                         |

The four independent fixtures check all node translations, in-plane rotations, forces and moments with tolerance `10⁻⁹ + 10⁻⁷ × abs(reference)` in internal units. The analytical/invariant tests generally use `10⁻⁸ × max(1, abs(reference))`. The live benchmark page uses a relative error of `10⁻⁸`.

The Pynite comparison verifies nodal response and reactions. It does not independently verify every internal force sample or plotted pixel; closed-form tests cover the supported element interpolation and force recovery separately.

## Reproduce the independent fixtures

Python is optional and not needed for normal use or tests. In a separate virtual environment:

```sh
python -m venv .venv
# Activate .venv using the command for your operating system.
python -m pip install PyniteFEA==3.2.0
node --experimental-strip-types verification/export-examples.ts
python verification/pynite_reference.py
npm test
```

The script reads the original JSON files under `examples`, creates equivalent XY-plane frames, restrains out-of-plane DOFs, converts units, and runs linear analysis. Global components of distributed loads avoid differences in library local-axis conventions. Output is written to `tests/fixtures/pynite-reference.json`.

## Representative values

All default members have E = 200 GPa, A = 60 cm² and I = 8,000 cm⁴.

| Case                                        | Reference response                                                 |
| ------------------------------------------- | ------------------------------------------------------------------ |
| 6 m simply supported beam, 10 kN/m downward | Deflection 10.546875 mm; peak moment 45 kN·m; each reaction 30 kN  |
| 4 m cantilever, 10 kN downward tip force    | Tip deflection 13.333333 mm; root moment 40 kN·m in magnitude      |
| 6 m fixed-fixed beam, 10 kN/m downward      | Interior deflection 2.109375 mm; support moment magnitude 30 kN·m  |
| 4 m axial bar, 100 kN tip force             | Extension 0.333333 mm                                              |
| Two 4 m continuous spans, 10 kN/m on each   | Vertical reactions 15, 50, 15 kN; internal support moment −20 kN·m |

## Browser verification

The release was exercised in a real Chromium browser: initial portal, stiffness comparison, invalid numeric input, example switching, force diagram switching, node/member editing, unstable supports, undo/redo, method and benchmark views, model/result downloads and responsive layout. Detailed evidence and screenshots accompany the local delivery.

## Remaining limits

- Displacement peaks are sampled; they can slightly underestimate a continuous maximum.
- A near-singular model may be rejected even when mathematically invertible.
- Imported files are structurally validated, not checked for physical engineering intent.
- Print layout and file-dialog behaviour can vary between browsers.
- This verification does not cover nonlinear behaviour, capacity or code compliance.
