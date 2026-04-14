import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { BM25Search } from "./bm25";
import { VectoSearch } from "./vecto";
import { reciprocalRankFusion, weightedScoreFusion } from "./hybrid";
import type {
  VectorSearchConfig,
  DocumentMeta,
  SearchResult,
  ScoredId,
} from "../../types";

// Contextual search filters — available when using versioned docs or i18n.
// Gracefully falls back if not available.
type ContextualFilters = { version?: string; locale?: string; tags?: string[] };
type ThemeCommonModule = { useContextualSearchFilters?: () => ContextualFilters };
let useContextualSearchFilters: (() => ContextualFilters) | null = null;

try {
  // Optional peer dependency — resolved at runtime by Docusaurus webpack.
  // Using Function constructor to avoid webpack static analysis.
  const dynamicRequire = new Function("id", "return require(id)") as (id: string) => unknown;
  const themeCommon = dynamicRequire("@docusaurus/theme-common") as ThemeCommonModule | undefined;
  useContextualSearchFilters = themeCommon?.useContextualSearchFilters ?? null;
} catch {
  // Not available
}

interface UseSearchEngineReturn {
  search: (query: string) => Promise<SearchResult[]>;
  suggest: (query: string) => string;
  ready: boolean;
}

export function useSearchEngine(): UseSearchEngineReturn {
  const { siteConfig } = useDocusaurusContext();
  const config = (
    siteConfig.themeConfig as { vectorSearch?: VectorSearchConfig }
  ).vectorSearch;

  const baseUrl = siteConfig.baseUrl || "/";
  const mode = config?.mode ?? "hybrid";
  const maxResults = config?.maxResults ?? 10;
  const indexPath = config?.indexPath ?? "search-index";
  const rrfK = config?.rrf?.k ?? 60;
  const weights = config?.weights ?? null;
  const publicToken = config?.vecto?.publicToken ?? "";
  const vectorSpaceId = config?.vecto?.vectorSpaceId ?? 0;

  // ── Contextual filters ──
  let contextVersion: string | null = null;
  let contextLocale: string | null = null;

  if (useContextualSearchFilters) {
    try {
      const filters = useContextualSearchFilters();
      contextVersion = filters.version ?? null;
      contextLocale = filters.locale ?? null;
    } catch {
      // Not in a versioned context
    }
  }

  // ── State ──
  const [documents, setDocuments] = useState<DocumentMeta[] | null>(null);
  const bm25Ref = useRef<BM25Search | null>(null);
  const vectoRef = useRef<VectoSearch | null>(null);
  const [ready, setReady] = useState(false);

  // ── Init ──
  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      // Load document metadata
      try {
        const res = await fetch(`${baseUrl}${indexPath}/documents.json`);
        if (res.ok) {
          const docs: DocumentMeta[] = await res.json();
          if (!cancelled) setDocuments(docs);
        }
      } catch (err) {
        console.error("[vector-search] Failed to load documents.json:", err);
      }

      // BM25
      if (mode === "bm25" || mode === "hybrid") {
        const bm25 = new BM25Search();
        await bm25.load(baseUrl, indexPath);
        if (!cancelled) bm25Ref.current = bm25;
      }

      // Vecto
      if (mode === "vector" || mode === "hybrid") {
        if (publicToken && vectorSpaceId) {
          const vecto = new VectoSearch({ publicToken, vectorSpaceId });
          if (!cancelled) vectoRef.current = vecto;
        }
      }

      if (!cancelled) setReady(true);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [mode, baseUrl, indexPath, publicToken, vectorSpaceId]);

  // ── Doc lookup map ──
  const docMap = useMemo(() => {
    if (!documents) return new Map<string, DocumentMeta>();
    return new Map(documents.map((d) => [d.id, d]));
  }, [documents]);

  // ── Search ──
  const search = useCallback(
    async (query: string): Promise<SearchResult[]> => {
      if (!ready || !query || query.length < 2) return [];

      const fetchSize = maxResults * 3;
      let fusedIds: ScoredId[];

      if (mode === "bm25") {
        fusedIds = bm25Ref.current?.search(query, maxResults) ?? [];
      } else if (mode === "vector") {
        const vectoResults =
          (await vectoRef.current?.lookup(query, maxResults)) ?? [];
        fusedIds = vectoResults.map((r) => ({ id: r.id, score: r.score }));
      } else {
        // Hybrid
        const bm25Results =
          bm25Ref.current?.search(query, fetchSize) ?? [];
        const vectoResults =
          (await vectoRef.current?.lookup(query, fetchSize)) ?? [];
        const vectoForFusion: ScoredId[] = vectoResults.map((r) => ({
          id: r.id,
          score: r.score,
        }));

        if (weights) {
          fusedIds = weightedScoreFusion({
            bm25Results,
            vectorResults: vectoForFusion,
            vectorWeight: weights.vector ?? 0.7,
            maxResults,
          });
        } else {
          fusedIds = reciprocalRankFusion(
            [bm25Results, vectoForFusion],
            rrfK,
            maxResults
          );
        }
      }

      // ── Enrich with metadata ──
      let enriched: SearchResult[] = fusedIds.map(({ id, score }) => {
        const meta = docMap.get(id);
        return {
          id,
          score,
          url: meta?.url ?? "",
          title: meta?.title ?? "",
          heading: meta?.heading ?? "",
          version: meta?.version ?? "",
          language: meta?.language ?? "",
          snippet: meta?.snippet ?? "",
        };
      });

      // ── Filter by version/locale ──
      if (contextVersion) {
        enriched = enriched.filter(
          (r) =>
            !r.version ||
            r.version === contextVersion ||
            r.version === "current"
        );
      }
      if (contextLocale) {
        enriched = enriched.filter(
          (r) => !r.language || r.language === contextLocale
        );
      }

      return enriched.slice(0, maxResults);
    },
    [ready, mode, maxResults, rrfK, weights, docMap, contextVersion, contextLocale]
  );

  // ── Autocomplete suggestion ──
  // Prefix-match the last word of the query against document titles/headings.
  const titles = useMemo(() => {
    if (!documents) return [] as string[];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const d of documents) {
      const t = d.title.toLowerCase();
      if (!seen.has(t)) {
        seen.add(t);
        result.push(d.title);
      }
      if (d.heading && d.heading !== d.title) {
        const h = d.heading.toLowerCase();
        if (!seen.has(h)) {
          seen.add(h);
          result.push(d.heading);
        }
      }
    }
    return result;
  }, [documents]);

  const suggest = useCallback(
    (query: string): string => {
      if (!query || query.length < 2 || titles.length === 0) return "";
      const lower = query.toLowerCase();
      // Find the first title that starts with the full query
      for (const t of titles) {
        if (t.toLowerCase().startsWith(lower) && t.toLowerCase() !== lower) {
          // Return suggestion preserving the user's typed casing
          return query + t.slice(query.length);
        }
      }
      return "";
    },
    [titles]
  );

  return { search, suggest, ready };
}
