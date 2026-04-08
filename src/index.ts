import path from "path";
import type { LoadContext, Plugin } from "@docusaurus/types";
import type { ThemeConfig } from "@docusaurus/types";
import { indexSite } from "./server/indexer";
import type { VectorSearchConfig } from "./types";

export default function vectorSearchTheme(
  context: LoadContext,
  _options: Record<string, unknown>
): Plugin<void> {
  return {
    name: "@xpressai/docusaurus-vecto-search",

    getThemePath() {
      return path.resolve(__dirname, "../src/theme");
    },

    async postBuild({ outDir, routesPaths, plugins }) {
      const config = (
        context.siteConfig.themeConfig as ThemeConfig & {
          vectorSearch: VectorSearchConfig;
        }
      ).vectorSearch;

      const mode = config?.mode ?? "hybrid";
      const indexDir = path.join(outDir, config?.indexPath ?? "search-index");

      console.log(
        `[vector-search] Indexing ${routesPaths.length} routes (mode: ${mode})...`
      );

      await indexSite({
        outDir,
        routesPaths,
        indexDir,
        plugins,
        config,
      });

      console.log(`[vector-search] Index complete → ${indexDir}`);
    },
  };
}

export function validateThemeConfig({
  themeConfig,
  validate,
}: {
  themeConfig: ThemeConfig & { vectorSearch?: Partial<VectorSearchConfig> };
  validate: (schema: unknown, config: unknown) => unknown;
}): unknown {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Joi = require("joi");

  const schema = Joi.object({
    vectorSearch: Joi.object({
      mode: Joi.string()
        .valid("bm25", "vector", "hybrid")
        .default("hybrid"),

      vecto: Joi.object({
        publicToken: Joi.string().allow("").default(""),
        vectorSpaceId: Joi.number().integer().allow(null).default(null),
        clearOnBuild: Joi.boolean().default(true),
        batchSize: Joi.number().integer().min(1).default(50),
      }).default(),

      bm25: Joi.object({
        k1: Joi.number().default(1.5),
        b: Joi.number().default(0.75),
      }).default(),

      rrf: Joi.object({
        k: Joi.number().integer().default(60),
      }).default(),

      weights: Joi.object({
        vector: Joi.number().min(0).max(1),
        bm25: Joi.number().min(0).max(1),
      })
        .allow(null)
        .default(null),

      maxResults: Joi.number().integer().min(1).default(10),

      content: Joi.object({
        chunkSize: Joi.number().integer().min(50).default(500),
        chunkOverlap: Joi.number().integer().min(0).default(50),
      }).default(),

      hotkey: Joi.string().default("mod+k"),
      placeholder: Joi.string().default("Search docs..."),
      indexPath: Joi.string().default("search-index"),
    }).default(),
  });

  return validate(schema, themeConfig);
}
