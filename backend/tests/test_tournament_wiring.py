"""MPCA-235 · Regression tests for the Tournament Wiring Console.

Ship 1 covers: GET matrix, PATCH cell, POST reset, GET export.
Hits the live running backend via REACT_APP_BACKEND_URL."""
import os
from pathlib import Path

import pytest
import requests


def _api():
    fe = Path("/app/frontend/.env")
    for ln in fe.read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def test_get_wiring_returns_matrix():
    r = requests.get(f"{API}/tournament-wiring", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == "singleton"
    assert len(d["steps"]) == 9
    assert len(d["types"]) == 8
    expected = {"bcci", "interdiv", "camp", "district",
                "interschool", "interclub", "coachingcamp", "vacationcamp"}
    assert set(d["cells"].keys()) == expected
    for tid in d["cells"]:
        assert len(d["cells"][tid]) == 9
    assert d["enums"]["flag"] == ["M", "O", "NA", "INFO"]


def test_patch_cell_updates_and_bumps_version():
    v0 = requests.get(f"{API}/tournament-wiring", timeout=20).json()["version"]
    r = requests.patch(f"{API}/tournament-wiring/cell", json={
        "type_id": "interdiv",
        "step_key": "squad_approval",
        "flag": "O",
        "text": "Regression test edit",
        "sla_days": 3,
    }, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["version"] == v0 + 1
    assert body["cell"]["flag"] == "O"
    assert body["cell"]["text"] == "Regression test edit"
    assert body["cell"]["sla_days"] == 3


def test_patch_cell_validates_enums():
    r = requests.patch(f"{API}/tournament-wiring/cell", json={
        "type_id": "bcci", "step_key": "squad", "flag": "MAYBE",
    }, timeout=20)
    assert r.status_code == 422


def test_patch_cell_rejects_unknown_type():
    r = requests.patch(f"{API}/tournament-wiring/cell", json={
        "type_id": "not-a-type", "step_key": "squad", "flag": "M",
    }, timeout=20)
    assert r.status_code == 404


def test_patch_cell_rejects_unknown_step():
    r = requests.patch(f"{API}/tournament-wiring/cell", json={
        "type_id": "bcci", "step_key": "not-a-step", "flag": "M",
    }, timeout=20)
    assert r.status_code == 404


def test_reset_restores_defaults():
    requests.patch(f"{API}/tournament-wiring/cell", json={
        "type_id": "bcci", "step_key": "squad_approval", "flag": "O",
    }, timeout=20)
    r = requests.post(f"{API}/tournament-wiring/reset", timeout=20)
    assert r.status_code == 200
    d = requests.get(f"{API}/tournament-wiring", timeout=20).json()
    assert d["cells"]["bcci"]["squad_approval"]["flag"] == "NA"


def test_export_shape():
    r = requests.get(f"{API}/tournament-wiring/export", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["meta"]["title"] == "MPCA Tournament Wiring"
    assert len(d["steps"]) == 9
    assert len(d["types"]) == 8
    for t in d["types"]:
        assert len(t["cells"]) == 9
        for c in t["cells"]:
            assert "flag" in c
            assert "owner" in c
            assert "step" in c
