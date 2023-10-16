import { ClearVectorSpaceRequest, Configuration, IndexApi, IndexDataRequest, UpdateApi } from 'vecto-sdk';

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
