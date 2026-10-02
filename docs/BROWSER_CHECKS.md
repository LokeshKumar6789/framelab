# Browser verification record

Verified on 2 October 2026 in Chromium, against both the development build and the final self-contained production HTML.

| Check | Observed result |
|---|---|
| Default portal | 6.94 mm peak sampled displacement; 38.41 kN·m peak absolute moment; 35.33 kN peak shear |
| Baseline + M2 inertia doubled | Comparison updated to 5.32 mm, 35.65 kN·m and 35.92 kN |
| Blank inertia | Explicit finite-property error; calculated results and CSV export withheld |
| Undo | Restored valid member properties and support conditions |
| Example switching | Simply supported beam showed 10.55 mm, 45.00 kN·m and 30.00 kN |
| Add node | Orphan-node error appeared until a connecting member was added |
| Add member | Model returned to a solvable state |
| Remove both portal restraints | Explicit instability/ill-conditioning error; no fabricated results |
| Model save | JSON downloaded; contained the four-node, three-member portal |
| Results CSV | Downloaded 30,417-byte file with reactions, all member stations and model inputs |
| Model import | Original cantilever JSON selected through the browser file chooser; 13.33 mm, 40.00 kN·m and 10.00 kN displayed |
| Negative load typing | A negative numeric load could be entered from an empty field |
| Method view | Actual 12 × 12 global matrix and loads displayed for the portal; relative residual 6.824e−15 |
| Validation view | All five live analytical benchmarks passed |
| Desktop | Complete workspace screenshot inspected; controls and diagrams visible |
| Mobile, 390 px viewport | Canvas scroll width equalled its client width (341 px); no horizontal canvas overflow after correction |
| Final production HTML | Loaded successfully with zero external script or stylesheet links; no browser error/warning logs |

The native operating-system print dialog was not exercised. Print styles and report content are included; rendering can vary between browsers. No public GitHub deployment was attempted because the personal destination account had not yet been supplied.

Screenshots: [desktop](assets/framelab-desktop.jpg), [mobile](assets/framelab-mobile.jpg).
