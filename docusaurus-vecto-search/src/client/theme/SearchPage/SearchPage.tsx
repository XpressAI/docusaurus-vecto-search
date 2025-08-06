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
import { combineSearchResultsCore, CombinedSearchResult } from "../../utils/combineSearchResults";

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
  
  // Updated state to use combined results
  const [searchResults, setSearchResults] = useState<CombinedSearchResult[]>();
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  
  const versionUrl = `${baseUrl}${searchVersion}`;

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

  // Combined search handler
  const handleCombinedSearch = useCallback(async () => {
    if (!searchQuery) {
      setSearchResults(undefined);
      return;
    }
    
    setIsLoadingResults(true);
    setVectoSearchError(null);

    try {
      // Get traditional search results first
      const traditionalResults = await searchByWorker(
        versionUrl,
        searchContext,
        searchQuery,
        100
      );

      // If Vecto is not configured, just use traditional results
      if (!vectorSpaceId || !publicToken || vectoConfigErrors.length > 0) {
        const combinedResults = traditionalResults.map(result => ({ ...result }));
        setSearchResults(combinedResults);
        setIsLoadingResults(false);
        return;
      }

      // Perform vector search
      let vectorResults = await vectoSearch(vectorSpaceId, publicToken, topK, searchQuery);
      
      // Apply the correct ranking function
      if (rankBy === "average") {
        vectorResults = groupAndAverageByURL(vectorResults);
      } else if (rankBy === "count") {
        vectorResults = groupAndCountByURL(vectorResults);
      } else if (rankBy === "weightedAverage") {
        vectorResults = groupAndWeightedAverageByURL(vectorResults);
      }

      // Combine the results using core logic (no maxResults limit for search page)
      const combinedResults = combineSearchResultsCore(traditionalResults, vectorResults, 50);
      
      setSearchResults(combinedResults);
    } catch (error) {
      console.error('Error in combined search:', error);
      setVectoSearchError(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fallback to traditional search only
      try {
        const fallbackResults = await searchByWorker(
          versionUrl,
          searchContext,
          searchQuery,
          100
        );
        const combinedResults = fallbackResults.map(result => ({ ...result }));
        setSearchResults(combinedResults);
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
        setSearchResults([]);
      }
    } finally {
      setIsLoadingResults(false);
    }
  }, [searchQuery, versionUrl, searchContext, vectorSpaceId, publicToken, topK, rankBy, vectoConfigErrors.length]);

  useEffect(() => {
    updateSearchPath(searchQuery);
    
    // Clear the previous timeout if there's any
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set a new timeout to call combined search
    if (searchQuery) {
      searchTimeoutRef.current = setTimeout(() => {
        handleCombinedSearch();
      }, 300); // Shorter timeout for search page
    } else {
      setSearchResults(undefined);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
    
    // `updateSearchPath` should not be in the deps,
    // otherwise will cause call stack overflow.
  }, [searchQuery, handleCombinedSearch]);

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

        {/* Combined Search Results Section */}
        <section>
          <h2>Search Results</h2>
          
          {/* Display configuration errors */}
          {vectoConfigErrors.length > 0 && (
            <div style={{ 
              backgroundColor: '#fff3cd', 
              border: '1px solid #ffeaa7', 
              borderRadius: '4px', 
              padding: '12px', 
              marginBottom: '16px' 
            }}>
              <h4 style={{ color: '#856404', margin: '0 0 8px 0' }}>⚠️ Vector Search Configuration Issues:</h4>
              <ul style={{ margin: '0', paddingLeft: '20px' }}>
                {vectoConfigErrors.map((error, index) => (
                  <li key={index} style={{ color: '#856404' }}>{error}</li>
                ))}
              </ul>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.9em', fontStyle: 'italic', color: '#856404' }}>
                Search will continue with traditional keyword-based results only.
              </p>
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
              <h4 style={{ color: '#d32f2f', margin: '0 0 8px 0' }}>❌ Search Error:</h4>
              <p style={{ color: '#d32f2f', margin: '0' }}>{vectoSearchError}</p>
            </div>
          )}

          {/* Loading state */}
          {isLoadingResults && (
            <div>
              <LoadingRing />
            </div>
          )}

          {/* Search results */}
          {searchResults && searchResults.length > 0 && (
            <>
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
              {searchResults.map((item, index) => (
                <CombinedSearchResultItem key={`${item.document.i}-${index}`} searchResult={item} />
              ))}
            </>
          )}

          {/* No results message when search is done but no results */}
          {!isLoadingResults && searchQuery && searchResults && searchResults.length === 0 && (
            <p>
              {translate({
                id: "theme.SearchPage.noResultsText",
                message: "No documents were found",
                description: "The paragraph for empty search result",
              })}
            </p>
          )}

          {/* Development mode warning */}
          {!isLoadingResults && searchQuery && !searchResults && process.env.NODE_ENV !== "production" && (
            <p>
              ⚠️ The search index is only available when you run docusaurus build!
            </p>
          )}
        </section>
      </div>
    </React.Fragment>
  );
}

// Updated combined search result item component
function CombinedSearchResultItem({
  searchResult,
}: {
  searchResult: CombinedSearchResult;
}): React.ReactElement {
  const { document, type, page, tokens, metadata, isBoosted, isVectorOnly, vectorSimilarity } = searchResult;
  
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
  if (Mark && tokens.length > 0 && !isVectorOnly) {
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
                ? isVectorOnly ? articleTitle : highlight(articleTitle, tokens)
                : isVectorOnly ? articleTitle : highlightStemmed(
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
            __html: isVectorOnly ? document.t : highlightStemmed(
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