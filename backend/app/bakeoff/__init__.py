"""
Bake-Off package — Phase 6.

Provides a labelled dataset of synthetic bot threads and human-like threads,
plus an evaluator that runs the full detection pipeline over them and reports
honest accuracy metrics (confusion matrix, precision, recall, F1, FPR).

This is the project's "show your homework" layer: instead of claiming the
detector works, we measure it on labelled data and publish the numbers —
including where it fails.

Public API:
    build_dataset()        -> list[LabeledThread]
    evaluate_dataset(...)  -> BakeoffReport
    tune_threshold(...)    -> ThresholdSweep
"""

from app.bakeoff.dataset import LabeledThread, build_dataset
from app.bakeoff.evaluate import (
    BakeoffReport,
    ConfusionMatrix,
    ThreadPrediction,
    ThresholdSweep,
    evaluate_dataset,
    tune_threshold,
)

__all__ = [
    "LabeledThread",
    "build_dataset",
    "BakeoffReport",
    "ConfusionMatrix",
    "ThreadPrediction",
    "ThresholdSweep",
    "evaluate_dataset",
    "tune_threshold",
]
