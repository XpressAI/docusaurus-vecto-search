import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";
import { translate } from "@docusaurus/Translate";
import { usePluralForm } from "@docusaurus/theme-common";
import clsx from "clsx";

import useSearchQuery from "../hooks/useSearchQuery";
import { fetchIndexesByWorker, searchByWorker } from "../searchByWorker";
import {
  SearchDocument,
  SearchDocumentType,
  SearchResult,
} from "../../../shared/interfaces";
import { highlight } from "../../utils/highlight";
import { highlightStemmed } from "../../utils/highlightStemmed";
import { getStemmedPositions } from "../../utils/getStemmedPositions";
import LoadingRing from "../LoadingRing/LoadingRing";
import { concatDocumentPath } from "../../utils/concatDocumentPath";
import {
  Mark,
  searchContextByPaths,
  useAllContextsWithNoSearchContext,
} from "../../utils/proxiedGenerated";

import styles from "./SearchPage.module.css";
import { normalizeContextByPath } from "../../utils/normalizeContextByPath";

// Vecto imports
import { 
  vectoSearch, 
  VectoLookupResult, 
  groupAndAverageByURL, 
  groupAndCountByURL,
  groupAndWeightedAverageByURL,
 } from "../../utils/vectoApiUtils";

export default function SearchPage(): React.ReactElement {
  return (
    <Layout>
      <SearchPageContent />
    </Layout>
  );
}

