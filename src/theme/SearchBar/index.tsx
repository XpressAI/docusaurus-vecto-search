import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useHistory } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { useSearchEngine } from "./useSearchEngine";
import type { VectorSearchConfig, SearchResult } from "../../types";

import "./styles.css";

// ── Icons ───────────────────────────────────────────────

function SearchIcon(): JSX.Element {
  return (
    <svg width="20" height="20" className="vs-search-icon" viewBox="0 0 20 20">
      <path
        d="M14.386 14.386l4.088 4.088-4.088-4.088c-2.942 2.942-7.712 2.942-10.653 0-2.942-2.942-2.942-7.712 0-10.653 2.942-2.942 7.712-2.942 10.653 0 2.942 2.942 2.942 7.712 0 10.653z"
        stroke="currentColor"
        fill="none"
        fillRule="evenodd"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 38 38" stroke="currentColor" strokeOpacity=".5" width="24" height="24">
      <g fill="none" fillRule="evenodd">
        <g transform="translate(1 1)" strokeWidth="2">
          <circle strokeOpacity=".3" cx="18" cy="18" r="18" />
          <path d="M36 18c0-9.94-8.06-18-18-18">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 18 18"
              to="360 18 18"
              dur="1s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      </g>
    </svg>
  );
}

function ResetIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <path
        d="M10 10l5.09-5.09L10 10l5.09 5.09L10 10zm0 0L4.91 4.91 10 10l-5.09 5.09L10 10z"
        stroke="currentColor"
        fill="none"
        fillRule="evenodd"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ControlKeyIcon(): JSX.Element {
  return (
    <svg width="15" height="15" className="vs-control-key-icon">
      <path
        d="M4.505 4.496h2M5.505 5.496v5M8.216 4.496l.055 5.993M10 7.5c.333.333.5.667.5 1v2M12.326 4.5v5.996M8.384 4.496c1.674 0 2.116 0 2.116 1.5s-.442 1.5-2.116 1.5M3.205 9.303c-.09.448-.277 1.21-1.241 1.203C1 10.5.5 9.513.5 8V7c0-1.57.5-2.5 1.464-2.494.964.006 1.134.598 1.24 1.342M12.553 10.5h1.953"
        strokeWidth="1.2"
        stroke="currentColor"
        fill="none"
        strokeLinecap="square"
      />
    </svg>
  );
}

