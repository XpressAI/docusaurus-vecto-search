import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { BM25Index } from "./bm25-build";
import { ingestToVecto } from "./vecto-ingest";
import type {
  VectorSearchConfig,
  DocumentChunk,
  DocumentMeta,
} from "../types";

interface IndexSiteParams {
  outDir: string;
  routesPaths: string[];
  indexDir: string;
  plugins: unknown[];
  config: VectorSearchConfig;
}

export async function indexSite({
  outDir,
  routesPaths,
  indexDir,
  config,
}: IndexSiteParams): Promise<void> {
  fs.mkdirSync(indexDir, { recursive: true });

  const mode = config.mode ?? "hybrid";
  const contentOpts = {
    chunkSize: config.content?.chunkSize ?? 500,
    chunkOverlap: config.content?.chunkOverlap ?? 50,
  };

  // ── Extract content ──
  const documents: DocumentChunk[] = [];

  for (const routePath of routesPaths) {
    const htmlPath = resolveHtmlPath(outDir, routePath);
    if (!htmlPath) continue;

    const html = fs.readFileSync(htmlPath, "utf-8");
    const extracted = extractContent(html, routePath, contentOpts);
    if (extracted) {
      documents.push(...extracted);
    }
  }

  console.log(
    `[vector-search] Extracted ${documents.length} chunks from ${routesPaths.length} pages`
  );

  if (documents.length === 0) {
    console.warn("[vector-search] No content extracted. Skipping.");
    return;
  }

  // ── Build BM25 index ──
  if (mode === "bm25" || mode === "hybrid") {
    const bm25 = new BM25Index(config.bm25);
    for (const doc of documents) {
      bm25.addDocument(doc.id, doc.text, doc.title);
    }
    bm25.computeIDF();

    fs.writeFileSync(
      path.join(indexDir, "bm25-index.json"),
      JSON.stringify(bm25.serialize())
    );
    console.log("[vector-search] BM25 index built");
  }

  // ── Ingest into Vecto ──
  if (mode === "vector" || mode === "hybrid") {
    await ingestToVecto(documents, config);
  }

  // ── Write document metadata ──
  const metadata: DocumentMeta[] = documents.map((doc) => ({
    id: doc.id,
    url: doc.url,
    title: doc.title,
    heading: doc.heading,
    version: doc.version,
    language: doc.language,
    snippet: doc.text.slice(0, 200),
  }));

  fs.writeFileSync(
    path.join(indexDir, "documents.json"),
    JSON.stringify(metadata)
  );
}

// ── Helpers ──────────────────────────────────────────────

function resolveHtmlPath(outDir: string, routePath: string): string | null {
  const clean = routePath.replace(/\/$/, "") || "/";
  const candidates = [
    path.join(outDir, clean, "index.html"),
    path.join(outDir, `${clean}.html`),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function extractContent(
  html: string,
  routePath: string,
  contentOpts: { chunkSize: number; chunkOverlap: number }
): DocumentChunk[] | null {
  const $ = cheerio.load(html);

  // Read Docusaurus-injected metadata (same tags Algolia's crawler reads)
  const version =
    $('meta[name="docsearch:version"]').attr("content") ?? "current";
  const language =
    $('meta[name="docsearch:language"]').attr("content") ??
    $("html").attr("lang") ??
    "en";
  const docusaurusTag =
    $('meta[name="docsearch:docusaurus_tag"]').attr("content") ?? "";

  const title =
    $("article h1").first().text() ||
    $("header h1").first().text() ||
    $("title").text() ||
    routePath;

  const article = $("article").first();
  if (!article.length) return null;

  const clone = article.clone();
  clone
    .find(
      "nav, .table-of-contents, footer, .theme-doc-footer, .pagination-nav"
    )
    .remove();

  const chunks: DocumentChunk[] = [];
  let currentHeading = title;
  let currentText = "";
  let sectionIndex = 0;

  const meta = { version, language, docusaurusTag };

  clone.children().each((_, el) => {
    const tag = $(el).prop("tagName") as string | undefined;
    const text = $(el).text().trim();
    if (!text) return;

    if (tag && /^H[2-4]$/.test(tag)) {
      if (currentText.length > 0) {
        chunks.push(
          ...splitIntoChunks(
            currentText,
            currentHeading,
            title,
            routePath,
            sectionIndex,
            contentOpts,
            meta
          )
        );
        sectionIndex++;
      }
      currentHeading = text;
      currentText = "";
    } else {
      currentText += (currentText ? " " : "") + text;
    }
  });

  if (currentText.length > 0) {
    chunks.push(
      ...splitIntoChunks(
        currentText,
        currentHeading,
        title,
        routePath,
        sectionIndex,
        contentOpts,
        meta
      )
    );
  }

  return chunks.length > 0 ? chunks : null;
}

function splitIntoChunks(
  text: string,
  heading: string,
  pageTitle: string,
  routePath: string,
  sectionIndex: number,
  contentOpts: { chunkSize: number; chunkOverlap: number },
  meta: { version: string; language: string; docusaurusTag: string }
): DocumentChunk[] {
  const { chunkSize, chunkOverlap } = contentOpts;
  const words = text.split(/\s+/);
  const chunks: DocumentChunk[] = [];

  const makeChunk = (chunkText: string, partIndex: number): DocumentChunk => ({
    id: `${routePath}#${sectionIndex}-${partIndex}`,
    url: routePath,
    title: pageTitle,
    heading,
    text: chunkText,
    version: meta.version,
    language: meta.language,
    docusaurusTag: meta.docusaurusTag,
  });

  if (words.length <= chunkSize) {
    chunks.push(makeChunk(text, 0));
    return chunks;
  }

  let start = 0;
  let partIndex = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(makeChunk(words.slice(start, end).join(" "), partIndex));
    start = end - chunkOverlap;
    if (start >= words.length) break;
    partIndex++;
  }

  return chunks;
}
