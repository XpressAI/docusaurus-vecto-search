// ── Plugin Configuration ──

export interface VectorSearchConfig {
  mode: "bm25" | "vector" | "hybrid";

  vecto: {
    publicToken: string;
    vectorSpaceId: number | null;
    clearOnBuild: boolean;
    batchSize: number;
    /** USAGE token for build-time ingest. Prefer VECTO_USER_TOKEN env var. */
    userToken?: string;
  };

  bm25: {
    k1: number;
    b: number;
  };

  rrf: {
    k: number;
  };

  weights: {
    vector: number;
    bm25: number;
  } | null;

  maxResults: number;

  content: {
    chunkSize: number;
    chunkOverlap: number;
  };

  hotkey: string;
  placeholder: string;
  indexPath: string;
}

// ── Document Types ──

export interface DocumentChunk {
  id: string;
  url: string;
  title: string;
  heading: string;
  text: string;
  version: string;
  language: string;
  docusaurusTag: string;
}

export interface DocumentMeta {
  id: string;
  url: string;
  title: string;
  heading: string;
  version: string;
  language: string;
  snippet: string;
}

// ── Search Types ──

export interface SearchResult {
  id: string;
  score: number;
  url: string;
  title: string;
  heading: string;
  version: string;
  language: string;
  snippet: string;
}

export interface ScoredId {
  id: string;
  score: number;
}

// ── BM25 Serialized Index ──

export interface BM25SerializedIndex {
  k1: number;
  b: number;
  documents: Record<
    string,
    { terms: Record<string, number>; length: number; title: string }
  >;
  df: Record<string, number>;
  idf: Record<string, number>;
  totalLength: number;
  avgdl: number;
}

// ── Vecto API Types ──

export interface VectoLookupResult {
  id: number;
  similarity: number;
  attributes: string | Record<string, unknown>;
}

export interface VectoAttributes {
  id: string;
  url: string;
  title: string;
  heading: string;
  version: string;
  language: string;
  docusaurusTag: string;
  snippet: string;
}
