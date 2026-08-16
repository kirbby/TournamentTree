import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

describe("OpenAPI endpoint", () => {
  it("bundles and serves the canonical OpenAPI 3.1 YAML document", async () => {
    const [canonical, bundled, functionSource, config] = await Promise.all([
      read("docs/openapi.yaml"),
      read("supabase/functions/tournament-api/openapi.yaml"),
      read("supabase/functions/tournament-api/index.ts"),
      read("supabase/config.toml"),
    ]);

    expect(bundled).toBe(canonical);
    expect(canonical).toContain("openapi: 3.1.0");
    expect(canonical).toContain("  /openapi.yaml:");
    expect(functionSource).toContain('Deno.readTextFile(new URL("./openapi.yaml", import.meta.url))');
    expect(functionSource).toContain('parts[0] === "openapi.yaml" && method === "GET"');
    expect(functionSource).toContain('"Content-Type": "application/vnd.oai.openapi;version=3.1"');
    expect(config).toContain('static_files = [ "./functions/tournament-api/openapi.yaml" ]');
  });
});
