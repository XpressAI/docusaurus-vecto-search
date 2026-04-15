import fs from "fs";
import path from "path";
import { BM25Index } from "./bm25-build";
import type {
  VectorSearchConfig,
  DocumentChunk,
  DocumentMeta,
} from "../types";

interface IndexSiteParams {
  outDir: string;
  docs: DocMeta[];
  indexDir: string;
  config: VectorSearchConfig;
}

export interface DocMeta {
  title: string;
  sourcePath: string;
  url: string;
  version: string;
  language: string;
  docusaurusTag: string;
}

export async function indexSite({
  outDir,
  docs,
  indexDir,
  config,
}: IndexSiteParams): Promise<void> {
  fs.mkdirSync(indexDir, { recursive: true });

  const mode = config.mode ?? "hybrid";
  const contentOpts = {
    chunkSize: config.content?.chunkSize ?? 500,
    chunkOverlap: config.content?.chunkOverlap ?? 50,
    splitOnHeadings: config.content?.splitOnHeadings ?? ([2, 4] as [number, number]),
  };

  // ── Extract content from source markdown ──
  const documents: DocumentChunk[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (!doc.sourcePath || !fs.existsSync(doc.sourcePath)) continue;

    const raw = fs.readFileSync(doc.sourcePath, "utf-8");
    const content = stripFrontmatter(raw);
    const extracted = extractFromMarkdown(content, doc, contentOpts);
    documents.push(...extracted);

    if ((i + 1) % 10 === 0 || i === docs.length - 1) {
      console.log(
        `[vector-search] Processed ${i + 1}/${docs.length} docs (${documents.length} chunks)`
      );
    }
  }

  console.log(
    `[vector-search] Extracted ${documents.length} chunks from ${docs.length} docs`
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
    const { ingestToVecto } = await import("./vecto-ingest");
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

function stripFrontmatter(content: string): string {
  if (content.startsWith("---")) {
    const end = content.indexOf("---", 3);
    if (end !== -1) return content.slice(end + 3).trim();
  }
  return content;
}

/**
 * Convert MDX source to plain markdown by removing MDX/JSX-only constructs
 * (imports, JSX tags, expression braces) while preserving heading, emphasis,
 * list, blockquote, and code structure. The result is suitable for both
 * retrieval (BM25 strips punctuation at tokenization; embeddings handle
 * markdown fine) and downstream LLM context.
 */
function mdxToMarkdown(md: string): string {
  return (
    md
      .replace(/^import\s+.*$/gm, "")
      .replace(/^export\s+.*$/gm, "")
      .replace(/<[a-zA-Z/][\s\S]*?>/g, "")
      .replace(/\{[^{}]*\}/g, "")
      .replace(/^[-*_]{3,}\s*$/gm, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function extractFromMarkdown(
  content: string,
  doc: DocMeta,
  contentOpts: {
    chunkSize: number;
    chunkOverlap: number;
    splitOnHeadings: [number, number];
  }
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const meta = {
    version: doc.version,
    language: doc.language,
    docusaurusTag: doc.docusaurusTag,
  };

  const [minLvl, maxLvl] = contentOpts.splitOnHeadings;
  const sectionRegex = new RegExp(
    `^(#{${minLvl},${maxLvl}}\\s+.+)$`,
    "m"
  );
  const headingRegex = new RegExp(`^(#{${minLvl},${maxLvl}})\\s+(.+)$`);
  const sections = content.split(sectionRegex);

  const ancestors: Array<{ level: number; line: string }> = [
    { level: 1, line: `# ${doc.title}` },
  ];
  let currentHeading = doc.title;
  let currentBody = "";
  let sectionIndex = 0;

  const flush = () => {
    if (!currentBody.trim()) return;
    const breadcrumb = ancestors.map((a) => a.line).join("\n");
    const text = mdxToMarkdown(`${breadcrumb}\n\n${currentBody}`);
    if (!text) return;
    chunks.push(
      ...splitIntoChunks(
        text,
        currentHeading,
        doc.title,
        doc.url,
        sectionIndex,
        contentOpts,
        meta
      )
    );
    sectionIndex++;
  };

  for (const part of sections) {
    const headingMatch = part.match(headingRegex);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      while (
        ancestors.length &&
        ancestors[ancestors.length - 1].level >= level
      ) {
        ancestors.pop();
      }
      ancestors.push({ level, line: part.trim() });
      currentHeading = headingText;
      currentBody = "";
    } else {
      currentBody += part;
    }
  }
  flush();

  return chunks;
}

function splitIntoChunks(
  text: string,
  heading: string,
  pageTitle: string,
  url: string,
  sectionIndex: number,
  contentOpts: { chunkSize: number; chunkOverlap: number },
  meta: { version: string; language: string; docusaurusTag: string }
): DocumentChunk[] {
  const { chunkSize, chunkOverlap } = contentOpts;
  const words = text.split(/\s+/);
  const chunks: DocumentChunk[] = [];

  const makeChunk = (chunkText: string, partIndex: number): DocumentChunk => ({
    id: `${url}#${sectionIndex}-${partIndex}`,
    url,
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
