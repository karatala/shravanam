import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compile } from "svelte/compiler";

export async function buildWeb(development = false, directory = development ? "tmp/web" : "dist") {
  const outputDirectory = resolve(directory);
  const result = await Bun.build({
    entrypoints: ["src/main.ts"],
    outdir: outputDirectory,
    target: "browser",
    conditions: ["browser"],
    format: "esm",
    splitting: true,
    minify: !development,
    sourcemap: development ? "linked" : "none",
    naming: "[name]-[hash].[ext]",
    define: { "process.env.NODE_ENV": JSON.stringify(development ? "development" : "production") },
    plugins: [{ name: "svelte", setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
        const source = await readFile(path, "utf8");
        const compiled = compile(source, { filename: path, generate: "client", css: "injected", dev: development });
        for (const warning of compiled.warnings) console.warn(`${path}: ${warning.message}`);
        const sourceMap = development ? `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(compiled.js.map.toString()).toString("base64")}` : "";
        return { contents: compiled.js.code + sourceMap, loader: "js" };
      });
    } }],
  });
  if (!result.success) throw new AggregateError(result.logs, "Cannot build Shravanam. Fix the source errors above and run the command again.");
  const files = result.outputs.filter(output => development || !output.path.endsWith(".map")).map(output => output.path.slice(outputDirectory.length + 1).replaceAll("\\", "/"));
  for await (const filename of new Bun.Glob("**/*").scan({ cwd: "public", onlyFiles: true })) {
    if (filename === "service-worker.js" || filename === "AGENTS.md") continue;
    const destination = resolve(outputDirectory, filename);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve("public", filename), destination);
    files.push(filename.replaceAll("\\", "/"));
  }
  const entry = result.outputs.find(output => output.kind === "entry-point");
  if (!entry) throw new Error("Cannot find the application entry. Check src/main.ts and run the command again.");
  const styles = result.outputs.filter(output => output.path.endsWith(".css")).map(output => `<link rel="stylesheet" href="./${output.path.slice(outputDirectory.length + 1).replaceAll("\\", "/")}">`).join("");
  const html = (await readFile("index.html", "utf8")).replace("<!-- APP_STYLES -->", styles).replace("__APP_ENTRY__", `./${entry.path.slice(outputDirectory.length + 1).replaceAll("\\", "/")}`).replace("__OFFLINE_ENABLED__", JSON.stringify(!development));
  await writeFile(resolve(outputDirectory, "index.html"), html);
  files.push("index.html");
  if (!development) {
    const template = await readFile("public/service-worker.js", "utf8");
    const revision = createHash("sha256").update(template);
    for (const filename of files.sort()) revision.update(filename).update("\0").update(await readFile(resolve(outputDirectory, filename)));
    await writeFile(resolve(outputDirectory, "service-worker.js"), template.replace("__SHRAVANAM_REVISION__", revision.digest("hex")).replace('["__SHRAVANAM_FILES__"]', JSON.stringify(files)));
  }
  // Only the current output belongs to a native bundle, even when old hashed files remain on disk.
  await writeFile(resolve(outputDirectory, "asset-list.json"), JSON.stringify(files));
  return outputDirectory;
}

if (import.meta.main) await buildWeb();
