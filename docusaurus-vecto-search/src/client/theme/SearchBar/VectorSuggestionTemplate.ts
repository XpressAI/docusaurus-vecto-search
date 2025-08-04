import {
  SearchDocument,
  SearchDocumentType,
  SearchResult,
} from "../../../shared/interfaces";
import { concatDocumentPath } from "../../utils/concatDocumentPath";
import { getStemmedPositions } from "../../utils/getStemmedPositions";
import { highlight } from "../../utils/highlight";
import { highlightStemmed } from "../../utils/highlightStemmed";
import { explicitSearchResultPath } from "../../utils/proxiedGenerated";
import {
  iconAction,
  iconContent,
  iconHeading,
  iconTitle,
  iconTreeInter,
  iconTreeLast,
} from "./icons";
import styles from "./SearchBar.module.css";

/**
 * Safe wrapper around highlightStemmed that handles empty metadata gracefully
 */
function safeHighlightStemmed(
  content: string,
  positions: any[],
  tokens: string[],
  maxLength?: number
): string {
  try {
    // If no positions or tokens, return plain escaped content
    if (!positions || positions.length === 0 || !tokens || tokens.length === 0) {
      return escapeHtml(content);
    }
    
    // Validate positions array
    const validPositions = positions.filter(pos => 
      Array.isArray(pos) && 
      pos.length === 2 && 
      typeof pos[0] === 'number' && 
      typeof pos[1] === 'number' &&
      pos[0] >= 0 &&
      pos[1] > 0 &&
      pos[0] + pos[1] <= content.length
    );
    
    if (validPositions.length === 0) {
      return escapeHtml(content);
    }
    
    return highlightStemmed(content, validPositions, tokens, maxLength);
  } catch (error) {
    console.warn('⚠️ Error in highlightStemmed, falling back to escaped text:', error);
    return escapeHtml(content);
  }
}

/**
 * Safe HTML escaping function
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Safe highlight function that handles empty tokens
 */
function safeHighlight(content: string, tokens: string[]): string {
  try {
    if (!tokens || tokens.length === 0) {
      return escapeHtml(content);
    }
    return highlight(content, tokens);
  } catch (error) {
    console.warn('⚠️ Error in highlight, falling back to escaped text:', error);
    return escapeHtml(content);
  }
}

/**
 * Type guard to check if page is a SearchDocument
 */
function isSearchDocument(page: SearchDocument | undefined | false): page is SearchDocument {
  return page !== false && page !== undefined && typeof page === 'object' && 'i' in page;
}

/**
 * Vector-aware suggestion template that safely handles both regular and vector search results
 */
export function VectorSuggestionTemplate({
  document,
  type,
  page,
  metadata,
  tokens,
  isInterOfTree,
  isLastOfTree,
}: Omit<SearchResult, "score" | "index">): string {
  console.log('🎨 VectorSuggestionTemplate rendering:', {
    documentTitle: document.t?.substring(0, 30),
    type,
    hasMetadata: !!metadata && Object.keys(metadata).length > 0,
    tokensCount: tokens?.length || 0,
    hasPage: !!page,
    pageType: typeof page
  });

  // Validate required inputs
  if (!document || !document.t || !document.u) {
    console.error('❌ Invalid document in VectorSuggestionTemplate:', document);
    return `<div class="error">Invalid search result</div>`;
  }

  const isTitle = type === SearchDocumentType.Title;
  const isKeywords = type === SearchDocumentType.Keywords;
  const isTitleRelated = isTitle || isKeywords;
  const isHeading = type === SearchDocumentType.Heading;
  
  const tree: string[] = [];
  if (isInterOfTree) {
    tree.push(iconTreeInter);
  } else if (isLastOfTree) {
    tree.push(iconTreeLast);
  }
  
  const treeWrapper = tree.map(
    (item) => `<span class="${styles.hitTree}">${item}</span>`
  );
  
  const icon = `<span class="${styles.hitIcon}">${
    isTitleRelated ? iconTitle : isHeading ? iconHeading : iconContent
  }</span>`;

  // Safe title rendering
  let titleHtml: string;
  try {
    if (isKeywords && document.s) {
      console.log('🏷️ Rendering keywords result');
      titleHtml = safeHighlight(document.s, tokens || []);
    } else {
      console.log('📝 Rendering with safe stemmed highlighting');
      const stemmedPositions = getStemmedPositions(metadata || {}, "t");
      console.log('📍 Stemmed positions:', stemmedPositions);
      titleHtml = safeHighlightStemmed(document.t, stemmedPositions, tokens || []);
    }
  } catch (error) {
    console.error('❌ Error in title highlighting:', error);
    titleHtml = escapeHtml(document.t);
  }

  const wrapped = [`<span class="${styles.hitTitle}">${titleHtml}</span>`];

  // Safe path rendering
  const needsExplicitHitPath =
    !isInterOfTree && !isLastOfTree && explicitSearchResultPath;
    
  try {
    if (needsExplicitHitPath) {
      console.log('📂 Adding explicit hit path');
      const pathItems = isSearchDocument(page)
        ? page.b
            ?.concat(page.t)
            .concat(!document.s || document.s === page.t ? [] : document.s)
        : document.b;
      wrapped.push(
        `<span class="${styles.hitPath}">${concatDocumentPath(
          pathItems ?? []
        )}</span>`
      );
    } else if (!isTitleRelated) {
      console.log('📄 Adding page title path');
      const pageTitle = isSearchDocument(page) ? page.t : '';
      const fallbackTitle = document.u.startsWith("/docs/api-reference/") ? "API Reference" : "";
      const pathTitle = pageTitle || fallbackTitle;
      
      if (pathTitle) {
        const pathHtml = safeHighlight(pathTitle, tokens || []);
        wrapped.push(`<span class="${styles.hitPath}">${pathHtml}</span>`);
      }
    }
  } catch (error) {
    console.error('❌ Error in path rendering:', error);
    // Don't add path if there's an error - just continue with title
  }

  const action = `<span class="${styles.hitAction}">${iconAction}</span>`;
  
  const result = [
    ...treeWrapper,
    icon,
    `<span class="${styles.hitWrapper}">`,
    ...wrapped,
    "</span>",
    action,
  ].join("");

  console.log('✅ VectorSuggestionTemplate completed successfully');
  return result;
}