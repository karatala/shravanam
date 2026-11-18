import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runAndroidGradle } from "../scripts/android-gradle.js";

const rateLimit = `A problem occurred configuring root project 'android'.
> Could not resolve all artifacts for configuration 'classpath'.
> Could not GET 'https://repo.maven.apache.org/maven2/org/example/library/1/library-1.pom'. Received status code 429 from server: Too Many Requests`;

async function scenario(results) {
  let calls = 0;
  const delays = [];
  const code = await runAndroidGradle({ execute: async () => results[Math.min(calls++, results.length - 1)], pause: async delay => { delays.push(delay); } });
  return { code, calls, delays };
}

test("Android Gradle retries a Maven configuration rate limit with bounded backoff", async () => {
  expect(await scenario([{ code: 1, output: rateLimit }, { code: 0, output: "BUILD SUCCESSFUL" }])).toEqual({ code: 0, calls: 2, delays: [60000] });
  expect(await scenario([{ code: 1, output: rateLimit }])).toEqual({ code: 1, calls: 3, delays: [60000, 120000] });
});

test("Android Gradle preserves compile, test, and other dependency failures without retry", async () => {
  for (const output of ["Compilation failed; OfflineDownloadsTest.java:55: error: cannot find symbol", "> Task :testDebugUnitTest FAILED\nThere were failing tests.", rateLimit.replace("status code 429", "status code 404"), rateLimit.replace("repo.maven.apache.org", "example.com"), `${rateLimit}\n> Task :testDebugUnitTest FAILED`]) {
    expect(await scenario([{ code: 7, output }])).toEqual({ code: 7, calls: 1, delays: [] });
  }
  expect(await scenario([{ code: 0, output: rateLimit }])).toEqual({ code: 0, calls: 1, delays: [] });
  expect(await scenario([{ code: 130, output: rateLimit }])).toEqual({ code: 130, calls: 1, delays: [] });
  expect(await scenario([{ code: 1, output: rateLimit }, { code: 7, output: "Compilation failed" }])).toEqual({ code: 7, calls: 2, delays: [60000] });
});

test("Android CI configures the cache and keeps web and desktop builds paused", async () => {
  const workflow = Bun.YAML.parse(await readFile(".github/workflows/build.yml", "utf8"));
  expect(workflow.jobs.web.if).toBe("${{ false }}");
  expect(workflow.jobs.desktop.if).toBe("${{ false }}");
  const steps = workflow.jobs.android.steps;
  const cache = steps.findIndex(step => step.uses === "gradle/actions/setup-gradle@v5");
  const prepare = steps.findIndex(step => step.run === "bun run prepare:android");
  const build = steps.findIndex(step => step.run === "bun scripts/android-gradle.js");
  expect(cache).toBeGreaterThan(-1);
  expect(prepare).toBeLessThan(cache);
  expect(cache).toBeLessThan(build);
  expect(steps[cache].with["cache-read-only"]).toBe("${{ github.event_name == 'pull_request' }}");
});