function VectoLogo(): JSX.Element {
  return (
    <a href="https://vecto.ai/" target="_blank" rel="noopener noreferrer">
      <span className="vs-label">Search by</span>
      <svg
        width="80"
        height="18"
        viewBox="0 0 452 119"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g>
          <polygon fill="#00D7F2" points="42,37.3 51.3,32.7 43.2,17 42,16.7 0,3.1 20.3,38.5 12.6,51.9" />
          <polygon fill="#00D7F2" points="61,9.4 100.9,16.7 68.9,65.4 57.6,45.2 42,53.4 32.8,58.2 42,73.9 68.7,119.1 143.6,0.4" />
        </g>
        <path fill="currentColor" d="M280.2,72.6c0.2-1.4,0.3-2.8,0.3-4.2c0-8.6-3.1-16-9.2-22.1c-6.1-6.1-13.5-9.2-22.1-9.2l0,0 c-8.6,0-15.9,3.1-22,9.2c-6.1,6.1-9.2,13.5-9.2,22.1c0,8.6,3.1,16,9.2,22.1c6.1,6.1,13.4,9.1,22,9.2l0,0c6.1,0,11.7-1.6,16.8-4.9 c5.1-3.3,8.9-7.7,11.4-13.1h-17c-3.3,2.7-7,4.1-11.2,4.1l0,0c-4,0-7.6-1.2-10.7-3.7c-3.1-2.5-5.2-5.6-6.1-9.4h16.8H280.2z M233,62.3 c1.2-3.3,3.3-6,6.3-8.1c3-2.1,6.3-3.1,9.9-3.1l0,0c3.7,0,6.9,1,9.9,3.1c2.9,2.1,5,4.8,6.3,8.1h-16.2H233z" />
        <path fill="currentColor" d="M318.5,99.6c-8.6,0-16-3.1-22.1-9.2c-6.1-6.1-9.2-13.5-9.2-22.1c0-8.6,3.1-16,9.2-22.1 c6.1-6.1,13.5-9.2,22.1-9.2c6.2,0,11.9,1.7,17,5c5.1,3.4,8.9,7.8,11.4,13.3H330c-3.3-3-7.2-4.5-11.5-4.5c-4.8,0-8.8,1.7-12.2,5.1 c-3.4,3.4-5.1,7.5-5.1,12.3c0,4.8,1.7,8.8,5.1,12.2c3.4,3.4,7.5,5.1,12.2,5.1c5.2,0,9.6-2,13.1-6h16c-2.3,5.9-6.1,10.7-11.4,14.4 C330.9,97.8,325,99.6,318.5,99.6z" />
        <path fill="currentColor" d="M374.3,19.9v16.6h6.3v10.4h-6.3v31.9c0,2,0.7,3.6,2,4.9c1.3,1.3,3,2,4.8,2h3.5v13.9h-3.5 c-5.7,0-10.6-2-14.7-6.1c-4-4.1-6.1-9-6.1-14.7V46.9h-6.3V36.5h6.3v-9.7L374.3,19.9z" />
        <path fill="currentColor" d="M442.4,46.4c-6.1-6.1-13.5-9.2-22.1-9.2c-8.6,0-16,3.1-22.1,9.2c-6.1,6.1-9.2,13.5-9.2,22.1 c0,8.6,3.1,16,9.2,22.1c6.1,6.1,13.5,9.2,22.1,9.2c8.6,0,16-3.1,22.1-9.2c6.1-6.1,9.2-13.5,9.2-22.1 C451.5,59.8,448.5,52.5,442.4,46.4z M432.6,80.7c-3.4,3.4-7.5,5.1-12.2,5.1c-4.8,0-8.8-1.7-12.2-5.1c-3.4-3.4-5.1-7.5-5.1-12.2 c0-4.8,1.7-8.9,5.1-12.3c3.4-3.4,7.5-5.1,12.2-5.1c4.8,0,8.8,1.7,12.2,5.1c3.4,3.4,5.1,7.5,5.1,12.3 C437.6,73.2,435.9,77.3,432.6,80.7z" />
        <polygon fill="currentColor" points="154.9,37.2 170.7,37.2 186.3,73.7 201.9,37.2 217.6,37.2 191.3,99.1 181.2,99.1" />
      </svg>
    </a>
  );
}

