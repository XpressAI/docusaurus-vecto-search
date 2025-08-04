import React, {
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import useIsBrowser from "@docusaurus/useIsBrowser";
import { useHistory, useLocation } from "@docusaurus/router";
import { translate } from "@docusaurus/Translate";
import {
  ReactContextError,
  useDocsPreferredVersion,
} from "@docusaurus/theme-common";
import { useActivePlugin } from "@docusaurus/plugin-content-docs/client";

import { fetchIndexesByWorker, searchByWorker } from "../searchByWorker";
import { VectorSuggestionTemplate } from "./VectorSuggestionTemplate";
import { EmptyTemplate } from "./EmptyTemplate";
import { LoadingTemplate } from "./LoadingTemplate";
import { SearchResult, SearchDocumentType } from "../../../shared/interfaces";
import {
  Mark,
  searchBarShortcut,
  searchBarShortcutHint,
  searchBarShortcutKeymap,
  searchBarPosition,
  docsPluginIdForPreferredVersion,
  indexDocs,
  searchContextByPaths,
  hideSearchBarWithNoSearchContext,
  useAllContextsWithNoSearchContext,
} from "../../utils/proxiedGenerated";
import LoadingRing from "../LoadingRing/LoadingRing";
import { normalizeContextByPath } from "../../utils/normalizeContextByPath";
import { searchResultLimits } from "../../utils/proxiedGeneratedConstants";
import { parseKeymap, matchesKeymap, getKeymapHints } from "../../utils/keymap";
import { isMacPlatform } from "../../utils/platform";

import { 
  vectoSearch, 
  groupAndAverageByURL, 
  groupAndCountByURL,
  groupAndWeightedAverageByURL,
} from "../../utils/vectoApiUtils";
import { combineSearchResults, CombinedSearchResult } from "../../utils/combineSearchResults";

import styles from "./SearchBar.module.css";
import { getFooterLogoHTML } from "./FooterTemplate";

async function fetchAutoCompleteJS(): Promise<any> {
  const autoCompleteModule = await import("@easyops-cn/autocomplete.js");
  const autoComplete = autoCompleteModule.default;
  if (autoComplete.noConflict) {
    autoComplete.noConflict();
  } else if (autoCompleteModule.noConflict) {
    autoCompleteModule.noConflict();
  }
  return autoComplete;
}

const SEARCH_PARAM_HIGHLIGHT = "_highlight";

// Configuration for vector search and debouncing
const VECTOR_SEARCH_RESULTS_COUNT = 20;
const SEARCH_DEBOUNCE_MS = 500;

// Vector search configuration interface
interface VectoPluginOptions {
  vecto_public_token?: string;
  vector_space_id?: number;
  top_k?: number;
  rankBy?: string;
  [key: string]: any;
}

// Enhanced vector search function
async function performVectorSearch(
  query: string, 
  results: SearchResult[], 
  context: any
): Promise<CombinedSearchResult[]> {
  console.log('🔍 Vector search called with query:', query);
  console.log('📊 Autocomplete results to enhance:', results.length);

  try {
    // Extract vector search configuration
    const themeTuple = context.siteConfig.themes[0] as VectoPluginOptions;
    const configValues = themeTuple?.[1];
    
    if (!configValues?.vector_space_id || !configValues?.vecto_public_token) {
      console.log('⚠️ Vector search config missing, returning original results');
      return results.map(r => ({ ...r }));
    }

    const vectorSpaceId = configValues.vector_space_id;
    const publicToken = configValues.vecto_public_token;
    const topK = configValues.top_k || 10;
    const rankBy = configValues.rankBy || "average";

    console.log('🔧 Vector search config:', { vectorSpaceId, topK, rankBy });

    // 3 second delay as requested
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Perform vector search
    let vectorResults = await vectoSearch(vectorSpaceId, publicToken, topK, query);
    
    console.log('🎯 Raw vector search results:', vectorResults.length);
    
    // Apply ranking strategy
    if (rankBy === "average") {
      vectorResults = groupAndAverageByURL(vectorResults);
    } else if (rankBy === "count") {
      vectorResults = groupAndCountByURL(vectorResults);
    } else if (rankBy === "weightedAverage") {
      vectorResults = groupAndWeightedAverageByURL(vectorResults);
    }
    
    console.log('📈 Processed vector results after ranking:', vectorResults.length);
    
    // Combine and boost results with max results limit
    const combinedResults = combineSearchResults(results, vectorResults, searchResultLimits);
    
    return combinedResults;
    
  } catch (error) {
    console.error('❌ Vector search error:', error);
    // Return original results on error
    return results.map(r => ({ ...r }));
  }
}

interface SearchBarProps {
  isSearchBarExpanded: boolean;
  handleSearchBarToggle?: (expanded: boolean) => void;
}

export default function SearchBar({
  handleSearchBarToggle,
}: SearchBarProps): ReactElement {
  const isBrowser = useIsBrowser();
  const context = useDocusaurusContext();
  const {
    siteConfig: { baseUrl },
    i18n: { currentLocale },
  } = context;

  const activePlugin = useActivePlugin();
  let versionUrl = baseUrl;

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { preferredVersion } = useDocsPreferredVersion(
      activePlugin?.pluginId ?? docsPluginIdForPreferredVersion
    ) as { preferredVersion: { path: string; isLast: boolean } };
    if (preferredVersion && !preferredVersion.isLast) {
      versionUrl = preferredVersion.path + "/";
    }
  } catch (e: unknown) {
    if (indexDocs) {
      if (e instanceof ReactContextError) {
        /* ignore, happens when website doesn't use versions */
      } else {
        throw e;
      }
    }
  }
  
  const history = useHistory();
  const location = useLocation();
  const searchBarRef = useRef<HTMLInputElement>(null);
  const indexStateMap = useRef(new Map<string, "loading" | "done">());
  const focusAfterIndexLoaded = useRef(false);
  const [loading, setLoading] = useState(false);
  const [inputChanged, setInputChanged] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const search = useRef<any>(null);

  // Vector search state
  const [vectorSearchLoading, setVectorSearchLoading] = useState(false);
  const currentSearchRef = useRef<string>("");
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const pendingCallbackRef = useRef<((results: CombinedSearchResult[]) => void) | null>(null);
  
  // Debouncing state
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchQueueRef = useRef<{input: string; callback: (output: CombinedSearchResult[]) => void} | null>(null);

  const prevSearchContext = useRef<string>("");
  const [searchContext, setSearchContext] = useState<string>("");
  const prevVersionUrl = useRef<string>(baseUrl);
  
  useEffect(() => {
    if (!Array.isArray(searchContextByPaths)) {
      if (prevVersionUrl.current !== versionUrl) {
        indexStateMap.current.delete("");
        prevVersionUrl.current = versionUrl;
      }
      return;
    }
    let nextSearchContext = "";
    if (location.pathname.startsWith(versionUrl)) {
      const uri = location.pathname.substring(versionUrl.length);
      let matchedPath: string | undefined;
      for (const _path of searchContextByPaths) {
        const path = typeof _path === "string" ? _path : _path.path;
        if (uri === path || uri.startsWith(`${path}/`)) {
          matchedPath = path;
          break;
        }
      }
      if (matchedPath) {
        nextSearchContext = matchedPath;
      }
    }
    if (prevSearchContext.current !== nextSearchContext) {
      indexStateMap.current.delete(nextSearchContext);
      prevSearchContext.current = nextSearchContext;
    }
    setSearchContext(nextSearchContext);
  }, [location.pathname, versionUrl]);

  const hidden =
    !!hideSearchBarWithNoSearchContext &&
    Array.isArray(searchContextByPaths) &&
    searchContext === "";

  // Debounced search function
  const performDebouncedSearch = useCallback(async (input: string, callback: (output: CombinedSearchResult[]) => void) => {
    console.log('🔍 Starting debounced search for:', input);
    
    // Cancel previous search if still running
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    searchAbortControllerRef.current = abortController;
    currentSearchRef.current = input;
    pendingCallbackRef.current = callback;

    try {
      setVectorSearchLoading(true);
      
      // Show loading template immediately
      callback([{
        document: { i: 0, u: '', h: '', t: '', s: '', b: [] },
        type: SearchDocumentType.Title,
        page: undefined,
        metadata: {},
        tokens: [],
        score: 0,
        index: 0,
        isInterOfTree: false,
        isLastOfTree: false,
        isLoading: true,
      } as any]);
      
      // Get initial search results with higher limit for vector search processing
      const initialResults = await searchByWorker(
        versionUrl,
        searchContext,
        input,
        Math.max(VECTOR_SEARCH_RESULTS_COUNT, searchResultLimits)
      );

      // Check if this search was cancelled
      if (abortController.signal.aborted || currentSearchRef.current !== input) {
        return;
      }

      // Perform vector search with the initial results
      const vectorEnhancedResults = await performVectorSearch(input, initialResults, context);

      // Check again if this search was cancelled
      if (abortController.signal.aborted || currentSearchRef.current !== input) {
        return;
      }

      // Ensure we limit to searchResultLimits here
      const finalLimitedResults = vectorEnhancedResults.slice(0, searchResultLimits);
      
      console.log(`✂️ Final results limited from ${vectorEnhancedResults.length} to ${finalLimitedResults.length}`);

      setVectorSearchLoading(false);
      
      // Only call callback if this is still the current search
      if (pendingCallbackRef.current === callback) {
        callback(finalLimitedResults);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        console.error('❌ Vector search pipeline error:', error);
        // Fallback to original search results - also limit these
        const fallbackResults = await searchByWorker(
          versionUrl,
          searchContext,
          input,
          searchResultLimits
        );
        setVectorSearchLoading(false);
        if (pendingCallbackRef.current === callback) {
          callback(fallbackResults.map(r => ({ ...r })));
        }
      }
    }
  }, [versionUrl, searchContext, context]);

  const loadIndex = useCallback(async () => {
    if (hidden || indexStateMap.current.get(searchContext)) {
      return;
    }
    indexStateMap.current.set(searchContext, "loading");
    search.current?.autocomplete.destroy();
    setLoading(true);

    const [autoComplete] = await Promise.all([
      fetchAutoCompleteJS(),
      fetchIndexesByWorker(versionUrl, searchContext),
    ]);

    const searchFooterLinkElement = ({
      query,
      isEmpty,
    }: {
      query: string;
      isEmpty: boolean;
    }): HTMLAnchorElement => {
      const a = document.createElement("a");
      const params = new URLSearchParams();

      params.set("q", query);

      let linkText;
      if (searchContext) {
        const detailedSearchContext =
          searchContext && Array.isArray(searchContextByPaths)
            ? searchContextByPaths.find((item) =>
                typeof item === "string"
                  ? item === searchContext
                  : item.path === searchContext
              )
            : searchContext;
        const translatedSearchContext = detailedSearchContext
          ? normalizeContextByPath(detailedSearchContext, currentLocale).label
          : searchContext;

        if (useAllContextsWithNoSearchContext && isEmpty) {
          linkText = translate(
            {
              id: "theme.SearchBar.seeAllOutsideContext",
              message: 'See all results outside "{context}"',
            },
            { context: translatedSearchContext }
          );
        } else {
          linkText = translate(
            {
              id: "theme.SearchBar.searchInContext",
              message: 'See all results within "{context}"',
            },
            { context: translatedSearchContext }
          );
        }
      } else {
        linkText = translate({
          id: "theme.SearchBar.seeAll",
          message: "See more results by",
        });
      }

      if (
        searchContext &&
        Array.isArray(searchContextByPaths) &&
        (!useAllContextsWithNoSearchContext || !isEmpty)
      ) {
        params.set("ctx", searchContext);
      }

      if (versionUrl !== baseUrl) {
        if (!versionUrl.startsWith(baseUrl)) {
          throw new Error(
            `Version url '${versionUrl}' does not start with base url '${baseUrl}', this is a bug of \`@xpressai/docusaurus-vecto-search\`, please report it.`
          );
        }
        params.set("version", versionUrl.substring(baseUrl.length));
      }
      const url = `${baseUrl}search/?${params.toString()}`;
      a.href = url;
      a.textContent = linkText;
      a.addEventListener("click", (e) => {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          search.current?.autocomplete.close();
          history.push(url);
        }
      });
      return a;
    };

    search.current = autoComplete(
      searchBarRef.current,
      {
        hint: false,
        autoselect: true,
        openOnFocus: true,
        cssClasses: {
          root: clsx(styles.searchBar, {
            [styles.searchBarLeft]: searchBarPosition === "left",
          }),
          noPrefix: true,
          dropdownMenu: styles.dropdownMenu,
          input: styles.input,
          hint: styles.hint,
          suggestions: styles.suggestions,
          suggestion: styles.suggestion,
          cursor: styles.cursor,
          dataset: styles.dataset,
          empty: styles.empty,
        },
      },
      [
        {
          source: async (
            input: string,
            callback: (output: CombinedSearchResult[]) => void
          ) => {
            console.log('⌨️ Search triggered for:', input);
            
            // Clear any existing debounce timeout
            if (debounceTimeoutRef.current) {
              clearTimeout(debounceTimeoutRef.current);
            }
            
            // Store the current search request
            searchQueueRef.current = { input, callback };
            
            // Set up debounced search
            debounceTimeoutRef.current = setTimeout(() => {
              const queuedSearch = searchQueueRef.current;
              if (queuedSearch && queuedSearch.input === input) {
                console.log('🕐 Debounce complete, executing search for:', input);
                performDebouncedSearch(queuedSearch.input, queuedSearch.callback);
              }
            }, SEARCH_DEBOUNCE_MS);
          },
          templates: {
            suggestion: (suggestion: CombinedSearchResult & { isLoading?: boolean }) => {
              // Show loading template for loading state
              if (suggestion.isLoading) {
                return LoadingTemplate();
              }
              
              console.log('🎨 Rendering suggestion template for:', {
                url: suggestion.document.u,
                title: suggestion.document.t?.substring(0, 50),
                type: suggestion.type,
                hasPage: !!suggestion.page,
                isVectorOnly: suggestion.isVectorOnly,
                isBoosted: suggestion.isBoosted,
                tokensCount: suggestion.tokens?.length || 0,
                metadataKeys: Object.keys(suggestion.metadata || {}).length,
                hasMetadata: !!suggestion.metadata && Object.keys(suggestion.metadata).length > 0
              });
              
              // Validate required properties before rendering
              if (!suggestion.document || !suggestion.document.t || !suggestion.document.u) {
                console.error('❌ Invalid suggestion object:', suggestion);
                return '<div class="error">Invalid search result</div>';
              }
              
              try {
                console.log('🔧 About to call VectorSuggestionTemplate');
                
                // Use the vector-aware suggestion template for ALL results
                const originalTemplate = VectorSuggestionTemplate(suggestion);
                
                console.log('✅ VectorSuggestionTemplate completed successfully');
                
                // Add visual indicators based on result type
                if (suggestion.isVectorOnly) {
                  // Add vector-only indicator
                  const vectorIndicator = `<span class="${styles.vectorIndicator}" title="AI Search Result">🎯</span>`;
                  return originalTemplate.replace(
                    `<span class="${styles.hitIcon}">`,
                    `${vectorIndicator}<span class="${styles.hitIcon}">`
                  );
                } else if (suggestion.isBoosted) {
                  // Add boost indicator for enhanced results
                  const boostIndicator = `<span class="${styles.boostIndicator}" title="Enhanced by AI">🚀</span>`;
                  return originalTemplate.replace(
                    `<span class="${styles.hitIcon}">`,
                    `${boostIndicator}<span class="${styles.hitIcon}">`
                  );
                }
                
                return originalTemplate;
              } catch (error) {
                console.error('❌ Error in VectorSuggestionTemplate rendering:', {
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                  suggestion: {
                    url: suggestion.document.u,
                    title: suggestion.document.t?.substring(0, 50),
                    type: suggestion.type,
                    tokensCount: suggestion.tokens?.length || 0,
                    metadataKeys: Object.keys(suggestion.metadata || {})
                  }
                });
                
                // Create a safe fallback template
                const safeTitle = (suggestion.document.t || 'Untitled').replace(/[<>&"]/g, (c) => {
                  return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c;
                });
                
                const fallbackTemplate = `
                  <span class="${styles.hitIcon}">${suggestion.isVectorOnly ? '🎯' : '📄'}</span>
                  <span class="${styles.hitWrapper}">
                    <span class="${styles.hitTitle}">${safeTitle}</span>
                  </span>
                  <span class="${styles.hitAction}">→</span>
                `;
                
                return fallbackTemplate;
              }
            },
            empty: EmptyTemplate,
            footer: ({ query, isEmpty }: any) => {
              if (isEmpty && (!searchContext || !useAllContextsWithNoSearchContext)) {
                return;
              }
              const link = searchFooterLinkElement({ query, isEmpty });
              const container = document.createElement("div");
              container.className = styles.hitFooter;
              container.appendChild(link);

              const footerDiv = document.createElement("div");
              footerDiv.innerHTML = getFooterLogoHTML();
              container.appendChild(footerDiv);

              return container;
            },
          },
        },
      ]
    )
      .on(
        "autocomplete:selected",
        function (event: any, suggestion: CombinedSearchResult & { isLoading?: boolean }) {
          // Don't navigate if it's a loading suggestion
          if (suggestion.isLoading) {
            event.preventDefault();
            return;
          }
          
          const resultType = suggestion.isVectorOnly ? 'VECTOR-ONLY' : 
                            suggestion.isBoosted ? 'BOOSTED' : 'NORMAL';
          
          console.log('🖱️ Selected result:', {
            type: resultType,
            url: suggestion.document.u,
            vectorSimilarity: suggestion.vectorSimilarity
          });
          
          const { document: { u, h }, tokens } = suggestion;
          searchBarRef.current?.blur();

          let url = u;
          // Only add highlighting for non-vector-only results (they don't have tokens)
          if (Mark && tokens && tokens.length > 0 && !suggestion.isVectorOnly) {
            const params = new URLSearchParams();
            for (const token of tokens) {
              params.append(SEARCH_PARAM_HIGHLIGHT, token);
            }
            url += `?${params.toString()}`;
          }
          if (h) {
            url += h;
          }
          history.push(url);
        }
      )
      .on("autocomplete:closed", () => {
        searchBarRef.current?.blur();
        
        // Clear debounce timeout
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
        
        // Cancel ongoing searches
        if (searchAbortControllerRef.current) {
          searchAbortControllerRef.current.abort();
        }
        
        setVectorSearchLoading(false);
        pendingCallbackRef.current = null;
        searchQueueRef.current = null;
      });

    indexStateMap.current.set(searchContext, "done");
    setLoading(false);

    if (focusAfterIndexLoaded.current) {
      const input = searchBarRef.current as HTMLInputElement;
      if (input.value) {
        search.current?.autocomplete.open();
      }
      input.focus();
    }
  }, [hidden, searchContext, versionUrl, baseUrl, history, context, performDebouncedSearch]);

  useEffect(() => {
    if (!Mark) {
      return;
    }
    const keywords = isBrowser
      ? new URLSearchParams(location.search).getAll(SEARCH_PARAM_HIGHLIGHT)
      : [];
    setTimeout(() => {
      const root = document.querySelector("article");
      if (!root) {
        return;
      }
      const mark = new Mark(root);
      mark.unmark();
      if (keywords.length !== 0) {
        mark.mark(keywords, {
          exclude: [".theme-doc-toc-mobile > button"],
        });
      }

      setInputValue(keywords.join(" "));
      search.current?.autocomplete.setVal(keywords.join(" "));
    });
  }, [isBrowser, location.search, location.pathname]);

  const [focused, setFocused] = useState(false);

  const onInputFocus = useCallback(() => {
    focusAfterIndexLoaded.current = true;
    loadIndex();
    setFocused(true);
    handleSearchBarToggle?.(true);
  }, [handleSearchBarToggle, loadIndex]);

  const onInputBlur = useCallback(() => {
    setFocused(false);
    handleSearchBarToggle?.(false);
  }, [handleSearchBarToggle]);

  const onInputMouseEnter = useCallback(() => {
    loadIndex();
  }, [loadIndex]);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
      if (event.target.value) {
        setInputChanged(true);
      }
    },
    []
  );

  const isMac = isBrowser ? isMacPlatform() : false;

  useEffect(
    () => {
      const searchBar = searchBarRef.current;
      const domValue = searchBar?.value;
      if (domValue) {
        setInputValue(domValue);
      }
      if (searchBar && document.activeElement === searchBar) {
        focusAfterIndexLoaded.current = true;
        loadIndex();
        setFocused(true);
        handleSearchBarToggle?.(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (!searchBarShortcut || !searchBarShortcutKeymap) {
      return;
    }
    
    const parsedKeymap = parseKeymap(searchBarShortcutKeymap);
    
    const handleShortcut = (event: KeyboardEvent): void => {
      if (matchesKeymap(event, parsedKeymap)) {
        event.preventDefault();
        searchBarRef.current?.focus();
        onInputFocus();
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => {
      document.removeEventListener("keydown", handleShortcut);
    };
  }, [onInputFocus, searchBarShortcutKeymap]);

  const onClearSearch = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete(SEARCH_PARAM_HIGHLIGHT);
    const paramsStr = params.toString();
    const searchUrl =
      location.pathname +
      (paramsStr != "" ? `?${paramsStr}` : "") +
      location.hash;
    if (searchUrl != location.pathname + location.search + location.hash) {
      history.push(searchUrl);
    }

    setInputValue("");
    search.current?.autocomplete.setVal("");
    
    // Clear debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Cancel ongoing searches
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    
    setVectorSearchLoading(false);
    pendingCallbackRef.current = null;
    searchQueueRef.current = null;
  }, [location.pathname, location.search, location.hash, history]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div
      className={clsx("navbar__search", styles.searchBarContainer, {
        [styles.searchIndexLoading]: loading && inputChanged,
        [styles.focused]: focused,
      })}
      hidden={hidden}
      dir="ltr"
    >
      <input
        placeholder={translate({
          id: "theme.SearchBar.label",
          message: "Search",
          description: "The ARIA label and placeholder for search button",
        })}
        aria-label="Search"
        className={`navbar__search-input ${styles.searchInput}`}
        onMouseEnter={onInputMouseEnter}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        onChange={onInputChange}
        ref={searchBarRef}
        value={inputValue}
      />
      <LoadingRing className={styles.searchBarLoadingRing} />
      {searchBarShortcut &&
        searchBarShortcutHint &&
        (inputValue !== "" ? (
          <button className={styles.searchClearButton} onClick={onClearSearch}>
            ✕
          </button>
        ) : (
          isBrowser && searchBarShortcutKeymap && (
            <div className={styles.searchHintContainer}>
              {getKeymapHints(searchBarShortcutKeymap, isMac).map((hint, index) => (
                <kbd key={index} className={styles.searchHint}>{hint}</kbd>
              ))}
            </div>
          )
        ))}
    </div>
  );
}