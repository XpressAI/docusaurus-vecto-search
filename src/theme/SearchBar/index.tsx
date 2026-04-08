import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useHistory } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { useSearchEngine } from "./useSearchEngine";
import type { VectorSearchConfig, SearchResult } from "../../types";

import "./styles.css";

export default function SearchBar(): JSX.Element {
  const history = useHistory();
  const { siteConfig } = useDocusaurusContext();
  const config = (
    siteConfig.themeConfig as { vectorSearch?: VectorSearchConfig }
  ).vectorSearch;
  const { search, ready } = useSearchEngine();

  const placeholder = config?.placeholder ?? "Search docs...";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hotkey: Cmd/Ctrl + K ──
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent): void {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        setQuery("");
        setResults([]);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Click outside ──
  useEffect(() => {
    function onClick(e: MouseEvent): void {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // ── Debounced search ──
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
        setActiveIndex(0);
      } catch (err) {
        console.error("[vector-search] Search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [search, ready]
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const val = e.target.value;
      setQuery(val);
      setIsOpen(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => performSearch(val), 250);
    },
    [performSearch]
  );

  // ── Keyboard nav ──
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (!isOpen || results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = results[activeIndex];
        if (selected?.url) navigateTo(selected.url);
      }
    },
    [isOpen, results, activeIndex]
  );

  const navigateTo = useCallback(
    (url: string): void => {
      setIsOpen(false);
      setQuery("");
      setResults([]);
      history.push(url);
    },
    [history]
  );

  return (
    <div ref={containerRef} className="vs-search-container">
      <div className="vs-search-input-wrapper">
        <input
          ref={inputRef}
          className="vs-search-input"
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          aria-label="Search documentation"
          aria-expanded={isOpen}
          role="combobox"
          aria-controls="vs-search-results"
          aria-activedescendant={
            isOpen && results.length > 0
              ? `vs-result-${activeIndex}`
              : undefined
          }
        />
      </div>

      {isOpen && query.length >= 2 && (
        <div
          className="vs-search-dropdown"
          id="vs-search-results"
          role="listbox"
        >
          {loading && (
            <div className="vs-search-loading">Searching…</div>
          )}

          {!loading && results.length === 0 && (
            <div className="vs-search-empty">
              No results for &quot;{query}&quot;
            </div>
          )}

          {!loading &&
            results.map((result, index) => (
              <button
                key={result.id}
                id={`vs-result-${index}`}
                className={`vs-search-result ${
                  index === activeIndex ? "vs-search-result--active" : ""
                }`}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => navigateTo(result.url)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="vs-search-result-title">
                  {result.title}
                  {result.heading && result.heading !== result.title && (
                    <span className="vs-search-result-heading">
                      {" › "}
                      {result.heading}
                    </span>
                  )}
                </span>
                {result.version && result.version !== "current" && (
                  <span className="vs-search-result-version">
                    {result.version}
                  </span>
                )}
                <span className="vs-search-result-snippet">
                  {result.snippet}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
