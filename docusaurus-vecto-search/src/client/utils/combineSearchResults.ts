// docusaurus-vecto-search/src/client/utils/combineSearchResults.ts

import { SearchResult, SearchDocumentType } from "../../shared/interfaces";
import { VectoLookupResult } from "./vectoApiUtils";

export interface CombinedSearchResult extends SearchResult {
  isBoosted?: boolean;
  isVectorOnly?: boolean;
  vectorSimilarity?: number;
}

// Helper function to convert VectoLookupResult to proper SearchResult format
function convertVectorResultToSearchResult(vectorResult: VectoLookupResult, index: number): CombinedSearchResult {
  return {
    document: {
      i: index,
      t: vectorResult.attributes.title || vectorResult.attributes.pageTitle || 'Untitled',
      u: vectorResult.attributes.url,
      h: vectorResult.attributes.hash || '',
      s: vectorResult.attributes.data ? vectorResult.attributes.data.substring(0, 200) : '',
      b: vectorResult.attributes.breadcrumb || [],
    },
    type: SearchDocumentType.Title,
    page: undefined, // Create a mock page object that won't cause errors
    metadata: {}, // Empty metadata - no highlighting positions
    tokens: [], // Empty tokens - no search terms to highlight
    // Required SearchResultExtra properties
    score: vectorResult.similarity,
    index: index,
    isInterOfTree: false,
    isLastOfTree: false, // Will be updated later if needed
    // Custom properties
    isVectorOnly: true,
    vectorSimilarity: vectorResult.similarity,
  };
}

export function combineSearchResults(
  autocompleteResults: SearchResult[],
  vectorResults: VectoLookupResult[],
  maxResults: number = 10
): CombinedSearchResult[] {
  console.log('🔍 Starting search result combination');
  console.log('📄 Autocomplete results:', autocompleteResults.length, 'items');
  console.log('🎯 Vector search results:', vectorResults.length, 'items');
  console.log('🎚️ Max results limit:', maxResults);

  // Create a map of vector results by URL for quick lookup
  const vectorResultMap = new Map<string, VectoLookupResult>();
  vectorResults.forEach(result => {
    const baseUrl = result.attributes.url;
    console.log(`🔗 Vector result URL: ${baseUrl} (similarity: ${result.similarity})`);
    vectorResultMap.set(baseUrl, result);
  });

  const boostedResults: CombinedSearchResult[] = [];
  const normalResults: CombinedSearchResult[] = [];
  const usedVectorUrls = new Set<string>();

  // Process each autocomplete result
  autocompleteResults.forEach((result, index) => {
    const resultUrl = result.document.u;
    console.log(`📝 Processing autocomplete result ${index}: ${resultUrl}`);
    
    // Check if this URL has a corresponding vector result
    const matchingVectorResult = vectorResultMap.get(resultUrl);
    
    if (matchingVectorResult) {
      console.log(`✅ MATCH FOUND! Boosting result: ${resultUrl} (vector similarity: ${matchingVectorResult.similarity})`);
      
      const boostedResult: CombinedSearchResult = {
        ...result,
        isBoosted: true,
        vectorSimilarity: matchingVectorResult.similarity,
      };
      
      boostedResults.push(boostedResult);
      usedVectorUrls.add(resultUrl);
    } else {
      console.log(`❌ No vector match for: ${resultUrl}`);
      normalResults.push({ ...result });
    }
  });

  // Sort boosted results by vector similarity (highest first)
  boostedResults.sort((a, b) => (b.vectorSimilarity || 0) - (a.vectorSimilarity || 0));
  
  // Calculate how many results we have so far
  const currentResultCount = boostedResults.length + normalResults.length;
  const remainingSlots = maxResults - currentResultCount;
  
  console.log(`📊 Current results: ${currentResultCount}, Remaining slots: ${remainingSlots}`);

  // Fill remaining slots with unused vector results
  const unusedVectorResults: CombinedSearchResult[] = [];
  if (remainingSlots > 0) {
    console.log('🔄 Converting unused vector results to fill remaining slots');
    
    vectorResults
      .filter(vectorResult => !usedVectorUrls.has(vectorResult.attributes.url))
      .slice(0, remainingSlots)
      .forEach((vectorResult, index) => {
        console.log(`🎯 Adding vector-only result ${index + 1}: ${vectorResult.attributes.url} (similarity: ${vectorResult.similarity})`);
        
        const convertedResult = convertVectorResultToSearchResult(vectorResult, currentResultCount + index);
        unusedVectorResults.push(convertedResult);
      });
  }

  // Combine all results: boosted first, then normal, then vector-only
  const finalResults = [...boostedResults, ...normalResults, ...unusedVectorResults];
  
  // Update isLastOfTree for the final result if needed
  if (finalResults.length > 0) {
    finalResults[finalResults.length - 1].isLastOfTree = true;
  }

  console.log(`🚀 Final result summary:`);
  console.log(`   - Boosted results: ${boostedResults.length}`);
  console.log(`   - Normal results: ${normalResults.length}`);
  console.log(`   - Vector-only results: ${unusedVectorResults.length}`);
  console.log(`   - Total results: ${finalResults.length}`);

  // Log the final order
  finalResults.forEach((result, index) => {
    const boostStatus = result.isBoosted ? '🚀 BOOSTED' : 
                       result.isVectorOnly ? '🎯 VECTOR-ONLY' : '📄 NORMAL';
    const similarity = result.vectorSimilarity ? ` (sim: ${result.vectorSimilarity.toFixed(3)})` : '';
    console.log(`${index + 1}. ${boostStatus} ${result.document.u}${similarity}`);
  });

  return finalResults;
}