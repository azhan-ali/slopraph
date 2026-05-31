"""
Signal 2 — Vocabulary Echo Matrix.

Bot-rings reuse the same rare phrases across multiple accounts.
Real users have diverse vocabulary; bots often share a template.

What we compute
---------------
1. Build a TF-IDF matrix over all non-removed comment texts.
2. Compute pairwise cosine similarity between all author text vectors
   (aggregating all comments per author into one document).
3. Flag author-pairs with similarity above ECHO_THRESHOLD as an "echo pair".
4. Cluster echo pairs into "echo rings" (connected components).

Per-author:
  echo_score    float [0–1]  — fraction of other authors this author
                               shares high similarity with.

Thread-level:
  echo_pairs        int      — number of high-similarity author pairs.
  echo_rings        list     — list of author clusters (each a list of authors).
  echo_suspicion    float    — normalised suspicion score (0–1).

Design notes
------------
• We aggregate all text per author before vectorising. This means an author
  who posts many short comments is treated the same as one who posts one
  long comment — the signal is about vocabulary overlap, not volume.
• Removed/deleted comments are excluded from text analysis (their text is "").
• With fewer than 3 authors the signal is unreliable; we return neutral.
• We use a small, fast TF-IDF (no external model) so this runs in <100ms
  even on 200-comment threads.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import networkx as nx
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

# Cosine similarity above this threshold = "echo pair".
ECHO_THRESHOLD: float = 0.65

# Minimum number of distinct authors needed for a meaningful signal.
MIN_AUTHORS: int = 3

# Minimum number of non-empty words in an author's combined text.
MIN_WORDS: int = 3


@dataclass
class VocabEchoResult:
    """Output of the vocabulary echo signal computation."""

    # Per-author echo scores (author → 0–1)
    author_echo_scores: dict[str, float] = field(default_factory=dict)

    # Echo rings: list of author clusters sharing vocabulary
    echo_rings: list[list[str]] = field(default_factory=list)

    # Thread-level aggregates
    echo_pairs: int = 0
    echo_suspicion: float = 0.0   # combined 0–1 score

    # Per-node suspicion (node_id → 0–1)
    node_scores: dict[str, float] = field(default_factory=dict)


def compute_vocab_echo_signal(G: nx.DiGraph) -> VocabEchoResult:
    """
    Compute vocabulary echo suspicion scores from the conversation graph.

    Args:
        G: A DiGraph enriched by `build_graph` (nodes have `text`, `author`,
           `is_removed` attributes).

    Returns:
        A `VocabEchoResult` with per-author and thread-level scores.
    """
    result = VocabEchoResult()

    if G.number_of_nodes() < 2:
        return result

    # ── Aggregate text per author ──────────────────────────────────────
    author_texts: dict[str, list[str]] = {}
    node_author: dict[str, str] = {}

    for node_id in G.nodes:
        attrs = G.nodes[node_id]
        author = attrs.get("author", "")
        text = attrs.get("text", "")
        is_removed = attrs.get("is_removed", False)

        node_author[node_id] = author
        if not is_removed and text.strip():
            author_texts.setdefault(author, []).append(text)

    # Filter to authors with enough text.
    valid_authors = [
        a for a, texts in author_texts.items()
        if len(" ".join(texts).split()) >= MIN_WORDS
    ]

    if len(valid_authors) < MIN_AUTHORS:
        return result

    # ── TF-IDF vectorisation ──────────────────────────────────────────
    author_docs = [" ".join(author_texts[a]) for a in valid_authors]

    try:
        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),   # unigrams + bigrams
            min_df=1,
            max_features=5000,
            sublinear_tf=True,
        )
        tfidf_matrix = vectorizer.fit_transform(author_docs)
    except ValueError as exc:
        logger.warning("TF-IDF vectorisation failed: %s", exc)
        return result

    # ── Pairwise cosine similarity ─────────────────────────────────────
    sim_matrix: np.ndarray = cosine_similarity(tfidf_matrix)
    n = len(valid_authors)

    # ── Identify echo pairs and build adjacency for ring detection ─────
    echo_adj: dict[str, set[str]] = {a: set() for a in valid_authors}
    echo_pair_count = 0

    for i in range(n):
        for j in range(i + 1, n):
            sim = float(sim_matrix[i, j])
            if sim >= ECHO_THRESHOLD:
                a_i = valid_authors[i]
                a_j = valid_authors[j]
                echo_adj[a_i].add(a_j)
                echo_adj[a_j].add(a_i)
                echo_pair_count += 1

    result.echo_pairs = echo_pair_count

    # ── Per-author echo score ──────────────────────────────────────────
    for author in valid_authors:
        echo_score = len(echo_adj[author]) / (n - 1) if n > 1 else 0.0
        result.author_echo_scores[author] = round(echo_score, 4)

    # ── Echo rings (connected components of echo graph) ───────────────
    visited: set[str] = set()
    rings: list[list[str]] = []
    for author in valid_authors:
        if author in visited or not echo_adj[author]:
            continue
        # BFS to find the connected component.
        ring: list[str] = []
        queue = [author]
        while queue:
            cur = queue.pop(0)
            if cur in visited:
                continue
            visited.add(cur)
            ring.append(cur)
            queue.extend(echo_adj[cur] - visited)
        if len(ring) >= 2:
            rings.append(sorted(ring))

    result.echo_rings = rings

    # ── Thread-level echo suspicion ───────────────────────────────────
    # Normalise by maximum possible pairs.
    max_pairs = n * (n - 1) / 2
    pair_ratio = echo_pair_count / max_pairs if max_pairs > 0 else 0.0
    result.echo_suspicion = round(min(pair_ratio * 2.0, 1.0), 4)  # amplify slightly

    # ── Per-node scores ────────────────────────────────────────────────
    for node_id, author in node_author.items():
        result.node_scores[node_id] = result.author_echo_scores.get(author, 0.0)

    return result
