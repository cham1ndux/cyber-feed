import fs from "fs/promises";
import Parser from "rss-parser";

// load config
const cfg = JSON.parse(await fs.readFile(new URL("./config.json", import.meta.url)));
const FEEDS = cfg.feeds;
const INCLUDES = (cfg.include_keywords || []).map(s => s.toLowerCase());
const EXCLUDES = (cfg.exclude_keywords || []).map(s => s.toLowerCase());
const MAX = cfg.max_items || 150;
const TITLE = cfg.title || "Cybersecurity Feed";

// rss-parser instance
const parser = new Parser({
  timeout: 15000,
  headers: { "user-agent": "cyber-feed/1.0 (+github pages)" }
});

const seen = new Set();
let items = [];

// fetch all feeds in parallel
const results = await Promise.allSettled(FEEDS.map(u => parser.parseURL(u)));

for (const r of results) {
  if (r.status !== "fulfilled") continue;
  const feedTitle = r.value.title || "";
  for (const e of r.value.items || []) {
    const title = (e.title || "").trim();
    const link = (e.link || "").trim();
    if (!title || !link || seen.has(link)) continue;

    const summary = [
      e.contentSnippet, e.content, e.summary, e["content:encoded"]
    ].filter(Boolean).join(" ");

    const haystack = (title + " " + summary).toLowerCase();

    // include filter (if provided)
    if (INCLUDES.length && !INCLUDES.some(k => haystack.includes(k))) continue;
    // exclude filter
    if (EXCLUDES.length && EXCLUDES.some(k => haystack.includes(k))) continue;

    seen.add(link);
    items.push({
      title,
      link,
      source: feedTitle,
      pubDate: e.isoDate || e.pubDate || ""
    });
  }
}

// sort newest first
items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
items = items.slice(0, MAX);

// build HTML body
const itemHtml = items.map(i => {
  const dt = i.pubDate ? new Date(i.pubDate) : new Date();
  const dateStr = dt.toLocaleString("en-GB", { hour12: false, timeZone: cfg.timezone || "UTC" });
  return `<div class="card">
  <div class="src">${i.source || ""} — ${dateStr}</div>
  <a href="${i.link}" target="_blank" rel="noopener"><strong>${escapeHtml(i.title)}</strong></a>
</div>`;
}).join("\n");

// assemble from template
let tpl = await fs.readFile(new URL("./template.html", import.meta.url), "utf8");
tpl = tpl
  .replaceAll("{{TITLE}}", escapeHtml(TITLE))
  .replaceAll("{{UPDATED}}", new Date().toLocaleString("en-GB", { hour12: false, timeZone: cfg.timezone || "UTC" }))
  .replaceAll("{{COUNT}}", String(items.length))
  .replaceAll("{{KEYWORDS}}", INCLUDES.map(k => `<span class="pill">${escapeHtml(k)}</span>`).join(" "))
  .replace("{{ITEMS}}", itemHtml);

// write to dist
await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/index.html", tpl, "utf8");
console.log(`Built ${items.length} items from ${FEEDS.length} feeds`);

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
