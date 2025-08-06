import { SearchResult, SearchDocumentType, SearchDocument } from "../../shared/interfaces";
import { VectoLookupResult } from "./vectoApiUtils";

export interface CombinedSearchResult extends SearchResult {
  isBoosted?: boolean;
  isVectorOnly?: boolean;
  vectorSimilarity?: number;
}

// Helper function to convert VectoLookupResult to proper SearchResult format
function convertVectorResultToSearchResult(vectorResult: VectoLookupResult, index: number): CombinedSearchResult {
  console.log('🔄 Converting vector result to SearchResult:', {
    url: vectorResult.attributes.url,
    title: vectorResult.attributes.title,
    hasHash: !!vectorResult.attributes.hash,
    hasData: !!vectorResult.attributes.data,
    hasBreadcrumb: !!vectorResult.attributes.breadcrumb,
    dataLength: vectorResult.attributes.data?.length || 0
  });

  // Create a proper page object that matches what autocomplete results have
  const mockPage: SearchDocument = {
    i: index + 10000, // Use high number to avoid conflicts with real page indices
    t: vectorResult.attributes.pageTitle || vectorResult.attributes.title || 'Untitled Page',
    u: vectorResult.attributes.url,
    h: '', // Page hash is usually empty for page objects
    s: '', // Page summary - empty for vector results
    b: vectorResult.attributes.breadcrumb || [],
  };

  // For vector results, we'll use Title type to avoid complex highlighting issues
  const documentType = SearchDocumentType.Title;
  const documentTitle = vectorResult.attributes.title || vectorResult.attributes.data?.substring(0, 100) || 'Untitled';
  const documentSummary = vectorResult.attributes.data?.substring(0, 200) || '';

  console.log('📋 Document details:', {
    documentType,
    documentTitle: documentTitle.substring(0, 50) + '...',
    documentSummary: documentSummary.substring(0, 50) + '...'
  });

  // Empty tokens and metadata since vector search doesn't provide highlighting positions
  const tokens: string[] = [];
  const metadata = {}; // Empty metadata object

  const searchResult: CombinedSearchResult = {
    document: {
      i: index + 10000, // Unique index to avoid conflicts
      t: documentTitle,
      u: vectorResult.attributes.url,
      h: vectorResult.attributes.hash || '',
      s: documentSummary,
      b: vectorResult.attributes.breadcrumb || [],
    },
    type: documentType, // Always use Title type for simplicity
    page: mockPage,
    metadata: metadata,
    tokens: tokens, 
    // Required SearchResultExtra properties
    score: vectorResult.similarity * 100, // Scale similarity to match search scores
    index: index + 10000,
    isInterOfTree: false,
    isLastOfTree: false,
    // Custom properties
    isVectorOnly: true,
    vectorSimilarity: vectorResult.similarity,
  };

  console.log('✅ Converted SearchResult:', {
    documentTitle: searchResult.document.t.substring(0, 50) + '...',
    documentUrl: searchResult.document.u,
    type: searchResult.type,
    hasPage: !!searchResult.page,
    pageTitle: (searchResult.page as SearchDocument)?.t,
    isVectorOnly: searchResult.isVectorOnly,
    similarity: searchResult.vectorSimilarity,
    hasTokens: searchResult.tokens.length > 0,
    hasMetadata: Object.keys(searchResult.metadata).length > 0
  });

  return searchResult;
}

export function combineSearchResultsCore(
  autocompleteResults: SearchResult[],
  vectorResults: VectoLookupResult[],
  maxResults: number = 10
): CombinedSearchResult[] {
  console.log('🔍 Starting search result combination');
  console.log('📄 Autocomplete results:', autocompleteResults.length, 'items');
  console.log('🎯 Vector search results:', vectorResults.length, 'items');
  console.log('🎚️ Max results limit:', maxResults);

  // Log autocomplete result structure for comparison
  if (autocompleteResults.length > 0) {
    const sample = autocompleteResults[0];
    console.log('📊 Sample autocomplete result structure:', {
      type: sample.type,
      hasTokens: sample.tokens.length > 0,
      hasMetadata: Object.keys(sample.metadata).length > 0,
      metadataKeys: Object.keys(sample.metadata),
      documentTitle: sample.document.t.substring(0, 50),
      pageTitle: sample.page ? (sample.page as SearchDocument).t : 'no page'
    });
  }

  // Create a map of vector results by URL for quick lookup
  const vectorResultMap = new Map<string, VectoLookupResult>();
  vectorResults.forEach(result => {
    const baseUrl = result.attributes.url;
    console.log(`🔗 Mapping vector result URL: ${baseUrl} (similarity: ${result.similarity})`);
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
    
    const unusedVectors = vectorResults.filter(vectorResult => !usedVectorUrls.has(vectorResult.attributes.url));
    console.log(`🎯 Found ${unusedVectors.length} unused vector results`);
    
    unusedVectors
      .slice(0, remainingSlots)
      .forEach((vectorResult, index) => {
        console.log(`🎯 Adding vector-only result ${index + 1}: ${vectorResult.attributes.url} (similarity: ${vectorResult.similarity})`);
        
        const convertedResult = convertVectorResultToSearchResult(vectorResult, currentResultCount + index);
        
        // Validate the converted result before adding
        console.log('🔍 Validating converted result:', {
          hasDocument: !!convertedResult.document,
          hasDocumentTitle: !!convertedResult.document.t,
          hasPage: !!convertedResult.page,
          type: convertedResult.type,
          tokensLength: convertedResult.tokens.length,
          metadataKeys: Object.keys(convertedResult.metadata).length
        });
        
        unusedVectorResults.push(convertedResult);
      });
  }

  // Combine all results: boosted first, then normal, then vector-only
  const finalResults = [...boostedResults, ...normalResults, ...unusedVectorResults];
  
  console.log(`🚀 Final result summary:`);
  console.log(`   - Boosted results: ${boostedResults.length}`);
  console.log(`   - Normal results: ${normalResults.length}`);
  console.log(`   - Vector-only results: ${unusedVectorResults.length}`);
  console.log(`   - Total results: ${finalResults.length}`);

  // Final validation of all results
  finalResults.forEach((result, index) => {
    console.log(`🔍 Final result ${index + 1} validation:`, {
      type: result.type,
      hasTitle: !!result.document.t,
      hasUrl: !!result.document.u,
      hasPage: !!result.page,
      tokensCount: result.tokens.length,
      metadataKeyCount: Object.keys(result.metadata).length,
      isVectorOnly: result.isVectorOnly
    });
  });

  return finalResults;
}

// SearchBar-specific wrapper that maintains compatibility
export function combineSearchResults(
  autocompleteResults: SearchResult[],
  vectorResults: VectoLookupResult[],
  maxResults: number = 10
): CombinedSearchResult[] {
  const results = combineSearchResultsCore(autocompleteResults, vectorResults, maxResults);
  
  // Update isLastOfTree for the final result if needed (SearchBar specific)
  if (results.length > 0) {
    results[results.length - 1].isLastOfTree = true;
  }

  return results;
}