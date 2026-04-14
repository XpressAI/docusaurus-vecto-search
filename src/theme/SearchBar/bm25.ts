import type { BM25SerializedIndex, ScoredId } from "../../types";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export class BM25Search {
  private loaded = false;
  private k1 = 1.5;
  private b = 0.75;
  private documents: BM25SerializedIndex["documents"] = {};
  private idf: Record<string, number> = {};
  private avgdl = 0;

  async load(baseUrl: string, indexPath = "search-index"): Promise<void> {
    if (this.loaded) return;

    try {
      const url = `${baseUrl}${indexPath}/bm25-index.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BM25SerializedIndex = await res.json();

      this.k1 = data.k1;
      this.b = data.b;
      this.documents = data.documents;
      this.idf = data.idf;
      this.avgdl = data.avgdl;
      this.loaded = true;
    } catch (err) {
      console.error("[vector-search] Failed to load BM25 index:", err);
    }
  }

  search(query: string, maxResults = 10): ScoredId[] {
    if (!this.loaded) return [];

    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const scores: ScoredId[] = [];

    for (const [docId, doc] of Object.entries(this.documents)) {
      let score = 0;

      for (const term of queryTerms) {
        const idf = this.idf[term];
        if (!idf) continue;

        const tf = doc.terms[term] || 0;
        if (tf === 0) continue;

        const numerator = tf * (this.k1 + 1);
        const denominator =
          tf + this.k1 * (1 - this.b + this.b * (doc.length / this.avgdl));

        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.push({ id: docId, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, maxResults);
  }
}
