#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { indexSite } from "./indexer";
import type { DocMeta } from "./indexer";
import type { VectorSearchConfig } from "../types";

// Accept explicit path or auto-discover from build/search-index/
let paramsFile = process.argv[2];
if (!paramsFile) {
  const candidates = [
    path.resolve("build/search-index/.indexer-params.json"),
    path.resolve("build/.indexer-params.json"),
  ];
  paramsFile = candidates.find((p) => fs.existsSync(p)) ?? "";
}

if (!paramsFile || !fs.existsSync(paramsFile)) {
  console.error(
    "[vector-search] No params file found. Run `docusaurus build` first."
  );
  process.exit(1);
}

console.log(`[vector-search] Reading params from ${paramsFile}`);

const params: {
  outDir: string;
  docs: DocMeta[];
  indexDir: string;
  config: VectorSearchConfig;
} = JSON.parse(fs.readFileSync(paramsFile, "utf-8"));

indexSite({
  outDir: params.outDir,
  docs: params.docs,
  indexDir: params.indexDir,
  config: params.config,
})
  .then(() => {
    try { fs.unlinkSync(paramsFile); } catch { /* ignore */ }
    console.log("[vector-search] Indexing complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[vector-search] Indexer error:", err);
    process.exit(1);
  });
