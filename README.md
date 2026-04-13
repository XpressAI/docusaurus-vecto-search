<p align="center">
<a href="https://www.vecto.ai/">
<img src="https://user-images.githubusercontent.com/68586800/192857099-499146bb-5570-4702-a88f-bb4582e940c0.png" width="300"/>
</a>
</p>
<p align="center">
  <a href="https://docs.vecto.ai/">Docs</a> •
  <a href="https://www.xpress.ai/blog/">Blog</a> •
  <a href="https://discord.com/invite/wtYbXvPPfD">Discord</a> •
  <a href="https://github.com/XpressAI/vecto-tutorials">Tutorials</a>
</p>

<br>

# @xpressai/docusaurus-vecto-search

A drop-in search plugin for [Docusaurus v2/v3](https://docusaurus.io/) that combines **keyword search** (BM25) with **AI-powered vector search** ([Vecto.ai](https://www.vecto.ai/)) — or use either one on its own.

<p align="center">
<img src="https://docs.vecto.ai/img/docs/integrations/docusaurus-vecto-search.png" width="80%"/>
</p>

## Why this plugin?

| | Keyword only (BM25) | Vector only (Vecto) | **Hybrid** (default) |
|---|---|---|---|
| Matches exact terms | Yes | No | Yes |
| Understands meaning / synonyms | No | Yes | Yes |
| Needs a Vecto account | No | Yes | Yes |
| Needs a server | No | No | No |

**Hybrid mode** merges both result sets with [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf), giving you the best of both worlds — exact keyword hits *and* semantic understanding — with zero backend infrastructure.

## Quick Start

### 1. Install

```bash
npm install @xpressai/docusaurus-vecto-search
# or
yarn add @xpressai/docusaurus-vecto-search
```

### 2. Add to your Docusaurus config

**BM25 only** — no account needed, works out of the box:

```js
// docusaurus.config.js
module.exports = {
  themes: ['@xpressai/docusaurus-vecto-search'],

  themeConfig: {
    vectorSearch: {
      mode: 'bm25',
    },
  },
};
```

**Hybrid** (BM25 + Vecto) — requires a [Vecto](https://www.vecto.ai/) account:

```js
// docusaurus.config.js
module.exports = {
  themes: ['@xpressai/docusaurus-vecto-search'],

  themeConfig: {
    vectorSearch: {
      mode: 'hybrid',  // or 'vector' for vector-only

      vecto: {
        publicToken: process.env.VECTO_PUBLIC_TOKEN ?? '',
        vectorSpaceId: 123,
      },
    },
  },
};
```

### 3. Build your site

```bash
# BM25-only — just build normally
npm run build

# Hybrid / Vector — provide your Vecto USAGE token at build time
VECTO_USER_TOKEN=your_token_here npm run build
```

The plugin indexes your content during `docusaurus build` via the `postBuild` hook. No separate indexing step needed.

### 4. Deploy

Deploy your `build/` folder as usual. No server, no API proxy — everything runs in the browser.

## How It Works

```
Build time (Node)                       Runtime (Browser)
─────────────────                       ──────────────────

docusaurus build                        User types query
       │                                        │
   postBuild hook                        useSearchEngine()
       │                                        │
  Extract HTML from build/              ┌───────┴────────┐
  Read <meta docsearch:*> tags          │                │
  Chunk content by headings             │  BM25          │  Vecto
  Tag with version + locale             │  (JSON index)  │  (REST API)
       │                                │                │
  ┌────┴──────┐                         └───────┬────────┘
  │           │                                 │
 BM25 JSON   Vecto ingest              Reciprocal Rank Fusion
 (static)    (USAGE token)             Filter by version/locale
                                                │
                                           Ranked results
```

**At build time**, the plugin reads every rendered HTML page, extracts content split by headings, and:
- Builds a **BM25 JSON index** (written to `build/search-index/`)
- Ingests chunks into **Vecto** with metadata (version, locale, URL)

**At runtime**, the SearchBar component loads the BM25 index and/or calls the Vecto API directly from the browser using a read-only PUBLIC token. In hybrid mode, results are merged using Reciprocal Rank Fusion (RRF).

## Configuration Reference

All configuration lives in `themeConfig.vectorSearch`. Every option has sensible defaults — you only need to set what you want to change.

### Top-level options

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'bm25' \| 'vector' \| 'hybrid'` | `'hybrid'` | Search mode |
| `maxResults` | `number` | `10` | Max results returned per search |
| `hotkey` | `string` | `'mod+k'` | Keyboard shortcut to focus search |
| `placeholder` | `string` | `'Search docs...'` | Input placeholder text |
| `indexPath` | `string` | `'search-index'` | Output directory for the BM25 index (relative to build/) |

### `vecto` — Vecto.ai connection

| Option | Type | Default | Description |
|---|---|---|---|
| `publicToken` | `string` | `''` | PUBLIC token (read-only, safe to expose in client bundle) |
| `vectorSpaceId` | `number \| null` | `null` | Your Vecto vector space ID |
| `clearOnBuild` | `boolean` | `true` | Clear the vector space before re-indexing |
| `batchSize` | `number` | `10` | Documents per ingest batch. Increase for faster models (CLIP, OPENAI_V3_SMALL); decrease if you hit gateway timeouts on slower models like QWEN2. |

### `bm25` — BM25 tuning

| Option | Type | Default | Description |
|---|---|---|---|
| `k1` | `number` | `1.5` | Term frequency saturation |
| `b` | `number` | `0.75` | Document length normalization |

### `rrf` — Reciprocal Rank Fusion

| Option | Type | Default | Description |
|---|---|---|---|
| `k` | `number` | `60` | RRF constant (higher = less weight to top ranks) |

### `weights` — Weighted score fusion (alternative to RRF)

Set this to use weighted score normalization instead of RRF:

```js
weights: { vector: 0.7, bm25: 0.3 }
```

### `content` — Chunking

| Option | Type | Default | Description |
|---|---|---|---|
| `chunkSize` | `number` | `500` | Max words per chunk |
| `chunkOverlap` | `number` | `50` | Overlap between consecutive chunks |

## Token Security

This plugin uses **two separate tokens** with different permissions:

| Token | Where it lives | Permissions | Exposed to users? |
|---|---|---|---|
| `VECTO_USER_TOKEN` | Environment variable (CI secrets) | **USAGE** — read + write | **No** — build-time only |
| `vecto.publicToken` | `themeConfig` (in JS bundle) | **PUBLIC** — read only | **Yes** — safe to expose |

The USAGE token is only used during `docusaurus build` to ingest content into Vecto. It is **never** included in the client bundle.

The PUBLIC token is used at runtime in the browser to perform lookups. It only allows read access.

### Setting up in CI (GitHub Actions)

```yaml
- name: Build
  env:
    VECTO_USER_TOKEN: ${{ secrets.VECTO_USER_TOKEN }}
  run: npm run build
```

### Setting up locally

```bash
export VECTO_USER_TOKEN=your_token_here
npm run build
```

Or create a `.env` file in your project root:

```
VECTO_USER_TOKEN=your_token_here
```

## Version-Aware Search

The plugin is fully version-aware when used with [Docusaurus versioned docs](https://docusaurus.io/docs/versioning) or i18n. It reads the same `<meta>` tags that Docusaurus injects for Algolia:

```html
<meta name="docsearch:version" content="2.0" />
<meta name="docsearch:language" content="en" />
<meta name="docsearch:docusaurus_tag" content="docs-default-2.0" />
```

At query time, results are automatically filtered to match the user's current version and locale using `useContextualSearchFilters()` from `@docusaurus/theme-common`.

## Customizing Styles

The plugin ships with default styles supporting both light and dark mode. All CSS classes use the `vs-` prefix so they won't conflict with your theme.

To override styles, add a custom stylesheet targeting these classes:

| Class | Element |
|---|---|
| `.vs-search-container` | Outer wrapper |
| `.vs-search-input-wrapper` | Input container |
| `.vs-search-input` | The `<input>` element |
| `.vs-search-dropdown` | Results dropdown panel |
| `.vs-search-loading` | "Searching..." message |
| `.vs-search-empty` | "No results" message |
| `.vs-search-result` | Individual result item |
| `.vs-search-result--active` | Keyboard-selected / hovered result |
| `.vs-search-result-title` | Result page title |
| `.vs-search-result-heading` | Section heading within the page |
| `.vs-search-result-version` | Version badge |
| `.vs-search-result-snippet` | Content preview |

## Local Plugin Development

1. Clone and install:
   ```bash
   git clone https://github.com/XpressAI/docusaurus-vecto-search
   cd docusaurus-vecto-search
   yarn install
   ```

2. Build the plugin:
   ```bash
   yarn build
   ```

3. Link it into your Docusaurus project:
   ```bash
   yarn link                                    # in plugin directory
   cd /path/to/your-docusaurus-site
   yarn link @xpressai/docusaurus-vecto-search    # in site directory
   ```

4. For development with auto-rebuild:
   ```bash
   yarn start    # watches both server and client files
   ```

## File Structure

```
src/
├── index.ts                  # Plugin entry — getThemePath(), postBuild(), validateThemeConfig()
├── types.ts                  # Shared TypeScript types
├── server/                   # Node.js — runs at build time only
│   ├── indexer.ts            # HTML extraction, heading chunking, metadata tagging
│   ├── bm25-build.ts        # BM25 index builder (outputs JSON)
│   └── vecto-ingest.ts      # Vecto batch ingestion via IndexApi
└── theme/SearchBar/          # Browser — bundled by Docusaurus webpack
    ├── index.tsx             # React SearchBar component
    ├── styles.css            # Light/dark mode styles
    ├── useSearchEngine.ts    # Search hook (init, query, filter, fuse)
    ├── bm25.ts               # Client-side BM25 engine
    ├── vecto.ts              # Client-side Vecto lookup
    └── hybrid.ts             # RRF + weighted score fusion
```

## Live Examples

- [Vecto Docs](https://docs.vecto.ai/)
- [Xircuits.io](https://xircuits.io/)

## License

MIT
