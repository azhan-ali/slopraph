"""
Phase 6 test suite — Bake-Off + cross-platform adapters (YouTube, Amazon).

Covered:
  • Dataset generator: determinism, labels, structure, bot/human hallmarks
  • Evaluator: confusion matrix maths, metrics formulas, edge cases
  • Threshold tuning: sweep correctness, F1-optimal selection
  • /bakeoff endpoint: shape, ranges, param validation
  • /bakeoff/tune endpoint: shape, validation
  • YouTube adapter: URL parsing (all variants), fixture parse, missing-key error
  • Amazon adapter: ASIN parsing (all variants), fixture parse
  • Cross-platform /scan: YouTube + Amazon end-to-end via demo fixtures
  • Honest-metrics guarantees: zero false positives, separation bot vs human
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters import AmazonAdapter, YouTubeAdapter
from app.adapters.base import AdapterFetchError, AdapterURLError
from app.bakeoff import build_dataset, evaluate_dataset, tune_threshold
from app.bakeoff.dataset import LABEL_BOT, LABEL_HUMAN
from app.bakeoff.evaluate import ConfusionMatrix, _compute_metrics
from app.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures"


# ════════════════════════════════════════════════════════════════════════════
# Dataset generator
# ════════════════════════════════════════════════════════════════════════════
class TestDataset:
    def test_default_size(self):
        ds = build_dataset()
        assert len(ds) == 24  # 12 bot + 12 human

    def test_custom_size(self):
        ds = build_dataset(n_bot=5, n_human=7)
        assert len(ds) == 12
        bots = [t for t in ds if t.label == LABEL_BOT]
        humans = [t for t in ds if t.label == LABEL_HUMAN]
        assert len(bots) == 5
        assert len(humans) == 7

    def test_deterministic(self):
        """Same seed → identical dataset (reproducible metrics)."""
        ds1 = build_dataset(seed=42)
        ds2 = build_dataset(seed=42)
        assert len(ds1) == len(ds2)
        for a, b in zip(ds1, ds2):
            assert a.name == b.name
            assert a.label == b.label
            assert len(a.comments) == len(b.comments)
            assert [c.text for c in a.comments] == [c.text for c in b.comments]
            assert [c.timestamp for c in a.comments] == [c.timestamp for c in b.comments]

    def test_different_seed_differs(self):
        ds1 = build_dataset(seed=1)
        ds2 = build_dataset(seed=999)
        texts1 = [c.text for t in ds1 for c in t.comments]
        texts2 = [c.text for t in ds2 for c in t.comments]
        # Not guaranteed fully different, but structure/timing should vary.
        ts1 = [c.timestamp for t in ds1 for c in t.comments]
        ts2 = [c.timestamp for t in ds2 for c in t.comments]
        assert ts1 != ts2 or texts1 != texts2

    def test_invalid_size_raises(self):
        with pytest.raises(ValueError):
            build_dataset(n_bot=0)
        with pytest.raises(ValueError):
            build_dataset(n_human=0)

    def test_every_thread_has_root(self):
        for t in build_dataset():
            roots = [c for c in t.comments if c.parent_id is None]
            assert len(roots) == 1, f"{t.name} must have exactly one root"

    def test_labels_valid(self):
        for t in build_dataset():
            assert t.label in (LABEL_BOT, LABEL_HUMAN)

    def test_bot_threads_have_burst_timing(self):
        """Bot threads should have tight reply gaps (within 30s burst window)."""
        for t in build_dataset():
            if t.label != LABEL_BOT:
                continue
            ts = sorted(c.timestamp for c in t.comments)
            gaps = [b - a for a, b in zip(ts, ts[1:])]
            # At least some gaps under the burst window.
            assert any(g < 30 for g in gaps), f"{t.name} should have burst gaps"


# ════════════════════════════════════════════════════════════════════════════
# Evaluator — confusion matrix + metrics
# ════════════════════════════════════════════════════════════════════════════
class TestEvaluator:
    def test_metrics_formula_perfect(self):
        cm = ConfusionMatrix(true_positive=10, false_positive=0, false_negative=0, true_negative=10)
        prec, rec, f1, acc, fpr = _compute_metrics(cm)
        assert prec == 1.0
        assert rec == 1.0
        assert f1 == 1.0
        assert acc == 1.0
        assert fpr == 0.0

    def test_metrics_formula_all_wrong(self):
        cm = ConfusionMatrix(true_positive=0, false_positive=10, false_negative=10, true_negative=0)
        prec, rec, f1, acc, fpr = _compute_metrics(cm)
        assert prec == 0.0
        assert rec == 0.0
        assert acc == 0.0
        assert fpr == 1.0

    def test_metrics_zero_division_safe(self):
        cm = ConfusionMatrix()  # all zeros
        prec, rec, f1, acc, fpr = _compute_metrics(cm)
        assert prec == 0.0 and rec == 0.0 and f1 == 0.0 and acc == 0.0 and fpr == 0.0

    def test_metrics_known_values(self):
        # TP=8 FP=2 FN=4 TN=6
        cm = ConfusionMatrix(true_positive=8, false_positive=2, false_negative=4, true_negative=6)
        prec, rec, f1, acc, fpr = _compute_metrics(cm)
        assert prec == 0.8                      # 8/10
        assert round(rec, 4) == 0.6667          # 8/12
        assert acc == 0.7                        # 14/20
        assert fpr == 0.25                       # 2/8

    def test_evaluate_default_dataset(self):
        report = evaluate_dataset()
        assert report.confusion.total == 24
        assert 0.0 <= report.precision <= 1.0
        assert 0.0 <= report.recall <= 1.0
        assert 0.0 <= report.accuracy <= 1.0
        assert len(report.predictions) == 24

    def test_evaluate_zero_false_positives(self):
        """Honest-metrics guarantee: detector must not accuse humans."""
        report = evaluate_dataset()
        assert report.confusion.false_positive == 0, (
            "Detector flagged a human thread as bot — false positive!"
        )
        assert report.false_positive_rate == 0.0

    def test_evaluate_strong_accuracy(self):
        """At the tuned threshold the detector should be clearly useful."""
        report = evaluate_dataset()
        assert report.accuracy >= 0.85
        assert report.recall >= 0.75

    def test_bot_health_lower_than_human(self):
        """Every bot prediction's health should be below every human's."""
        report = evaluate_dataset()
        bot_healths = [p.thread_health for p in report.predictions if p.actual == LABEL_BOT]
        human_healths = [p.thread_health for p in report.predictions if p.actual == LABEL_HUMAN]
        assert max(bot_healths) < min(human_healths), (
            "Bot and human health distributions overlap — no clean separation"
        )

    def test_empty_dataset_raises(self):
        with pytest.raises(ValueError):
            evaluate_dataset([])

    def test_threshold_changes_predictions(self):
        """A stricter threshold should never reduce recall (catches >= bots)."""
        low = evaluate_dataset(threshold=40)
        high = evaluate_dataset(threshold=70)
        # Higher threshold → more threads flagged bot → recall >= low's recall.
        assert high.recall >= low.recall


# ════════════════════════════════════════════════════════════════════════════
# Threshold tuning
# ════════════════════════════════════════════════════════════════════════════
class TestThresholdTuning:
    def test_returns_best_threshold(self):
        sweep = tune_threshold()
        assert 30 <= sweep.best_threshold <= 70
        assert 0.0 <= sweep.best_f1 <= 1.0

    def test_sweep_table_populated(self):
        sweep = tune_threshold()
        assert len(sweep.sweep) > 0
        for row in sweep.sweep:
            assert "threshold" in row and "f1" in row
            assert 0.0 <= row["f1"] <= 1.0

    def test_best_f1_is_max_in_sweep(self):
        sweep = tune_threshold()
        max_f1 = max(row["f1"] for row in sweep.sweep)
        assert sweep.best_f1 == max_f1

    def test_custom_candidates(self):
        sweep = tune_threshold(build_dataset(), candidates=[50, 60])
        assert len(sweep.sweep) == 2
        assert sweep.best_threshold in (50, 60)


# ════════════════════════════════════════════════════════════════════════════
# /bakeoff endpoint
# ════════════════════════════════════════════════════════════════════════════
class TestBakeoffEndpoint:
    def test_returns_200(self):
        resp = client.get("/bakeoff")
        assert resp.status_code == 200

    def test_response_shape(self):
        body = client.get("/bakeoff").json()
        assert body["ok"] is True
        assert "confusion" in body and "metrics" in body and "predictions" in body
        assert body["dataset_size"] == 24
        for key in ("true_positive", "false_positive", "false_negative", "true_negative"):
            assert key in body["confusion"]
        for key in ("precision", "recall", "f1", "accuracy", "false_positive_rate"):
            assert key in body["metrics"]

    def test_metrics_in_range(self):
        m = client.get("/bakeoff").json()["metrics"]
        for key, val in m.items():
            assert 0.0 <= val <= 1.0, f"{key}={val} out of range"

    def test_predictions_have_required_fields(self):
        preds = client.get("/bakeoff").json()["predictions"]
        assert len(preds) == 24
        for p in preds:
            assert p["actual"] in ("bot", "human")
            assert p["predicted"] in ("bot", "human")
            assert 0 <= p["thread_health"] <= 100
            assert isinstance(p["correct"], bool)

    def test_custom_params(self):
        body = client.get("/bakeoff?n_bot=3&n_human=4&threshold=55").json()
        assert body["dataset_size"] == 7
        assert body["threshold"] == 55

    def test_invalid_n_bot_rejected(self):
        resp = client.get("/bakeoff?n_bot=0")
        assert resp.status_code == 400

    def test_invalid_threshold_rejected(self):
        resp = client.get("/bakeoff?threshold=0")
        assert resp.status_code == 400
        resp2 = client.get("/bakeoff?threshold=100")
        assert resp2.status_code == 400

    def test_confusion_matrix_sums_to_dataset(self):
        body = client.get("/bakeoff").json()
        cm = body["confusion"]
        total = cm["true_positive"] + cm["false_positive"] + cm["false_negative"] + cm["true_negative"]
        assert total == body["dataset_size"]


class TestBakeoffTuneEndpoint:
    def test_returns_200(self):
        resp = client.get("/bakeoff/tune")
        assert resp.status_code == 200

    def test_response_shape(self):
        body = client.get("/bakeoff/tune").json()
        assert body["ok"] is True
        assert "best_threshold" in body and "best_f1" in body and "sweep" in body
        assert len(body["sweep"]) > 0

    def test_invalid_params_rejected(self):
        assert client.get("/bakeoff/tune?n_bot=0").status_code == 400


# ════════════════════════════════════════════════════════════════════════════
# YouTube adapter
# ════════════════════════════════════════════════════════════════════════════
class TestYouTubeAdapter:
    @pytest.mark.parametrize("url,expected", [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"),
    ])
    def test_extract_video_id_variants(self, url, expected):
        assert YouTubeAdapter._extract_video_id(url) == expected

    def test_extract_video_id_rejects_non_youtube(self):
        with pytest.raises(AdapterURLError):
            YouTubeAdapter._extract_video_id("https://vimeo.com/12345")

    def test_extract_video_id_rejects_empty(self):
        with pytest.raises(AdapterURLError):
            YouTubeAdapter._extract_video_id("")

    def test_parse_fixture(self):
        with open(FIXTURES / "youtube_thread.json", encoding="utf-8") as f:
            payload = json.load(f)
        result = YouTubeAdapter._parse_api_response(
            payload["video"], payload["threads"],
            video_id="dQw4w9WgXcQ",
            original_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            max_comments=200,
        )
        assert result.platform.value == "youtube"
        # 1 root + 4 top-level + 3 replies = 8
        assert len(result.comments) == 8
        root = [c for c in result.comments if c.parent_id is None]
        assert len(root) == 1
        # Replies should reference their top-level parent.
        non_root = [c for c in result.comments if c.parent_id is not None]
        ids = {c.id for c in result.comments}
        for c in non_root:
            assert c.parent_id in ids

    def test_missing_api_key_errors_clearly(self, monkeypatch):
        """Without a key (and not demo mode) the adapter must fail with guidance."""
        monkeypatch.delenv("USE_DEMO_FIXTURE", raising=False)
        from app.config import get_settings
        get_settings.cache_clear()
        adapter = YouTubeAdapter(api_key="")
        with pytest.raises(AdapterFetchError) as exc:
            adapter.fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        assert "YOUTUBE_API_KEY" in str(exc.value)

    def test_demo_mode_fetch(self, enable_demo_mode):
        adapter = YouTubeAdapter()
        result = adapter.fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        assert len(result.comments) == 8
        assert result.title is not None


# ════════════════════════════════════════════════════════════════════════════
# Amazon adapter
# ════════════════════════════════════════════════════════════════════════════
class TestAmazonAdapter:
    @pytest.mark.parametrize("url,expected", [
        ("https://www.amazon.com/dp/B0EXAMPLE1", "B0EXAMPLE1"),
        ("https://www.amazon.com/gp/product/B0EXAMPLE1", "B0EXAMPLE1"),
        ("https://www.amazon.com/Some-Product-Name/dp/B0EXAMPLE1/ref=sr_1_1", "B0EXAMPLE1"),
        ("https://amazon.co.uk/dp/B0EXAMPLE1", "B0EXAMPLE1"),
    ])
    def test_extract_asin_variants(self, url, expected):
        assert AmazonAdapter._extract_asin(url) == expected

    def test_extract_asin_rejects_non_amazon(self):
        with pytest.raises(AdapterURLError):
            AmazonAdapter._extract_asin("https://ebay.com/itm/12345")

    def test_extract_asin_rejects_shortlink(self):
        with pytest.raises(AdapterURLError):
            AmazonAdapter._extract_asin("https://amzn.to/3abcXYZ")

    def test_parse_fixture(self):
        with open(FIXTURES / "amazon_reviews.json", encoding="utf-8") as f:
            payload = json.load(f)
        result = AmazonAdapter._parse_reviews(
            payload, asin="B0EXAMPLE1",
            original_url="https://www.amazon.com/dp/B0EXAMPLE1",
            max_comments=200,
        )
        assert result.platform.value == "amazon"
        # 1 product root + 7 reviews = 8
        assert len(result.comments) == 8
        root = [c for c in result.comments if c.parent_id is None]
        assert len(root) == 1
        # All reviews attach to the product root.
        reviews = [c for c in result.comments if c.parent_id is not None]
        assert all(c.parent_id == root[0].id for c in reviews)

    def test_fetch_serves_fixture(self):
        adapter = AmazonAdapter()
        result = adapter.fetch("https://www.amazon.com/dp/B0EXAMPLE1")
        assert len(result.comments) == 8
        assert result.platform.value == "amazon"

    def test_max_comments_cap(self):
        adapter = AmazonAdapter()
        result = adapter.fetch("https://www.amazon.com/dp/B0EXAMPLE1", max_comments=3)
        assert len(result.comments) <= 3


# ════════════════════════════════════════════════════════════════════════════
# Cross-platform /scan integration
# ════════════════════════════════════════════════════════════════════════════
class TestCrossPlatformScan:
    def test_youtube_scan_demo(self, enable_demo_mode):
        resp = client.post("/scan", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["platform"] == "youtube"
        assert body["thread_health"] is not None
        assert body["signal_scores"] is not None
        # The bot comments share identical text → echo ring detected.
        assert len(body["signal_scores"]["echo_rings"]) >= 1

    def test_amazon_scan(self):
        resp = client.post("/scan", json={"url": "https://www.amazon.com/dp/B0EXAMPLE1"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["platform"] == "amazon"
        assert body["thread_health"] is not None
        # Fake-review ring shares identical text → echo ring detected.
        assert len(body["signal_scores"]["echo_rings"]) >= 1

    def test_amazon_nodes_have_badges(self):
        body = client.post("/scan", json={"url": "https://www.amazon.com/dp/B0EXAMPLE1"}).json()
        for node in body["nodes"]:
            assert node["badge"] in ("human", "suspicious", "bot")

    def test_youtube_invalid_url_rejected(self):
        resp = client.post("/scan", json={"url": "https://www.youtube.com/watch?v=tooShort"})
        # Invalid video id → adapter URL error → 400
        assert resp.status_code == 400

    def test_amazon_shortlink_rejected(self):
        resp = client.post("/scan", json={"url": "https://amzn.to/3abcXYZ"})
        assert resp.status_code == 400
