import React, { useCallback, useEffect, useMemo, useState } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";
import { translate } from "@docusaurus/Translate";
import { usePluralForm } from "@docusaurus/theme-common";
import clsx from "clsx";

import useSearchQuery from "../hooks/useSearchQuery";
import { fetchIndexes } from "../SearchBar/fetchIndexes";
import { SearchSourceFactory } from "../../utils/SearchSourceFactory";
import { SearchDocument, SearchResult } from "../../../shared/interfaces";
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
import { vectoSearch, VectoSearchResult } from "../../utils/vectoApiUtils";

export default function SearchPage(): React.ReactElement {
  return (
    <Layout>
      <SearchPageContent />
    </Layout>
  );
}

function SearchPageContent(): React.ReactElement {
  const {
    siteConfig: { baseUrl },
  } = useDocusaurusContext();
  const context = useDocusaurusContext();

  interface VectoPluginOptions {
    public_token?: string;
    vector_space_id?: number;
    top_k?: number;
    [key: string]: any; // To allow for other unexpected properties
  }

  const themeTuple = context.siteConfig.themes[0] as VectoPluginOptions;
  const configValues = themeTuple[1];
  const vector_space_id = configValues.vector_space_id;
  const public_token = configValues.public_token;
  const top_k = configValues.top_k;


  console.log('Vector Space ID:', vector_space_id);
  console.log('Public Token:', public_token);

  console.log('Docusaurus Context:', context);
  console.log('vectorSpaceId:', vector_space_id);
  console.log('publicToken:', public_token);
  console.log('topK:', top_k);

  const vectorSpaceId: number = vector_space_id as number;
  const publicToken: string = public_token as string;
  const topK: number = top_k as number;
  
  const { selectMessage } = usePluralForm();
  const {
    searchValue,
    searchContext,
    searchVersion,
    updateSearchPath,
    updateSearchContext,
  } = useSearchQuery();
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const [searchSource, setSearchSource] =
    useState<
      (input: string, callback: (results: SearchResult[]) => void) => void
    >();
  const [searchResults, setSearchResults] = useState<SearchResult[]>();
  const versionUrl = `${baseUrl}${searchVersion}`;
  const [vectoSearchResults, setVectoSearchResults] = useState<VectoSearchResult[]>([]);
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

  useEffect(() => {
    updateSearchPath(searchQuery);

    if (searchSource) {
      if (searchQuery) {
        searchSource(searchQuery, (results) => {
          setSearchResults(results);
        });
      } else {
        setSearchResults(undefined);
      }
    }

    // `updateSearchPath` should not be in the deps,
    // otherwise will cause call stack overflow.
  }, [searchQuery, searchSource]);

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const handleSearchInputKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleVectoSearch();
      }
    },
    [searchQuery]
  );
  
  const handleVectoSearch = useCallback(async () => {
    setIsLoadingVectoResults(true);
  
    try {
      const results = await vectoSearch(vectorSpaceId, publicToken, topK, searchQuery);
      setVectoSearchResults(results);
    } catch (error) {
      console.error('Error fetching Vecto search results:', error);
    } finally {
      setIsLoadingVectoResults(false);
    }
  }, [searchQuery]);
  
  useEffect(() => {
    if (searchValue && searchValue !== searchQuery) {
      setSearchQuery(searchValue);
    }
  }, [searchValue]);

  useEffect(() => {
    async function doFetchIndexes() {
      const { wrappedIndexes, zhDictionary } = await fetchIndexes(
        versionUrl,
        searchContext
      );
      setSearchSource(() =>
        SearchSourceFactory(wrappedIndexes, zhDictionary, 100)
      );
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
              onKeyPress={handleSearchInputKeyPress}
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
                <option value="">
                  {useAllContextsWithNoSearchContext
                    ? translate({
                        id: "theme.SearchPage.searchContext.everywhere",
                        message: "everywhere",
                      })
                    : ""}
                </option>
                {searchContextByPaths.map((context: string) => (
                  <option key={context} value={context}>
                    {context}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {isLoadingVectoResults ? (
          <div>
            <LoadingRing />
          </div>
        ) : vectoSearchResults.length > 0 && (
          <section>
            <h2>Vecto Search Results</h2>
            {vectoSearchResults.map((result, index) => (
              <VectoSearchResultItem key={index} result={result} />
            ))}
          </section>
        )}


        {!searchSource && searchQuery && (
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

        <section>
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
  const isTitle = type === 0;
  const isContent = type === 2;
  const pathItems = (
    (isTitle ? document.b : (page as SearchDocument).b) as string[]
  ).slice();
  const articleTitle = (isContent ? document.s : document.t) as string;
  if (!isTitle) {
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
            __html: isContent
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
      {isContent && (
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



function VectoSearchResultItem({ result }: { result: VectoSearchResult }) {
  return (
    <article className={styles.searchResultItem}>
      <h2>
        <Link to={result.link}>
          {result.title}
        </Link>
      </h2>
      <p className={styles.searchResultItemSummary}>
        {result.summary}
      </p>
      {result.similarity && (
        <p className={styles.searchResultItemSimilarity}>
          Similarity: {result.similarity}
        </p>
      )}
      {result.attributes && (
        <div className={styles.searchResultItemAttributes}>
          Attributes: <pre>{JSON.stringify(result.attributes, null, 2)}</pre>
        </div>
      )}
    </article>
  );
}
