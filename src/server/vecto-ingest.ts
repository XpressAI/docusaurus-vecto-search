import {
  Configuration,
  IndexApi,
  UpdateApi,
} from "@xpressai/vecto-client";
import type { VectorSearchConfig, DocumentChunk, VectoAttributes } from "../types";

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function ingestToVecto(
  documents: DocumentChunk[],
  config: VectorSearchConfig
): Promise<void> {
  const token = config.vecto?.userToken || process.env.VECTO_USER_TOKEN;
  const vectorSpaceId = config.vecto?.vectorSpaceId;

  if (!token) {
    throw new Error(
      "[vector-search] VECTO_USER_TOKEN env var required for vector/hybrid mode"
    );
  }
  if (!vectorSpaceId) {
    throw new Error(
      "[vector-search] vecto.vectorSpaceId is required in themeConfig"
    );
  }

  const vConfig = new Configuration({ accessToken: token });
  const indexApi = new IndexApi(vConfig);
  const updateApi = new UpdateApi(vConfig);
  const batchSize = config.vecto?.batchSize || 50;

  if (config.vecto?.clearOnBuild !== false) {
    console.log("[vector-search] Clearing Vecto vector space...");
    try {
      await updateApi.clearVectorSpace({ vectorSpaceId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[vector-search] Clear failed (may be empty):", msg);
    }
  }

  console.log(
    `[vector-search] Ingesting ${documents.length} chunks into Vecto (space: ${vectorSpaceId})...`
  );

  let totalIngested = 0;

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);

    const attributes: string[] = batch.map((doc) =>
      JSON.stringify({
        id: doc.id,
        url: doc.url,
        title: doc.title,
        heading: doc.heading,
        version: doc.version,
        language: doc.language,
        docusaurusTag: doc.docusaurusTag,
        snippet: doc.text.slice(0, 200),
      } satisfies VectoAttributes)
    );

    const input: Blob[] = batch.map((doc) => new Blob([doc.text]));

    try {
      const response = await indexApi.indexData({
        vectorSpaceId,
        modality: "TEXT",
        attributes,
        input,
      });

      totalIngested += (response as { ids?: number[] }).ids?.length ?? batch.length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[vector-search] Batch ${i}-${i + batch.length} failed:`,
        msg
      );
    }

    if (i + batchSize < documents.length) {
      await sleep(300);
    }
  }

  console.log(`[vector-search] Ingested ${totalIngested} chunks into Vecto`);
}
