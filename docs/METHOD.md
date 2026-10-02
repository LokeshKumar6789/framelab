# Calculation method

FrameLab uses the direct stiffness method for 2D linear elastic frames. Each node has `[ux, uy, rz]`; each member contributes a 6 × 6 stiffness matrix. The internal system uses kN, m and radians.

## Units and orientation

`E_internal = E_GPa × 10⁶ kN/m²`; `A_internal = A_cm² × 10⁻⁴ m²`; `I_internal = I_cm⁴ × 10⁻⁸ m⁴`.

For start `(xi, yi)` and end `(xj, yj)`, `L = hypot(xj−xi, yj−yi)`, `c = (xj−xi)/L`, `s = (yj−yi)/L`. The local x axis follows start → end; local y is its 90° counterclockwise rotation. A three-component block of the global-to-local transformation is:

```text
T₃ = [ c  s  0 ]
     [-s  c  0 ]
     [ 0  0  1 ]
```

`T = blockdiag(T₃, T₃)` and `k_global = Tᵀ k_local T`.

## Element matrix

With `a = EA/L`, `b = 12EI/L³`, `c₁ = 6EI/L²`, `d = 4EI/L`, `e = 2EI/L`:

```text
          ui  vi  θi   uj  vj  θj
k_local = [ a   0   0  -a   0   0 ]
          [ 0   b  c₁   0  -b  c₁ ]
          [ 0  c₁   d   0 -c₁   e ]
          [-a   0   0   a   0   0 ]
          [ 0  -b -c₁   0   b -c₁ ]
          [ 0  c₁   e   0 -c₁   d ]
```

For uniform local transverse load q, the consistent load vector is:

`f_eq = [0, qL/2, qL²/12, 0, qL/2, −qL²/12]`.

Transform equivalent loads using `Tᵀ`, then add nodal loads in global axes. Assemble all elements into K and F. Restraints prescribe zero displacement. Solve the free system `Kff uf = Ff`; restrained displacements remain zero.

## Numerical solve

The free matrix is symmetrically scaled using `Dii = sqrt(Kii)` before Gaussian elimination with partial pivoting. A scaled pivot below `10⁻¹⁰` raises an instability/ill-conditioning error. FrameLab does not add artificial stiffness to make a mechanism solve.

The free-DOF residual `max(abs(Ku−F)_free) / max(1, max(abs(F)))` must be at most `10⁻⁷`. This is a numerical sanity measure in the selected unit system, not a dimensionally uniform energy norm or an engineering acceptance criterion. Global force and moment residuals are also displayed. Support reactions are the restrained components of `Ku−F`.

Input bounds are 50 nodes and 100 members, finite coordinates within ±10,000 m, positive E/A/I, and finite bounded loads/properties. Near-zero members, duplicate node pairs, orphan nodes and invalid references are rejected before allocation. Two unconnected coincident nodes are not automatically merged, and crossing members do not share a joint unless explicitly connected through a node.

## Force recovery

`d_local = T u_element`; `f_local = k_local d_local − f_eq`.

Using start-end actions `f0` (axial), `f1` (shear) and `f2` (moment), section forces at distance x from the start are:

- `N(x) = −f0` (tension positive).
- `V(x) = f1 + qx`.
- `M(x) = −f2 + f1 x + qx²/2` (sagging positive).

Absolute shear and axial maxima follow from endpoints. Moment candidates are the endpoints plus `x = −f1/q` when q is nonzero and that point lies inside the member. The diagram uses a common force scale across all members and plots positive values toward local +y.

## Deflection within a member

For `r = x/L`, cubic Hermite shape functions are:

`H1 = 1−3r²+2r³`, `H2 = L(r−2r²+r³)`, `H3 = 3r²−2r³`, `H4 = L(−r²+r³)`.

`v(x) = H1 vi + H2 θi + H3 vj + H4 θj + q x²(L−x)²/(24EI)`.

The final quartic term is essential for distributed loading. A fixed-fixed beam has zero nodal displacement but nonzero deflection inside its span. Axial displacement uses linear interpolation. The deformed diagram transforms local displacements back to global axes, then applies only a visual amplification factor. Reported displacement values are unamplified.

The peak resultant displacement is sampled at 101 equally spaced stations on every member, including endpoints. There is no exact continuous maximum search. Large deflection/rotation warnings use displacement/shortest-length > 0.02 or absolute nodal rotation > 0.05 rad; these are explanatory heuristics, not design-code limits.

## Boundaries

Only linear elastic, prismatic Euler–Bernoulli members, rigid connections and zero support movement are supported. No self-weight is automatically added. There is one user-defined load state; the interface does not generate load combinations. Point loads inside members require splitting the member at a new node. Ground pins do not create member-end releases.

No capacity, buckling, shear deformation, plastic redistribution, P–Δ, dynamics, thermal effects, settlement, design-code checking, spring support or nonlinear analysis is implemented. Users must decide whether the chosen mathematical model represents their intended problem.

## Reference strategy

Classical closed-form beam/bar solutions are calculated directly in the tests. For a separate implementation, `verification/pynite_reference.py` uses [Pynite's documented frame API](https://pynite.readthedocs.io/en/latest/quickstart.html) and [linear analysis](https://pynite.readthedocs.io/en/latest/analysis.html), with out-of-plane DOFs restrained. Pynite is not called by FrameLab at runtime.
