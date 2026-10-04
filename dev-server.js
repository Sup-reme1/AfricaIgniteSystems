#!/usr/bin/env node
// Static dev server + screenshot tool for the Africa Ignite Systems portal.
//
//   node dev-server.js
//       Serve the project at http://127.0.0.1:4173 (PORT env var overrides).
//
//   node dev-server.js screenshot <page.html> [out.png] [--width=1440] [--height=900] [--viewport] [--click=<selector>]
//       Render a page in headless Edge/Chrome and save a PNG.
//       Defaults: out = screenshots/<page>-<width>.png, full-page capture.
//       --viewport captures only the visible window instead of the full page.
//       --click clicks an element before capturing (repeatable), e.g. --click=[data-sidebar-open]
//       Runs its own server on a free port, so the dev server need not be running.
//       Set BROWSER_PATH to point at a specific Chrome/Edge executable.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 4173;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function createServer() {
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    if (pathname.endsWith("/")) pathname += "index.html";

    const filePath = path.join(ROOT, pathname);
    if (!filePath.startsWith(ROOT + path.sep) || filePath.includes(`${path.sep}node_modules${path.sep}`)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end(`Not found: ${pathname}`);
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => resolve(server.address().port));
  });
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function parseScreenshotArgs(args) {
  const options = { width: 1440, height: 900, fullPage: true, clicks: [] };
  const positional = [];
  for (const arg of args) {
    const [flag, ...rest] = arg.split("=");
    const value = rest.join("=");
    if (flag === "--width") options.width = Number(value);
    else if (flag === "--height") options.height = Number(value);
    else if (flag === "--viewport") options.fullPage = false;
    else if (flag === "--click") options.clicks.push(value);
    else positional.push(arg);
  }
  options.page = positional[0];
  options.out =
    positional[1] ||
    path.join("screenshots", `${path.basename(options.page || "", ".html")}-${options.width}.png`);
  return options;
}

async function screenshot(args) {
  const options = parseScreenshotArgs(args);
  if (!options.page) {
    console.error(
      "Usage: node dev-server.js screenshot <page.html> [out.png] [--width=1440] [--height=900] [--viewport] [--click=<selector>]"
    );
    process.exit(1);
  }

  let puppeteer;
  try {
    puppeteer = require("puppeteer-core");
  } catch {
    console.error("puppeteer-core is not installed. Run: npm install");
    process.exit(1);
  }

  const executablePath = findBrowser();
  if (!executablePath) {
    console.error("No Chrome or Edge found. Set BROWSER_PATH to a Chromium-based browser executable.");
    process.exit(1);
  }

  const server = createServer();
  const port = await listen(server, 0);
  const url = `http://${HOST}:${port}/${options.page.replace(/\\/g, "/").replace(/^\//, "")}`;
  const problems = [];

  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width: options.width, height: options.height });
    tab.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    tab.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    tab.on("requestfailed", (request) => problems.push(`request failed: ${request.url()}`));
    tab.on("response", (response) => {
      if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    const response = await tab.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    if (!response || !response.ok()) throw new Error(`Could not load ${url} (${response && response.status()})`);

    // Wait for layout partials, web fonts, and Tailwind's CDN pass over the injected markup.
    await tab.evaluate(() => (window.AIS && window.AIS.layoutReady) || null);
    await tab.evaluate(() => document.fonts.ready);
    await new Promise((resolve) => setTimeout(resolve, 500));

    for (const selector of options.clicks) {
      await tab.click(selector);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    // Grow the viewport to the page height so fixed elements (sidebar, header)
    // render as they would in a tall window instead of only at the top.
    if (options.fullPage) {
      const pageHeight = await tab.evaluate(() => document.documentElement.scrollHeight);
      await tab.setViewport({ width: options.width, height: Math.max(options.height, pageHeight) });
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    await tab.screenshot({ path: options.out });
    console.log(`Saved ${options.out} (${options.width}px, ${options.fullPage ? "full page" : "viewport"})`);
  } finally {
    await browser.close();
    server.close();
  }

  if (problems.length) {
    console.warn(`\n${problems.length} problem(s) while rendering:`);
    problems.forEach((problem) => console.warn(`  - ${problem}`));
    process.exitCode = 1;
  }
}

async function serve() {
  const port = await listen(createServer(), PORT);
  console.log(`Africa Ignite Systems dev server running at http://${HOST}:${port}`);
}

const [command, ...rest] = process.argv.slice(2);
(command === "screenshot" ? screenshot(rest) : serve()).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
