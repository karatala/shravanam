import { resolve } from "node:path";

async function forward(stream, target) {
  const decoder = new TextDecoder();
  let tail = "";
  for await (const chunk of stream) {
    target.write(chunk);
    tail = (tail + decoder.decode(chunk, { stream: true })).slice(-128 * 1024);
  }
  return tail + decoder.decode();
}

async function executeGradle() {
  const child = Bun.spawn(["bash", "./gradlew", "--no-daemon", "--max-workers=2", "--console=plain", ":shravanam-player:testDebugUnitTest", "assembleDebug"], {
    cwd: resolve("android"), stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([child.exited, forward(child.stdout, process.stdout), forward(child.stderr, process.stderr)]);
  return { code, output: `${stdout}\n${stderr}` };
}

function rateLimitedConfiguration(output) {
  return /A problem occurred configuring (?:root project|project)\b/.test(output)
    && /Could not (?:GET|HEAD) 'https:\/\/(?:repo\.maven\.apache\.org|repo1\.maven\.org)\/[^'\r\n]+'\.\s+Received status code 429\b/.test(output)
    && !/^\s*>\s*Task\b/m.test(output);
}

export async function runAndroidGradle({ execute = executeGradle, pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) } = {}) {
  let attempt = 1;
  for (;;) {
    const result = await execute();
    if (result.code === 0 || result.code >= 128 || attempt >= 3 || !rateLimitedConfiguration(result.output)) return result.code;
    const delay = attempt++ * 60000;
    console.warn(`Maven Central returned HTTP 429 during Gradle configuration. Waiting ${delay / 1000}s before attempt ${attempt}/3; downloaded dependencies stay cached.`);
    await pause(delay);
  }
}

if (import.meta.main) process.exitCode = await runAndroidGradle();
