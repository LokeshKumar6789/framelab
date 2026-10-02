"""Generate independent nodal-response fixtures with PyniteFEA 3.2.0.

Run from the repository root: python verification/pynite_reference.py
Input: examples/*.json. Output: tests/fixtures/pynite-reference.json.
All members lie in the global XY plane. Out-of-plane DOFs are restrained.
"""
import json
from pathlib import Path
from importlib.metadata import version
from Pynite import FEModel3D

ROOT = Path(__file__).resolve().parents[1]
results = {}
for path in sorted((ROOT / "examples").glob("*.json")):
    source = json.loads(path.read_text(encoding="utf-8"))
    frame = FEModel3D()
    for n in source["nodes"]:
        frame.add_node(n["id"], n["x"], n["y"], 0)
        support = n["support"]
        frame.def_support(n["id"], support in ("fixed", "pin", "rollerX"),
                          support in ("fixed", "pin", "rollerY"), True, True, True,
                          support == "fixed")
        for key, axis in (("fx", "FX"), ("fy", "FY"), ("mz", "MZ")):
            if n[key]:
                frame.add_node_load(n["id"], axis, n[key], case="L")
    for m in source["members"]:
        e = m["e"] * 1e6
        inertia = m["i"] * 1e-8
        frame.add_material(m["id"], e, e / 2.6, 0.3, 0)
        frame.add_section(m["id"], m["a"] * 1e-4, inertia, inertia, inertia)
        frame.add_member(m["id"], m["start"], m["end"], m["id"], m["id"])
        if m["q"]:
            # Global components avoid any library-specific local-axis orientation.
            a = next(n for n in source["nodes"] if n["id"] == m["start"])
            b = next(n for n in source["nodes"] if n["id"] == m["end"])
            dx, dy = b["x"] - a["x"], b["y"] - a["y"]
            length = (dx * dx + dy * dy) ** 0.5
            qx, qy = -dy / length * m["q"], dx / length * m["q"]
            if qx:
                frame.add_member_dist_load(m["id"], "FX", qx, qx, case="L")
            if qy:
                frame.add_member_dist_load(m["id"], "FY", qy, qy, case="L")
    frame.add_load_combo("Service", {"L": 1.0})
    frame.analyze_linear(check_stability=True)
    results[path.stem] = {
        "model": source,
        "nodes": [{"id": n.name, "ux": float(n.DX["Service"]), "uy": float(n.DY["Service"]),
                   "rz": float(n.RZ["Service"]), "rx": float(n.RxnFX["Service"]),
                   "ry": float(n.RxnFY["Service"]), "rm": float(n.RxnMZ["Service"])}
                  for n in frame.nodes.values()],
    }
output = ROOT / "tests" / "fixtures" / "pynite-reference.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({"reference": "PyniteFEA", "version": version("PyniteFEA"),
                              "analysis": "linear elastic XY plane; out-of-plane DOFs restrained",
                              "cases": results}, indent=2) + "\n", encoding="utf-8")
print(f"Generated {len(results)} independent reference cases using PyniteFEA {version('PyniteFEA')}.")
