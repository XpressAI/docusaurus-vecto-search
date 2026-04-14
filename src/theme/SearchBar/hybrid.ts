import type { ScoredId } from "../../types";

/**
 * Reciprocal Rank Fusion.
 * score(d) = Σ 1 / (k + rank_i(d))
 */
export function reciprocalRankFusion(
  resultSets: ScoredId[][],
  k = 60,
  maxResults = 10
): ScoredId[] {
  const scores = new Map<string, number>();

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const { id } = results[rank];
      const rrfScore = 1 / (k + rank + 1);
      scores.set(id, (scores.get(id) ?? 0) + rrfScore);
    }
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Weighted score normalization fusion.
 * final = α · norm_vector(d) + (1 − α) · norm_bm25(d)
 */
export function weightedScoreFusion({
  bm25Results,
  vectorResults,
  vectorWeight = 0.7,
  maxResults = 10,
}: {
  bm25Results: ScoredId[];
  vectorResults: ScoredId[];
  vectorWeight?: number;
  maxResults?: number;
}): ScoredId[] {
  const bm25Weight = 1 - vectorWeight;
  const normBM25 = minMaxNormalize(bm25Results);
  const normVector = minMaxNormalize(vectorResults);

  const scores = new Map<string, number>();

  for (const { id, score } of normBM25) {
    scores.set(id, (scores.get(id) ?? 0) + bm25Weight * score);
  }
  for (const { id, score } of normVector) {
    scores.set(id, (scores.get(id) ?? 0) + vectorWeight * score);
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

function minMaxNormalize(results: ScoredId[]): ScoredId[] {
  if (results.length === 0) return [];
  const scores = results.map((r) => r.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  return results.map((r) => ({
    id: r.id,
    score: (r.score - min) / range,
  }));
}
