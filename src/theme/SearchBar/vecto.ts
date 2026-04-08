import type { SearchResult, VectoLookupResult, VectoAttributes } from "../../types";

const VECTO_API_BASE = "https://api.vecto.ai";

export class VectoSearch {
  private token: string;
  private vectorSpaceId: number;

  constructor({
    publicToken,
    vectorSpaceId,
  }: {
    publicToken: string;
    vectorSpaceId: number;
  }) {
    this.token = publicToken;
    this.vectorSpaceId = vectorSpaceId;
  }

  async lookup(query: string, topK = 10): Promise<SearchResult[]> {
    if (!this.token || !this.vectorSpaceId) {
      console.warn(
        "[vector-search] Vecto not configured, skipping vector search"
      );
      return [];
    }

    try {
      const formData = new FormData();
      formData.append("modality", "TEXT");
      formData.append("top_k", String(topK));
      formData.append("query", new Blob([query], { type: "text/plain" }));

      const res = await fetch(
        `${VECTO_API_BASE}/api/v0/space/${this.vectorSpaceId}/lookup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
          body: formData,
        }
      );

      if (!res.ok) {
        throw new Error(
          `Vecto lookup failed: ${res.status} ${res.statusText}`
        );
      }

      const data: VectoLookupResult[] | { results: VectoLookupResult[] } =
        await res.json();

      const results: VectoLookupResult[] = Array.isArray(data)
        ? data
        : data.results ?? [];

      return results.map((r) => {
        let attrs: Partial<VectoAttributes> = {};
        try {
          attrs =
            typeof r.attributes === "string"
              ? (JSON.parse(r.attributes) as Partial<VectoAttributes>)
              : (r.attributes as Partial<VectoAttributes>) ?? {};
        } catch {
          attrs = {};
        }

        return {
          id: attrs.id ?? String(r.id),
          score: r.similarity ?? 0,
          url: attrs.url ?? "",
          title: attrs.title ?? "",
          heading: attrs.heading ?? "",
          version: attrs.version ?? "",
          language: attrs.language ?? "",
          snippet: attrs.snippet ?? "",
        };
      });
    } catch (err) {
      console.error("[vector-search] Vecto lookup error:", err);
      return [];
    }
  }
}
