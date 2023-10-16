import { Configuration, 
    IndexApi, IndexDataRequest, 
    UpdateApi, ClearVectorSpaceRequest,
    LookupApi, LookupRequest } from 'vecto-sdk';

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

export interface VectoSearchResult {
    link: string;
    title: string | undefined;
    summary: string;
    similarity?: number;
    attributes: object;
  }

export const vectoSearch = async (vector_space_id: number, public_token: string, top_k: number, query: string): Promise<VectoSearchResult[]> => {
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

    return lookupResponse.results?.map(result => ({
        link: "/docs/" + result.id,
        title: result.id?.toString(),
        summary: JSON.stringify(result.attributes),
        similarity: result.similarity,
        attributes: result.attributes as any 
    })) || [];
};