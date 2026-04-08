import React, { useState, useEffect, useCallback } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import { useSearchEngine } from "../SearchBar/useSearchEngine";
import type { SearchResult } from "../../types";

import "./styles.css";

const RESULTS_PER_PAGE = 20;

function useQueryParam(key: string): string {
  const [value, setValue] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setValue(params.get(key) ?? "");
  }, [key]);
  return value;
}

export default function SearchPage(): JSX.Element {
  const initialQuery = useQueryParam("q");
  const { search, ready } = useSearchEngine();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  // Sync initial query from URL
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  // Run search when query changes
  const performSearch = useCallback(
    async (q: string): Promise<void> => {
      if (!ready || q.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await search(q);
        setResults(res);
        setPage(0);
      } catch (err) {
        console.error("[vector-search] Search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [search, ready]
  );

  useEffect(() => {
    if (query.length >= 2) {
      performSearch(query);
    }
  }, [query, performSearch]);

  // Pagination
  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
  const paginatedResults = results.slice(
    page * RESULTS_PER_PAGE,
    (page + 1) * RESULTS_PER_PAGE
  );

  return (
    <Layout>
      <div className="vs-search-page">
        <div className="vs-search-page-header">
          <form
            className="vs-search-page-form"
            onSubmit={(e) => {
              e.preventDefault();
              performSearch(query);
            }}
          >
            <input
              className="vs-search-page-input"
              type="search"
              placeholder="Search docs..."
              autoComplete="off"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          {query.length >= 2 && !loading && (
            <p className="vs-search-page-summary">
              {results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;
            </p>
          )}
        </div>

        <div className="vs-search-page-results">
          {loading && (
            <div className="vs-search-page-loading">Searching...</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="vs-search-page-empty">
              No results found for &quot;{query}&quot;
            </div>
          )}

          {!loading &&
            paginatedResults.map((result) => (
              <Link
                key={result.id}
                to={result.url}
                className="vs-search-page-result"
              >
                <h3 className="vs-search-page-result-title">
                  {result.title}
                  {result.heading && result.heading !== result.title && (
                    <span className="vs-search-page-result-heading">
                      {" › "}
                      {result.heading}
                    </span>
                  )}
                </h3>
                <p className="vs-search-page-result-snippet">
                  {result.snippet}
                </p>
                <span className="vs-search-page-result-url">{result.url}</span>
              </Link>
            ))}
        </div>

        {totalPages > 1 && (
          <nav className="vs-search-page-pagination">
            <button
              className="vs-search-page-pagination-btn"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="vs-search-page-pagination-info">
              Page {page + 1} of {totalPages}
            </span>
            <button
              className="vs-search-page-pagination-btn"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </div>
    </Layout>
  );
}