function CommandIcon({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }): JSX.Element {
  return (
    <svg width="15" height="15" aria-label={ariaLabel} role="img">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2">
        {children}
      </g>
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────

const ACTION_KEY_DEFAULT = "Ctrl";
const ACTION_KEY_APPLE = "\u2318";

function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform ?? navigator.userAgent;
  return /(Mac|iPhone|iPod|iPad)/i.test(ua);
}

function isEditingContent(event: globalThis.KeyboardEvent): boolean {
  const el = event.target as HTMLElement;
  const tag = el.tagName;
  return el.isContentEditable || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

// ── Main Component ──────────────────────────────────────

export default function SearchBar(): JSX.Element {
  const history = useHistory();
  const { siteConfig } = useDocusaurusContext();
  const config = (
    siteConfig.themeConfig as { vectorSearch?: VectorSearchConfig }
  ).vectorSearch;
  const { search, suggest, ready } = useSearchEngine();
  const maxResults = config?.maxResults ?? 10;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [actionKey, setActionKey] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Detect platform key ──
  useEffect(() => {
    setActionKey(isAppleDevice() ? ACTION_KEY_APPLE : ACTION_KEY_DEFAULT);
  }, []);

  // ── Open / close via <dialog> API ──
  const onOpen = useCallback(() => setIsOpen(true), []);
  const onClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setSuggestion("");
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Handle native dialog close (Esc key, backdrop click)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  // Close on backdrop click (::backdrop doesn't fire click, but the dialog element does)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClick = (e: MouseEvent) => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener("click", handleClick);
    return () => dialog.removeEventListener("click", handleClick);
  }, [onClose]);

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        isOpen ? onClose() : onOpen();
      }
      if (!isOpen && e.key === "/" && !isEditingContent(e)) {
        e.preventDefault();
        onOpen();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onOpen, onClose]);

  // ── Debounced search ──
  const performSearch = useCallback(
    async (q: string): Promise<void> => {
      if (!ready || q.length < 2) {
        setResults([]);
        setSuggestion("");
        return;
      }
      setLoading(true);
      try {
        const res = await search(q);
        setResults(res);
        setActiveIndex(res.length > 0 ? 0 : -1);

        // Generate autocomplete suggestion
        const s = suggest(q);
        setSuggestion(s);
      } catch (err) {
        console.error("[vector-search] Search error:", err);
        setResults([]);
        setSuggestion("");
      } finally {
        setLoading(false);
      }
    },
    [search, suggest, ready]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const val = e.target.value;
      setQuery(val);
      if (val.length < 2) setSuggestion("");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => performSearch(val), 200);
    },
    [performSearch]
  );

  const onReset = useCallback((): void => {
    setQuery("");
    setResults([]);
    setSuggestion("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, []);

  // ── Navigate ──
  const navigateTo = useCallback(
    (url: string): void => {
      onClose();
      history.push(url);
    },
    [history, onClose]
  );

  const seeAllResults = useCallback((): void => {
    if (!query) return;
    onClose();
    history.push(`/search?q=${encodeURIComponent(query)}`);
  }, [query, history, onClose]);

  // ── Keyboard navigation ──
  const onKeyDownInput = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>): void => {
      // Accept autocomplete suggestion with Right arrow or Tab
      if ((e.key === "ArrowRight" || e.key === "Tab") && suggestion) {
        const input = inputRef.current;
        if (input && input.selectionStart === query.length) {
          e.preventDefault();
          setQuery(suggestion);
          setSuggestion("");
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => performSearch(suggestion), 200);
          return;
        }
      }

      if (results.length === 0) {
        if (e.key === "Enter" && query.length >= 2) {
          e.preventDefault();
          seeAllResults();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]?.url) {
          navigateTo(results[activeIndex].url);
        } else {
          seeAllResults();
        }
      }
    },
    [results, activeIndex, query, suggestion, navigateTo, seeAllResults, performSearch]
  );

  // ── Render ──
  const displayResults = results.slice(0, maxResults);

  return (
    <>
      {/* ── Navbar Button ── */}
      <button
        type="button"
        className="vs-button"
        aria-label="Search"
        onClick={onOpen}
      >
        <span className="vs-button-container">
          <SearchIcon />
          <span className="vs-button-placeholder">Search</span>
        </span>
        <span className="vs-button-keys">
          {actionKey !== null && (
            <>
              <kbd className="vs-button-key">
                {actionKey === ACTION_KEY_DEFAULT ? <ControlKeyIcon /> : actionKey}
              </kbd>
              <kbd className="vs-button-key">K</kbd>
            </>
          )}
        </span>
      </button>

      {/* ── Dialog Modal ── */}
      <dialog ref={dialogRef} className="vs-dialog">
        <div className="vs-modal">
          {/* ── Search Bar ── */}
          <header className="vs-search-bar">
            <form
              className="vs-form"
              action="/search"
              method="get"
              onSubmit={(e) => {
                e.preventDefault();
                seeAllResults();
              }}
              onReset={(e) => {
                e.preventDefault();
                onReset();
              }}
            >
              <label className="vs-magnifier-label">
                {loading ? <LoadingIcon /> : <SearchIcon />}
              </label>
              <div className="vs-input-wrapper">
                <input
                  ref={inputRef}
                  className="vs-input"
                  type="search"
                  name="q"
                  placeholder="Search docs..."
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={query}
                  onChange={onInputChange}
                  onKeyDown={onKeyDownInput}
                />
                {suggestion && suggestion !== query && (
                  <span className="vs-suggestion" aria-hidden="true">
                    <span className="vs-suggestion-hidden">{query}</span>
                    {suggestion.slice(query.length)}
                  </span>
                )}
              </div>
              <button
                type="reset"
                className="vs-reset"
                title="Clear the query"
                aria-label="Clear the query"
                hidden={query.length === 0}
              >
                <ResetIcon />
              </button>
            </form>
            <button
              className="vs-cancel"
              type="button"
              aria-label="Cancel"
              onClick={onClose}
            >
              Cancel
            </button>
          </header>

          {/* ── Results ── */}
          <div className="vs-dropdown" role="listbox">
            {query.length >= 2 && !loading && results.length === 0 && (
              <div className="vs-no-results">
                No results for &quot;{query}&quot;
              </div>
            )}

            {displayResults.map((result, index) => (
              <button
                key={result.id}
                id={`vs-hit-${index}`}
                className={`vs-hit ${index === activeIndex ? "vs-hit--selected" : ""}`}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => navigateTo(result.url)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className="vs-hit-container">
                  <div className="vs-hit-content-wrapper">
                    <span className="vs-hit-title">
                      {result.title}
                      {result.heading && result.heading !== result.title && (
                        <span className="vs-hit-heading"> › {result.heading}</span>
                      )}
                    </span>
                    <span className="vs-hit-path">{result.snippet}</span>
                  </div>
                  {result.version && result.version !== "current" && (
                    <span className="vs-hit-version">{result.version}</span>
                  )}
                  <div className="vs-hit-action">
                    <svg width="20" height="20" viewBox="0 0 20 20">
                      <g stroke="currentColor" fill="none" fillRule="evenodd" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 3v4c0 2-2 4-4 4H1" />
                        <path d="M4 14l-3-3 3-3" />
                      </g>
                    </svg>
                  </div>
                </div>
              </button>
            ))}

            {query.length >= 2 && results.length > 0 && (
              <div className="vs-hits-footer">
                <button type="button" className="vs-see-all" onClick={seeAllResults}>
                  See all {results.length} results
                </button>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <footer className="vs-footer">
            <div className="vs-logo">
              <VectoLogo />
            </div>
            <ul className="vs-commands">
              <li>
                <kbd className="vs-commands-key">
                  <CommandIcon ariaLabel="Enter key">
                    <path d="M12 3.53v3c0 1-1 2-2 2H4M7 11.53l-3-3 3-3" />
                  </CommandIcon>
                </kbd>
                <span className="vs-label">to select</span>
              </li>
              <li>
                <kbd className="vs-commands-key">
                  <CommandIcon ariaLabel="Arrow right key">
                    <path d="M3 8h9M8 4l4 4-4 4" />
                  </CommandIcon>
                </kbd>
                <span className="vs-label">to autocomplete</span>
              </li>
              <li>
                <kbd className="vs-commands-key">
                  <CommandIcon ariaLabel="Escape key">
                    <path d="M13.6167 8.936c-.1065.3583-.6883.962-1.4875.962-.7993 0-1.653-.9165-1.653-2.1258v-.5678c0-1.2548.7896-2.1016 1.653-2.1016.8634 0 1.3601.4778 1.4875 1.0724M9 6c-.1352-.4735-.7506-.9219-1.46-.8972-.7092.0246-1.344.57-1.344 1.2166s.4198.8812 1.3445.9805C8.465 7.3992 8.968 7.9337 9 8.5c.032.5663-.454 1.398-1.4595 1.398C6.6593 9.898 6 9 5.963 8.4851m-1.4748.5368c-.2635.5941-.8099.876-1.5443.876s-1.7073-.6248-1.7073-2.204v-.4603c0-1.0416.721-2.131 1.7073-2.131.9864 0 1.6425 1.031 1.5443 2.2492h-2.956" />
                  </CommandIcon>
                </kbd>
                <span className="vs-label">to close</span>
              </li>
            </ul>
          </footer>
        </div>
      </dialog>
    </>
  );
}
