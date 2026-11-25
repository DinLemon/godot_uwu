// Подсветка GDScript и мини-Markdown. Без зависимостей.
(function () {
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const KW = new Set((
    "if elif else for while match break continue pass return var const func class class_name extends signal enum " +
    "static and or not in is as self super true false null await when"
  ).split(" "));
  const PRIM = new Set("int float bool void String StringName Array Dictionary Variant Callable Signal NodePath".split(" "));

  // Токенизатор GDScript: идём по строке и забираем самый первый подходящий кусок.
  const RULES = [
    ["com", /^#[^\n]*/],
    ["str", /^"""[\s\S]*?"""/],
    ["str", /^[&^]?"(?:[^"\\\n]|\\.)*"?/],
    ["str", /^[&^]?'(?:[^'\\\n]|\\.)*'?/],
    ["attr", /^@[A-Za-z_]\w*/],
    ["node", /^\$(?:"[^"\n]*"|[A-Za-z_][\w]*(?:\/(?:\.\.|[A-Za-z_]\w*))*)/],
    ["num", /^(?:0x[0-9a-fA-F_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\.\d+)/],
    ["word", /^[A-Za-z_\u0400-\u04FF][\w\u0400-\u04FF]*/],
    ["ws", /^\s+/],
    ["p", /^[^\sA-Za-z0-9_'"#@$\u0400-\u04FF]+|^./],
  ];

  function highlightGd(src) {
    let out = "";
    let i = 0;
    let prev = "";
    while (i < src.length) {
      const rest = src.slice(i);
      let kind = "p", m = null;
      for (const [k, re] of RULES) {
        m = re.exec(rest);
        if (m) { kind = k; break; }
      }
      const text = m[0];
      i += text.length;
      if (kind === "word") {
        const next = src.slice(i).match(/^\s*\(/);
        if (KW.has(text)) out += `<span class="tok-kw">${esc(text)}</span>`;
        else if (PRIM.has(text) || /^[A-Z][a-z0-9]/.test(text) || /^[A-Z]$/.test(text)) out += `<span class="tok-ty">${esc(text)}</span>`;
        else if (/^[A-Z][A-Z0-9_]+$/.test(text)) out += `<span class="tok-num">${esc(text)}</span>`;
        else if (next) out += `<span class="tok-fn">${esc(text)}</span>`;
        else out += esc(text);
      } else if (kind === "ws" || kind === "p") {
        out += esc(text);
      } else {
        out += `<span class="tok-${kind}">${esc(text)}</span>`;
      }
      if (kind !== "ws") prev = text;
    }
    return out;
  }

  function inline(s) {
    // s уже экранирован. Сначала прячем `код`, чтобы внутри него не работали ** и *.
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g, (_, t, u) =>
      `<a href="${u}"${u.startsWith("#") ? "" : ' target="_blank" rel="noopener"'}>${t}</a>`);
    s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[+n]}</code>`);
    return s;
  }

  // Мини-Markdown: абзацы, списки, ```код```, > совет, !> предупреждение, ~> заметка.
  function md(src) {
    const lines = String(src).replace(/\r/g, "").replace(/^\n+|\s+$/g, "").split("\n");
    let html = "";
    let i = 0;
    const isBlockStart = (l) => /^(```|- |\d+\. |> |!> |~> |### )/.test(l);
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") { i++; continue; }
      if (line.startsWith("```")) {
        const lang = line.slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
        i++;
        const body = lang && !/^(gd|gdscript)$/.test(lang) ? esc(buf.join("\n")) : highlightGd(buf.join("\n"));
        if (lang === "tree") { html += `<pre class="code tree"><code>${body}</code></pre>`; continue; }
        html += `<pre class="code"><code>${body}</code></pre>`;
        continue;
      }
      if (line.startsWith("### ")) { html += `<h3>${inline(esc(line.slice(4)))}</h3>`; i++; continue; }
      const box = line.match(/^(>|!>|~>) /);
      if (box) {
        const cls = box[1] === ">" ? "tip" : box[1] === "!>" ? "warn" : "note";
        const buf = [];
        while (i < lines.length && lines[i].startsWith(box[1] + " ")) buf.push(lines[i++].slice(box[1].length + 1));
        html += `<div class="${cls}">${buf.map((l) => inline(esc(l))).join("<br>")}</div>`;
        continue;
      }
      if (/^- /.test(line) || /^\d+\. /.test(line)) {
        const ordered = /^\d+\. /.test(line);
        const re = ordered ? /^\d+\. / : /^- /;
        const items = [];
        while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
        const tag = ordered ? "ol" : "ul";
        html += `<${tag}>${items.map((t) => `<li>${inline(esc(t))}</li>`).join("")}</${tag}>`;
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) buf.push(lines[i++]);
      html += `<p>${buf.map((l) => inline(esc(l))).join("<br>")}</p>`;
    }
    return html;
  }

  window.RK = window.RK || {};
  Object.assign(window.RK, { esc, md, inline: (s) => inline(esc(s)), highlightGd });
})();
