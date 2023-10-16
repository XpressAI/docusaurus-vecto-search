import { Configuration, 
    IndexApi, IndexDataRequest, 
    UpdateApi, ClearVectorSpaceRequest,
    LookupApi, LookupRequest, LookupResult } from 'vecto-sdk';

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
        link: "/docs/" + result.attributes.url + (result.attributes.hash ? `#${result.attributes.hash}` : ""),
        title: result.attributes.title,
        similarity: result.similarity,
        attributes: result.attributes
    })) || [];
};
