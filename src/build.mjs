import fs from "fs/promises";
import Parser from "rss-parser";

// load config
const cfg = JSON.parse(await fs.readFile(new URL("./config.json", import.meta.url)));
const FEEDS = cfg.feeds;
const INCLUDES = (cfg.include_keywords || []).map(s => s.toLowerCase());
const EXCLUDES = (cfg.exclude_keywords || []).map(s => s.toLowerCase());
const MAX = cfg.max_items || 150;
const TITLE = cfg.title || "Cybersecurity Feed";
const TZ = cfg.timezone || "UTC";

// rss-parser
const parser = new Parser({
  timeout: 15000,
  headers: { "user-agent": "cyber-feed/1.0 (+github pages)" }
});

const seen = new Set();
let items = [];

// fetch all feeds
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
    if (INCLUDES.length && !INCLUDES.some(k => haystack.includes(k))) continue;
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

// sort newest first and clip
items.sort((a,b)=> new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
items = items.slice(0, MAX);

// build card html (title plain + "Click here" link)
const itemHtml = items.map(i => {
  const dt = i.pubDate ? new Date(i.pubDate) : new Date();
  const dateStr = dt.toLocaleString("en-GB", { hour12: false, timeZone: TZ });
  return `<div class="card" data-source="${escapeHtml(i.source || "")}" data-date="${escapeAttr(i.pubDate || "")}" data-link="${escapeAttr(i.link)}">
  <div class="meta">${escapeHtml(i.source || "")} — ${escapeHtml(dateStr)}</div>
  <h2 class="title">${escapeHtml(i.title)} <a href="${escapeAttr(i.link)}" target="_blank" rel="noopener" class="click-here">Click here</a></h2>
</div>`;
}).join("\n");

// assemble from template
let tpl = await fs.readFile(new URL("./template.html", import.meta.url), "utf8");
tpl = tpl
  .replaceAll("{{TITLE}}", escapeHtml(TITLE))
  .replaceAll("{{UPDATED}}", new Date().toLocaleString("en-GB", { hour12: false, timeZone: TZ }))
  .replaceAll("{{COUNT}}", String(items.length))
  .replace("{{ITEMS}}", itemHtml)
  .replace("{{KEYWORDS}}", (cfg.include_keywords || [])
    .map(k => `<span class="pill">${escapeHtml(k)}</span>`).join(" "));

// write to dist
await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/index.html", tpl, "utf8");
console.log(`Built ${items.length} items from ${FEEDS.length} feeds`);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  // safe for attributes; reuse same escaping
  return escapeHtml(s);
}
