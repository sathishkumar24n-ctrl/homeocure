import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const outputDir = join(root, ".output");
const distDir = join(root, "dist");
const publicDir = join(distDir, "public");
const serverDir = join(distDir, "server");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

async function collectAssets(dir) {
  const { readdir } = await import("node:fs/promises");
  const entries = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    const children = await readdir(current, { withFileTypes: true });

    for (const child of children) {
      const filePath = join(current, child.name);

      if (child.isDirectory()) {
        stack.push(filePath);
        continue;
      }

      if (!child.isFile()) {
        continue;
      }

      const urlPath = `/${relative(dir, filePath).replaceAll("\\", "/")}`;
      const data = await readFile(filePath);
      entries.push({
        path: urlPath,
        type: contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
        data: data.toString("base64"),
      });

      if (urlPath.startsWith("/assets/")) {
        entries.push({
          path: urlPath.replace("/assets/", "/app-assets/"),
          type: contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
          data: data.toString("base64"),
        });
      }
    }
  }

  return entries;
}

async function patchWorker(filePath, assets) {
  let source = await readFile(filePath, "utf8");

  if (source.includes("serveEmbeddedPublicAsset")) {
    return;
  }

  const marker = "const cloudflareModule = createHandler({ fetch(cfRequest, env, context, url) {";
  const injection = `const embeddedPublicAssets = new Map(${JSON.stringify(assets)}.map((entry) => [entry.path, entry]));
function serveEmbeddedPublicAsset(pathname) {
  const asset = embeddedPublicAssets.get(pathname);
  if (!asset) {
    return null;
  }
  const binary = atob(asset.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Response(bytes, {
    headers: {
      "content-type": asset.type,
      "cache-control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600"
    }
  });
}

${marker}
  const embeddedAssetResponse = serveEmbeddedPublicAsset(url.pathname);
  if (embeddedAssetResponse) {
    return embeddedAssetResponse;
  }`;

  source = source.replace(marker, injection);
  await writeFile(filePath, source);
}

async function rewriteServerAssetUrls(filePath) {
  const source = await readFile(filePath, "utf8");
  const rewritten = source.replaceAll("/assets/", "/app-assets/");

  if (rewritten !== source) {
    await writeFile(filePath, rewritten);
  }
}

await rm(distDir, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await mkdir(publicDir, { recursive: true });
await cp(join(outputDir, "server"), serverDir, { recursive: true });
await cp(join(outputDir, "public"), publicDir, { recursive: true });
await copyFile(join(serverDir, "index.mjs"), join(serverDir, "index.js"));

const assets = await collectAssets(publicDir);
await rewriteServerAssetUrls(join(serverDir, "index.js"));
await rewriteServerAssetUrls(join(serverDir, "index.mjs"));
await patchWorker(join(serverDir, "index.js"), assets);
await patchWorker(join(serverDir, "index.mjs"), assets);
