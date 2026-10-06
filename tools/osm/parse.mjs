// A small reader for OpenStreetMap XML files (as downloaded by download.mjs). Returns nodes, ways and relations with tags.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const attr = (s, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(s);
  return m ? m[1] : undefined;
};
const unescape = (v) => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function readOsm(dir) {
  const nodes = new Map(); // id -> [lat, lon]
  const ways = new Map(); // id -> { nodes: [], tags: {} }
  const relations = new Map(); // id -> { members: [{type, ref, role}], tags }
  const nodeTags = new Map(); // id -> tags (only nodes that have some)
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".osm"))) {
    const text = readFileSync(join(dir, file), "utf8");
    // Elements are small; split on the opening tags.
    const re = /<(node|way|relation)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
    let m;
    while ((m = re.exec(text))) {
      const [, kind, head, , body = ""] = m;
      const id = attr(head, "id");
      if (attr(head, "visible") === "false") continue;
      const tags = {};
      for (const t of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\s*\/>/g)) tags[unescape(t[1])] = unescape(t[2]);
      if (kind === "node") {
        nodes.set(id, [Number(attr(head, "lat")), Number(attr(head, "lon"))]);
        if (Object.keys(tags).length) nodeTags.set(id, tags);
      } else if (kind === "way") {
        if (ways.has(id)) continue;
        ways.set(id, { nodes: [...body.matchAll(/<nd ref="(\d+)"/g)].map((x) => x[1]), tags });
      } else {
        if (relations.has(id)) continue;
        relations.set(id, { members: [...body.matchAll(/<member type="(\w+)" ref="(\d+)" role="([^"]*)"/g)].map((x) => ({ type: x[1], ref: x[2], role: x[3] })), tags });
      }
    }
  }
  return { nodes, ways, relations, nodeTags };
}
