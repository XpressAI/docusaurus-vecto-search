import type { BM25SerializedIndex } from "../types";

export class BM25Index {
  private k1: number;
  private b: number;
  private documents = new Map<
    string,
    { terms: Record<string, number>; length: number; title: string }
  >();
  private df = new Map<string, number>();
  private idf = new Map<string, number>();
  private totalLength = 0;
  private avgdl = 0;

  constructor(params: { k1?: number; b?: number } = {}) {
    this.k1 = params.k1 ?? 1.5;
    this.b = params.b ?? 0.75;
  }

  static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  addDocument(id: string, text: string, title = ""): void {
    const terms = BM25Index.tokenize(text);
    const titleTerms = BM25Index.tokenize(title);
    const allTerms = [...terms, ...titleTerms, ...titleTerms];

    const termFreq: Record<string, number> = {};
    for (const term of allTerms) {
      termFreq[term] = (termFreq[term] || 0) + 1;
    }

    const uniqueTerms = new Set(allTerms);
    for (const term of uniqueTerms) {
      this.df.set(term, (this.df.get(term) || 0) + 1);
    }

    this.documents.set(id, {
      terms: termFreq,
      length: allTerms.length,
      title,
    });

    this.totalLength += allTerms.length;
  }

  computeIDF(): void {
    const N = this.documents.size;
    this.avgdl = this.totalLength / N;

    for (const [term, df] of this.df.entries()) {
      this.idf.set(
        term,
        Math.max(0, Math.log((N - df + 0.5) / (df + 0.5) + 1))
      );
    }
  }

  serialize(): BM25SerializedIndex {
    const docs: BM25SerializedIndex["documents"] = {};
    for (const [id, doc] of this.documents.entries()) {
      docs[id] = doc;
    }
    return {
      k1: this.k1,
      b: this.b,
      documents: docs,
      df: Object.fromEntries(this.df),
      idf: Object.fromEntries(this.idf),
      totalLength: this.totalLength,
      avgdl: this.avgdl,
    };
  }
}
