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

const parser = new Parser({ timeout: 15000, headers: { "user-agent": "cyber-feed/2.0 (+github pages)" } });

const seen = new Set();
let items = [];

/* ---------- helpers ---------- */
function findCVE(text) {
  const m = text.match(/\bCVE-\d{4}-\d{4,7}\b/i);
  return m ? m[0].toUpperCase() : "";
}
function scoreSeverity(text) {
  const t = text.toLowerCase();
  if (/\b(0-day|zero-day|actively exploited|in the wild|kev)\b/.test(t)) return "critical";
  if (/\b(ransomware|rce|remote code execution|auth bypass|unauthenticated)\b/.test(t)) return "high";
  if (/\b(lpe|privilege escalation|sql injection|ssrf|xss|deserialization)\b/.test(t)) return "medium";
  return "";
}

/* ---------- fetch ---------- */
const results = await Promise.allSettled(FEEDS.map(u => parser.parseURL(u)));
for (const r of results) {
  if (r.status !== "fulfilled") continue;
  const feedTitle = r.value.title || "";
  for (const e of r.value.items || []) {
    const title = (e.title || "").trim();
    const link = (e.link || "").trim();
    if (!title || !link || seen.has(link)) continue;

    const raw = [e.contentSnippet, e.content, e.summary, e["content:encoded"]].filter(Boolean).join(" ");
    const haystack = (title + " " + raw).toLowerCase();
    if (INCLUDES.length && !INCLUDES.some(k => haystack.includes(k))) continue;
    if (EXCLUDES.length && EXCLUDES.some(k => haystack.includes(k))) continue;

    const cve = findCVE(title + " " + raw);
    const sev = scoreSeverity(title + " " + raw);

    seen.add(link);
    items.push({
      title,
      link,
      source: feedTitle,
      pubDate: e.isoDate || e.pubDate || "",
      cve,
      sev,
      summary: strip(raw).slice(0, 180) + (raw ? "…" : "")
    });
  }
}

/* ---------- sort & clip ---------- */
items.sort((a,b)=> new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
items = items.slice(0, MAX);

/* ---------- render ---------- */
const itemHtml = items.map(i => {
  const dt = i.pubDate ? new Date(i.pubDate) : new Date();
  const dateStr = dt.toLocaleString("en-GB", { hour12: false, timeZone: TZ });
  const badges = [
    i.cve ? `<span class="badge badge-cve">${escapeHtml(i.cve)}</span>` : "",
    i.sev ? `<span class="badge badge-${i.sev}">${cap(i.sev)}</span>` : ""
  ].join(" ");
  return `<div class="card${i.sev ? ` sev-${i.sev}` : ""}" data-source="${escapeAttr(i.source || "")}" data-date="${escapeAttr(i.pubDate || "")}" data-link="${escapeAttr(i.link)}" tabindex="0" role="link" aria-label="${escapeAttr(i.title)}">
  <div class="meta">
    ${escapeHtml(i.source || "")} — ${escapeHtml(dateStr)}
  </div>
  <h2 class="title">
    ${escapeHtml(i.title)}
    <span class="badges">${badges}</span>
    <a href="${escapeAttr(i.link)}" target="_blank" rel="noopener" class="click-here">Click here</a>
  </h2>
</div>`;
}).join("\n");

let tpl = await fs.readFile(new URL("./template.html", import.meta.url), "utf8");
tpl = tpl
  .replaceAll("{{TITLE}}", escapeHtml(TITLE))
  .replaceAll("{{UPDATED}}", new Date().toLocaleString("en-GB", { hour12: false, timeZone: TZ }))
  .replaceAll("{{COUNT}}", String(items.length))
  .replace("{{ITEMS}}", itemHtml)
  .replace("{{KEYWORDS}}", (cfg.include_keywords || []).map(k => `<span class="pill">${escapeHtml(k)}</span>`).join(" "));

await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/index.html", tpl, "utf8");
console.log(`Built ${items.length} items from ${FEEDS.length} feeds`);

function strip(s){ return String(s).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim(); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function escapeAttr(s){ return escapeHtml(s); }
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
