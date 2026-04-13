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

/** Strip markdown/MDX formatting to get plain text. */
function mdToPlainText(md: string): string {
  return (
    md
      // Remove import/export statements (MDX)
      .replace(/^import\s+.*$/gm, "")
      .replace(/^export\s+.*$/gm, "")
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]+`/g, "")
      // Remove images
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // Convert links to just text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Remove multiline JSX/HTML tags (opening, self-closing, closing)
      .replace(/<[a-zA-Z/][\s\S]*?>/g, "")
      // Remove JSX expression containers
      .replace(/\{[^{}]*\}/g, "")
      // Remove emphasis markers
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
      // Remove heading markers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove blockquotes
      .replace(/^>\s+/gm, "")
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // Remove list markers
      .replace(/^[\s]*[-*+]\s+/gm, "")
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // Collapse whitespace
      .replace(/\n{2,}/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

function extractFromMarkdown(
  content: string,
  doc: DocMeta,
  contentOpts: { chunkSize: number; chunkOverlap: number }
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const meta = {
    version: doc.version,
    language: doc.language,
    docusaurusTag: doc.docusaurusTag,
  };

  // Split by ## and ### headings
  const sections = content.split(/^(#{2,4}\s+.+)$/m);
  let currentHeading = doc.title;
  let currentText = "";
  let sectionIndex = 0;

  for (const part of sections) {
    const headingMatch = part.match(/^#{2,4}\s+(.+)$/);
    if (headingMatch) {
      // Flush current section
      if (currentText.trim()) {
        const plain = mdToPlainText(currentText);
        if (plain) {
          chunks.push(
            ...splitIntoChunks(
              plain,
              currentHeading,
              doc.title,
              doc.url,
              sectionIndex,
              contentOpts,
              meta
            )
          );
          sectionIndex++;
        }
      }
      currentHeading = headingMatch[1].trim();
      currentText = "";
    } else {
      currentText += part;
    }
  }

  // Flush last section
  if (currentText.trim()) {
    const plain = mdToPlainText(currentText);
    if (plain) {
      chunks.push(
        ...splitIntoChunks(
          plain,
          currentHeading,
          doc.title,
          doc.url,
          sectionIndex,
          contentOpts,
          meta
        )
      );
    }
  }

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