function SearchPageContent(): React.ReactElement {
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    siteConfig: { baseUrl },
    i18n: { currentLocale },
  } = useDocusaurusContext();
  const context = useDocusaurusContext();

  // Vecto configuration with error tracking
  interface VectoPluginOptions {
    vecto_public_token?: string;
    vector_space_id?: number;
    top_k?: number;
    rankBy?: string;
    [key: string]: any;
  }

  const [vectoConfigErrors, setVectoConfigErrors] = useState<string[]>([]);
  const [vectoSearchError, setVectoSearchError] = useState<string | null>(null);
  const [vectorSpaceId, setVectorSpaceId] = useState<number | undefined>();
  const [publicToken, setPublicToken] = useState<string | undefined>();
  const [topK, setTopK] = useState<number>(10);
  const [rankBy, setRankBy] = useState<string>("average");

  // Read Vecto configuration once on mount
  useEffect(() => {
    try {
      const themeTuple = context.siteConfig.themes[0] as VectoPluginOptions;
      const configValues = themeTuple?.[1];
      
      const errors: string[] = [];
      
      if (!configValues) {
        errors.push("Vecto theme configuration not found");
      } else {
        if (!configValues.vector_space_id) {
          errors.push("vector_space_id is missing from configuration");
        } else {
          setVectorSpaceId(configValues.vector_space_id);
        }
        
        if (!configValues.vecto_public_token) {
          errors.push("vecto_public_token is missing from configuration");
        } else {
          setPublicToken(configValues.vecto_public_token);
        }
        
        if (configValues.top_k) {
          setTopK(configValues.top_k);
        }
        
        if (configValues.rankBy) {
          setRankBy(configValues.rankBy);
        }
      }
      
      setVectoConfigErrors(errors);
    } catch (error) {
      setVectoConfigErrors([`Error reading Vecto configuration: ${error instanceof Error ? error.message : String(error)}`]);
    }
  }, [context.siteConfig.themes]);

  const { selectMessage } = usePluralForm();
  const {
    searchValue,
    searchContext,
    searchVersion,
    updateSearchPath,
    updateSearchContext,
  } = useSearchQuery();
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const [searchResults, setSearchResults] = useState<SearchResult[]>();
  const versionUrl = `${baseUrl}${searchVersion}`;

  // Vecto search state
  const [vectoSearchResults, setVectoSearchResults] = useState<VectoLookupResult[]>([]);
  const [isLoadingVectoResults, setIsLoadingVectoResults] = useState(false);

  const pageTitle = useMemo(
    () =>
      searchQuery
        ? translate(
            {
              id: "theme.SearchPage.existingResultsTitle",
              message: 'Search results for "{query}"',
              description: "The search page title for non-empty query",
            },
            {
              query: searchQuery,
            }
          )
        : translate({
            id: "theme.SearchPage.emptyResultsTitle",
            message: "Search the documentation",
            description: "The search page title for empty query",
          }),
    [searchQuery]
  );

  // Vecto search handler with error handling
  const handleVectoSearch = useCallback(async () => {
    if (!vectorSpaceId || !publicToken || !searchQuery) return;
    
    setIsLoadingVectoResults(true);
    setVectoSearchError(null);
  
    try {
      let results = await vectoSearch(vectorSpaceId, publicToken, topK, searchQuery);
      // Apply the correct function based on the rankBy
      if (rankBy === "average") {
        results = groupAndAverageByURL(results);
      } else if (rankBy === "count") {
          results = groupAndCountByURL(results);
      } else if (rankBy === "weightedAverage") {
        results = groupAndWeightedAverageByURL(results);
      }
      setVectoSearchResults(results);
    } catch (error) {
      console.error('Error fetching Vecto search results:', error);
      setVectoSearchError(`Vecto search failed: ${error instanceof Error ? error.message : String(error)}`);
      setVectoSearchResults([]);
    } finally {
      setIsLoadingVectoResults(false);
    }
  }, [searchQuery, vectorSpaceId, publicToken, topK, rankBy]);

  useEffect(() => {
    updateSearchPath(searchQuery);

    if (searchQuery) {
      (async () => {
        const results = await searchByWorker(
          versionUrl,
          searchContext,
          searchQuery,
          100
        );
        setSearchResults(results);
      })();
    } else {
      setSearchResults(undefined);
    }

    // `updateSearchPath` should not be in the deps,
    // otherwise will cause call stack overflow.
  }, [searchQuery, versionUrl, searchContext]);

  // Vecto search with debounce
  useEffect(() => {
    // Clear the previous timeout if there's any
    if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
    }

    // If there's a search query, set a new timeout to call vecto search
    if (searchQuery && vectorSpaceId && publicToken && vectoConfigErrors.length === 0) {
        searchTimeoutRef.current = setTimeout(() => {
            handleVectoSearch();
        }, 500); 
    } else {
      setVectoSearchResults([]);
    }

    return () => {
        // Clean up on component unmount or if effect runs again
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
    };
  }, [searchQuery, handleVectoSearch, vectoConfigErrors.length]);

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  useEffect(() => {
    if (searchValue && searchValue !== searchQuery) {
      setSearchQuery(searchValue);
    }
  }, [searchValue]);

  const [searchWorkerReady, setSearchWorkerReady] = useState(false);

  useEffect(() => {
    async function doFetchIndexes() {
      if (
        !Array.isArray(searchContextByPaths) ||
        searchContext ||
        useAllContextsWithNoSearchContext
      ) {
        await fetchIndexesByWorker(versionUrl, searchContext);
      }
      setSearchWorkerReady(true);
    }
    doFetchIndexes();
  }, [searchContext, versionUrl]);

  return (
    <React.Fragment>
      <Head>
        {/*
         We should not index search pages
          See https://github.com/facebook/docusaurus/pull/3233
        */}
        <meta property="robots" content="noindex, follow" />
        <title>{pageTitle}</title>
      </Head>

      <div className="container margin-vert--lg">
        <h1>{pageTitle}</h1>

        <div className="row">
          <div
            className={clsx("col", {
              [styles.searchQueryColumn]: Array.isArray(searchContextByPaths),
              "col--9": Array.isArray(searchContextByPaths),
              "col--12": !Array.isArray(searchContextByPaths),
            })}
          >
            <input
              type="search"
              name="q"
              className={styles.searchQueryInput}
              aria-label="Search"
              onChange={handleSearchInputChange}
              value={searchQuery}
              autoComplete="off"
              autoFocus
            />
          </div>
          {Array.isArray(searchContextByPaths) ? (
            <div
              className={clsx(
                "col",
                "col--3",
                "padding-left--none",
                styles.searchContextColumn
              )}
            >
              <select
                name="search-context"
                className={styles.searchContextInput}
                id="context-selector"
                value={searchContext}
                onChange={(e) => updateSearchContext(e.target.value)}
              >
                {useAllContextsWithNoSearchContext && (
                  <option value="">
                    {translate({
                      id: "theme.SearchPage.searchContext.everywhere",
                      message: "Everywhere",
                    })}
                  </option>
                )}
                {searchContextByPaths.map((context) => {
                  const { label, path } = normalizeContextByPath(
                    context,
                    currentLocale
                  );
                  return (
                    <option key={path} value={path}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}
        </div>

        {/* Vecto Search Results Section - Always displayed */}
        <section>
          <h2>Vecto Search Results</h2>
          
          {/* Display configuration errors */}
          {vectoConfigErrors.length > 0 && (
            <div style={{ 
              backgroundColor: '#ffebee', 
              border: '1px solid #f44336', 
              borderRadius: '4px', 
              padding: '12px', 
              marginBottom: '16px' 
            }}>
              <h4 style={{ color: '#d32f2f', margin: '0 0 8px 0' }}>⚠️ Vecto Configuration Errors:</h4>
              <ul style={{ margin: '0', paddingLeft: '20px' }}>
                {vectoConfigErrors.map((error, index) => (
                  <li key={index} style={{ color: '#d32f2f' }}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Display search errors */}
          {vectoSearchError && (
            <div style={{ 
              backgroundColor: '#ffebee', 
              border: '1px solid #f44336', 
              borderRadius: '4px', 
              padding: '12px', 
              marginBottom: '16px' 
            }}>
              <h4 style={{ color: '#d32f2f', margin: '0 0 8px 0' }}>❌ Vecto Search Error:</h4>
              <p style={{ color: '#d32f2f', margin: '0' }}>{vectoSearchError}</p>
            </div>
          )}

          {/* Loading state */}
          {isLoadingVectoResults && vectoConfigErrors.length === 0 && (
            <div>
              <LoadingRing />
            </div>
          )}

          {/* Search results */}
          {vectoSearchResults.length > 0 && vectoConfigErrors.length === 0 && (
            <>
              {vectoSearchResults.map((result, index) => (
                <VectoSearchResultItem key={index} result={result} />
              ))}
            </>
          )}

          {/* No results message when search is done but no results */}
          {searchQuery && 
           !isLoadingVectoResults && 
           vectoSearchResults.length === 0 && 
           vectoConfigErrors.length === 0 && 
           !vectoSearchError && (
            <p style={{ fontStyle: 'italic', color: '#666' }}>
              No Vecto search results found for "{searchQuery}"
            </p>
          )}
        </section>

        {/* Original Search Results */}
        <section>
          <h2>Key Based Search Results</h2>

          {!searchWorkerReady && searchQuery && (
            <div>
              <LoadingRing />
            </div>
          )}

          {searchResults &&
            (searchResults.length > 0 ? (
              <p>
                {selectMessage(
                  searchResults.length,
                  translate(
                    {
                      id: "theme.SearchPage.documentsFound.plurals",
                      message: "1 document found|{count} documents found",
                      description:
                        'Pluralized label for "{count} documents found". Use as much plural forms (separated by "|") as your language support (see https://www.unicode.org/cldr/cldr-aux/charts/34/supplemental/language_plural_rules.html)',
                    },
                    { count: searchResults.length }
                  )
                )}
              </p>
            ) : process.env.NODE_ENV === "production" ? (
              <p>
                {translate({
                  id: "theme.SearchPage.noResultsText",
                  message: "No documents were found",
                  description: "The paragraph for empty search result",
                })}
              </p>
            ) : (
              <p>
                ⚠️ The search index is only available when you run docusaurus
                build!
              </p>
            ))}

          {searchResults &&
            searchResults.map((item) => (
              <SearchResultItem key={item.document.i} searchResult={item} />
            ))}
        </section>
      </div>
    </React.Fragment>
  );
}

function SearchResultItem({
  searchResult: { document, type, page, tokens, metadata },
}: {
  searchResult: SearchResult;
}): React.ReactElement {
  const isTitle = type === SearchDocumentType.Title;
  const isKeywords = type === SearchDocumentType.Keywords;
  const isDescription = type === SearchDocumentType.Description;
  const isDescriptionOrKeywords = isDescription || isKeywords;
  const isTitleRelated = isTitle || isDescriptionOrKeywords;
  const isContent = type === SearchDocumentType.Content;
  const pathItems = (
    (isTitle ? document.b : (page as SearchDocument).b) as string[]
  ).slice();
  const articleTitle = (
    isContent || isDescriptionOrKeywords ? document.s : document.t
  ) as string;
  if (!isTitleRelated) {
    pathItems.push((page as SearchDocument).t);
  }
  let search = "";
  if (Mark && tokens.length > 0) {
    const params = new URLSearchParams();
    for (const token of tokens) {
      params.append("_highlight", token);
    }
    search = `?${params.toString()}`;
  }
  return (
    <article className={styles.searchResultItem}>
      <h2>
        <Link
          to={document.u + search + (document.h || "")}
          dangerouslySetInnerHTML={{
            __html:
              isContent || isDescriptionOrKeywords
                ? highlight(articleTitle, tokens)
                : highlightStemmed(
                    articleTitle,
                    getStemmedPositions(metadata, "t"),
                    tokens,
                    100
                  ),
          }}
        ></Link>
      </h2>
      {pathItems.length > 0 && (
        <p className={styles.searchResultItemPath}>
          {concatDocumentPath(pathItems)}
        </p>
      )}
      {(isContent || isDescription) && (
        <p
          className={styles.searchResultItemSummary}
          dangerouslySetInnerHTML={{
            __html: highlightStemmed(
              document.t,
              getStemmedPositions(metadata, "t"),
              tokens,
              100
            ),
          }}
        />
      )}
    </article>
  );
}

// Vecto Search Result Item Component
function VectoSearchResultItem({ result }: { result: VectoLookupResult }) {
  const { breadcrumb, title, pageTitle, url, data } = result.attributes;

  return (
    <article className={styles.searchResultItem}>
      
      {/* Display breadcrumbs if they exist */}
      {breadcrumb && breadcrumb.length > 0 && (
        <p className={styles.searchResultItemPath}>
          {concatDocumentPath(breadcrumb)}
        </p>
      )}

      <div>
        {/* If both title and pageTitle exist, display pageTitle smaller and title prominently */}
        {/* If title doesn't exist, but pageTitle does, display pageTitle prominently */}
        {pageTitle && (!title ? (
          <h2>
            <Link to={result.link}>Page: {pageTitle}</Link>
          </h2>
        ) : (
          <>
            <h5>{pageTitle}</h5>
            <h2>
              <Link to={result.link}>{title}</Link>
            </h2>
          </>
        ))}
      </div>

      {/* Display similarity score if it exists */}
      {result.similarity && (
        <p style={{ fontSize: '0.8rem', color: 'gray', fontStyle: 'italic'}}>
              Search Score: {result.similarity.toFixed(2)}
        </p>
      )}

      {/* Display data if it exists and limit to 100 words */}
      {data && (
        <p style={{ fontStyle: 'italic' }}>
          {data.split(" ").slice(0, 100).join(" ")}{data.split(" ").length > 100 ? "..." : ""}
        </p>
      )}
    </article>
  );
}