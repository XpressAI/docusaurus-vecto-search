import { Configuration, 
    IndexApi, IndexDataRequest, 
    UpdateApi, ClearVectorSpaceRequest,
    LookupApi, LookupRequest, LookupResult } from '@xpressai/vecto-client';

function createAPIInstance<T>(APIType: new (config: Configuration) => T, user_token: string): T {
  const config = new Configuration({
    accessToken: user_token
  });
  return new APIType(config);
}

export async function ingestToVecto(vector_space_id: number, user_token: string, document: { data: string, attributes: object }) {
  const api = createAPIInstance(IndexApi, user_token);

  // Convert the content to a Blob
  const textBlob = new Blob([document.data], { type: 'text/plain' });

  const params: IndexDataRequest = {
    vectorSpaceId: vector_space_id,
    modality: "TEXT",
    attributes: [JSON.stringify(document.attributes)],
    input: [textBlob]
  };

  const indexResponse = await api.indexData(params);
  if (!indexResponse) {
    throw new Error('Failed to index document to Vecto.');
  }
}

export async function clearVectorSpace(vector_space_id: number, user_token: string) {
  const api = createAPIInstance(UpdateApi, user_token);

  const clearVectorSpaceParams: ClearVectorSpaceRequest = {
    vectorSpaceId: vector_space_id
  };
  
  const clearResponse = await api.clearVectorSpace(clearVectorSpaceParams);
  if (!clearResponse) {
    throw new Error('Failed to clear vector space.');
  }
}

export type VectoLookupResult = LookupResult & {
    attributes: DocumentAttributes;
    similarity: number;
    title: string;
    link: string;
};

interface DocumentAttributes {
    data: string;
    title: string;
    url: string;
    hash: string;
    pageTitle: string | null;
    breadcrumb: [string] | null;
}
  
export const vectoSearch = async (vector_space_id: number, public_token: string, top_k: number, query: string): Promise<VectoLookupResult[]> => {
    const api = createAPIInstance(LookupApi, public_token);

    const params: LookupRequest = {
        vectorSpaceId: vector_space_id,
        modality: 'TEXT',
        topK: top_k,
        query: query
    };

    const lookupResponse = await api.lookup(params);
    if (!lookupResponse) {
        throw new Error('Failed to perform lookup.');
    }

    return (lookupResponse.results as VectoLookupResult[]).map(result => ({
        id: result.id,
        link: result.attributes.url + (result.attributes.hash ? `${result.attributes.hash}` : ""),
        title: result.attributes.title,
        similarity: result.similarity,
        attributes: result.attributes
    })) || [];
};


export const groupAndAverageByURL = (results: VectoLookupResult[]): VectoLookupResult[] => {
  // Group by URL and average the similarity scores
  const urlGroups: { [url: string]: VectoLookupResult[] } = {};
  results.forEach(result => {
      if (urlGroups[result.attributes.url]) {
          urlGroups[result.attributes.url].push(result);
      } else {
          urlGroups[result.attributes.url] = [result];
      }
  });

  const aggregatedResults = Object.values(urlGroups).map(group => {
      // Calculate the average similarity
      const avgSimilarity = group.reduce((sum, result) => sum + (result.similarity), 0) / group.length;
      
      // Find the result with the maximum similarity within the group
      const maxSimilarityResult = group.reduce((prev, current) => 
          (prev.similarity) > (current.similarity) ? prev : current
      );

      return {
          id: maxSimilarityResult.id,
          link: maxSimilarityResult.link,
          title: maxSimilarityResult.attributes.title,
          similarity: avgSimilarity,
          attributes: maxSimilarityResult.attributes
      };
  });

  // Sort the results by similarity in descending order
  return aggregatedResults.sort((a, b) => (b.similarity) - (a.similarity));
};

export const groupAndCountByURL = (results: VectoLookupResult[]): VectoLookupResult[] => {
  // Group by URL
  const urlGroups: { [url: string]: VectoLookupResult[] } = {};
  results.forEach(result => {
      if (urlGroups[result.attributes.url]) {
          urlGroups[result.attributes.url].push(result);
      } else {
          urlGroups[result.attributes.url] = [result];
      }
  });

  const aggregatedResults = Object.values(urlGroups).map(group => {
      // Find the result with the maximum similarity within the group
      const maxSimilarityResult = group.reduce((prev, current) => 
          (prev.similarity) > (current.similarity) ? prev : current
      );

      return {
          id: maxSimilarityResult.id,
          link: maxSimilarityResult.link,
          title: maxSimilarityResult.attributes.title,
          similarity: maxSimilarityResult.similarity,
          attributes: maxSimilarityResult.attributes,
          count: group.length // store the count of how many times this URL appeared
      };
  });

  // Sort the results by count in descending order
  return aggregatedResults.sort((a, b) => (b.count) - (a.count));
};

export const groupAndWeightedAverageByURL = (results: VectoLookupResult[]): VectoLookupResult[] => {
  // Group by URL
  const urlGroups: { [url: string]: VectoLookupResult[] } = {};
  results.forEach(result => {
    if (urlGroups[result.attributes.url]) {
      urlGroups[result.attributes.url].push(result);
    } else {
      urlGroups[result.attributes.url] = [result];
    }
  });

  const aggregatedResults = Object.values(urlGroups).map(group => {
    // Calculate the weighted average similarity
    const totalWeight = group.reduce((sum, result) => sum + result.similarity, 0);
    const weightedSimilaritySum = group.reduce((sum, result) => sum + (result.similarity * result.similarity), 0);
    
    // Guard against division by zero
    const weightedAvgSimilarity = totalWeight !== 0 ? weightedSimilaritySum / totalWeight : 0;

    // Find the result with the maximum similarity within the group
    const maxSimilarityResult = group.reduce((prev, current) => 
      (prev.similarity) > (current.similarity) ? prev : current
    );

    return {
      id: maxSimilarityResult.id,
      link: maxSimilarityResult.link,
      title: maxSimilarityResult.attributes.title,
      similarity: weightedAvgSimilarity,
      attributes: maxSimilarityResult.attributes
    };
  });

  // Sort the results by weighted average similarity in descending order
  return aggregatedResults.sort((a, b) => (b.similarity) - (a.similarity));
};