"""Tests for scripts/synthetic/mock_waves.py (simulated history for the portal mock-up)."""

import numpy as np

from scripts.synthetic.mock_waves import WAVES, band, build, half, simulate_history


def _doc(region, med, n=30):
    return {"published": True, "n": n, "school": {"region": region},
            "metrics": {"demographics.age.median": med, "demographics.age.q1": med - 4,
                        "demographics.age.q3": med + 5}}


def test_half_rounding():
    assert [half(v) for v in (33.2, 33.3, 33.75, 34.0)] == [33.0, 33.5, 34.0, 34.0]


def test_history_keeps_2026_exact_and_respects_join_year():
    rng = np.random.default_rng(1)
    for _ in range(200):
        h = simulate_history({"median": 35.0, "q1": 30.0, "q3": 41.0, "n": 28}, rng)
        assert list(h) == WAVES
        assert h[2026] == {"median": 35.0, "q1": 30.0, "q3": 41.0, "n": 28}
        present = [y for y in WAVES if h[y] is not None]
        assert present == list(range(present[0], 2027))          # no gaps after joining
        for y in present:
            assert h[y]["q1"] < h[y]["median"] < h[y]["q3"] and h[y]["n"] >= 10


def test_band_hand_calculated():
    # medians 30, 32, 34, 36: median 33, p25 = 31.5, p75 = 34.5
    assert band([30, 32, 34, 36]) == {"median": 33.0, "p25": 31.5, "p75": 34.5, "n_schools": 4}
    assert band([]) is None


def test_build_is_deterministic_anonymous_and_excludes_own_school():
    docs_in = {"A": _doc("Europe", 33), "B": _doc("Europe", 36), "C": _doc("Asia", 38),
               "D": {"published": False, "n": 5, "school": {"region": "Asia"}, "metrics": None}}
    a, b = build(docs_in, seed=3), build(docs_in, seed=3)
    assert a == b                                     # same seed -> same mock
    assert set(a) == {"A", "B", "C"}                  # unpublished school D is left out
    w26 = a["A"]["benchmarks"]["all"]["waves"][2026]
    assert len(w26["peers"]) == 2                     # B and C, not A itself
    assert all(set(p) == {"median", "q1", "q3"} for p in w26["peers"])
    assert w26["band"]["n_schools"] == 3              # the band includes all schools present
    assert a["A"]["simulated"] is True
    assert set(a["C"]["benchmarks"]) == {"all", "region=Asia"}


def test_demo_all_is_never_a_peer_and_has_every_wave():
    docs_in = {"A": _doc("Europe", 33), "B": _doc("Asia", 36),
               "ALL": dict(_doc("All regions", 34, n=60), demo=True, school={"region": "All regions", "school_id": "ALL"})}
    out = build(docs_in, seed=5)
    assert len(out["A"]["benchmarks"]["all"]["waves"][2026]["peers"]) == 1     # only B, never ALL
    assert out["A"]["benchmarks"]["all"]["waves"][2026]["band"]["n_schools"] == 2
    d = out["ALL"]
    assert d["demo"] is True and all(d["own"][y] is not None for y in WAVES)
    assert d["own"][2026]["median"] == 34
    assert len(d["benchmarks"]["all"]["waves"][2026]["peers"]) == 2          # A and B
