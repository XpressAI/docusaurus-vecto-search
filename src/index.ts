import path from "path";
import fs from "fs";
import type { LoadContext, Plugin } from "@docusaurus/types";
import type { ThemeConfig } from "@docusaurus/types";
import { normalizeUrl } from "@docusaurus/utils";
import { indexSite } from "./server/indexer";
import type { DocMeta } from "./server/indexer";
import type { VectorSearchConfig } from "./types";

export default function vectorSearchTheme(
  context: LoadContext,
  _options: Record<string, unknown>
): Plugin<void> {
  const collectedDocs: DocMeta[] = [];

  return {
    name: "@xpressai/docusaurus-vecto-search",

    getThemePath() {
      return path.resolve(__dirname, "../src/theme");
    },

    // Register the /search route.
    async contentLoaded({ actions: { addRoute } }) {
      addRoute({
        path: normalizeUrl([context.baseUrl, "search"]),
        component: "@theme/SearchPage",
        exact: true,
      });
    },

    // Collect doc metadata from all content plugins.
    // This hook provides allContent — contentLoaded does NOT.
    async allContentLoaded({ allContent }) {
      for (const [pluginName, pluginContent] of Object.entries(
        allContent as Record<string, Record<string, unknown>>
      )) {
        if (pluginName.includes("content-docs")) {
          const versions = pluginContent as Record<
            string,
            { loadedVersions?: Array<{ docs?: Array<{
              title?: string;
              source?: string;
              permalink?: string;
              version?: string;
            }> }> }
          >;
          for (const instance of Object.values(versions)) {
            for (const ver of instance.loadedVersions ?? []) {
              for (const doc of ver.docs ?? []) {
                if (doc.source && doc.permalink) {
                  collectedDocs.push({
                    title: doc.title ?? path.basename(doc.permalink),
                    sourcePath: doc.source.startsWith("@site/")
                      ? path.resolve(context.siteDir, doc.source.slice(6))
                      : doc.source,
                    url: doc.permalink,
                    version: (doc.version as string) ?? "current",
                    language: context.i18n?.currentLocale ?? "en",
                    docusaurusTag: "",
                  });
                }
              }
            }
          }
        }

        if (pluginName.includes("content-blog")) {
          const blogData = pluginContent as Record<
            string,
            { blogPosts?: Array<{
              metadata?: {
                title?: string;
                source?: string;
                permalink?: string;
              };
            }> }
          >;
          for (const instance of Object.values(blogData)) {
            for (const post of instance.blogPosts ?? []) {
              const meta = post.metadata;
              if (meta?.source && meta?.permalink) {
                collectedDocs.push({
                  title: meta.title ?? "",
                  sourcePath: meta.source.startsWith("@site/")
                    ? path.resolve(context.siteDir, meta.source.slice(6))
                    : meta.source,
                  url: meta.permalink,
                  version: "current",
                  language: context.i18n?.currentLocale ?? "en",
                  docusaurusTag: "",
                });
              }
            }
          }
        }
      }

      console.log(
        `[vector-search] Collected ${collectedDocs.length} docs for indexing`
      );
    },

    async postBuild({ outDir }) {
      const config = (
        context.siteConfig.themeConfig as ThemeConfig & {
          vectorSearch: VectorSearchConfig;
        }
      ).vectorSearch;

      const indexDir = path.join(outDir, config?.indexPath ?? "search-index");
      fs.mkdirSync(indexDir, { recursive: true });

      if (collectedDocs.length === 0) {
        console.warn("[vector-search] No docs collected. Skipping indexing.");
        return;
      }

      console.log(
        `[vector-search] Indexing ${collectedDocs.length} docs (mode: ${config?.mode ?? "hybrid"})...`
      );

      await indexSite({
        outDir,
        docs: collectedDocs,
        indexDir,
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
        batchSize: Joi.number().integer().min(1).default(10),
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
