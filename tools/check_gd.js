#!/usr/bin/env node
// Прогоняет все примеры и решения курса через тренажёр GDScript (js/gdscript.js).
// Запуск: node tools/check_gd.js [id-урока-или-модуля]
// Проверяет:
//  - пример (code) запускается без ошибки и печатает ```out (если он указан);
//  - пример с fails: yes действительно падает с ошибкой;
//  - решение задачи (task) печатает ```expect и содержит строки contains:;
//  - заготовка задачи хотя бы читается (без ошибки разбора);
//  - пропуски (fill), если подставить первый ответ, дают рабочий код (если код полный — есть func);
//  - собранный по порядку код (order), если он полный.
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..");
global.window = global;
require(path.join(ROOT, "js/gdscript.js"));
eval(fs.readFileSync(path.join(ROOT, "content/course-data.js"), "utf8"));
const { runGd, parse } = global.RK;
const only = process.argv[2];
const norm = (s) => String(s).trim().replace(/\s+/g, " ");
let n = 0, bad = 0;
const fail = (where, msg, extra) => { bad++; console.log(`✗ ${where}: ${msg}`); if (extra) console.log("   " + String(extra).split("\n").join("\n   ")); };

for (const m of global.COURSES.ru.modules) {
  for (const l of m.lessons) {
    if (only && !l.id.startsWith(only)) continue;
    l.cards.forEach((c, i) => {
      const where = `${l.id}#${i} ${c.t}`;
      const runs = (code) => { n++; return runGd(code); };
      if (c.t === "code" || (c.t === "deep" && c.code)) {
        if (c.norun) { try { parse(c.code); } catch (e) { if (!c.fails) fail(where, "norun-код не разбирается: " + e.message + " (строка " + e.line + ")"); } return; }
        const r = runs(c.code);
        if (c.fails) { if (r.ok) fail(where, "ожидалась ошибка, а код отработал", r.stdout); return; }
        if (!r.ok) return fail(where, r.stderr, r.stdout);
        if (c.out != null && norm(r.stdout) !== norm(c.out)) fail(where, "вывод не совпал", `ждали:\n${c.out}\nполучили:\n${r.stdout}`);
      } else if (c.t === "task") {
        const r = runs(c.solution);
        if (!r.ok) return fail(where, "решение падает: " + r.stderr, r.stdout);
        if (c.expect != null && norm(r.stdout) !== norm(c.expect)) fail(where, "решение печатает не то", `ждали:\n${c.expect}\nполучили:\n${r.stdout}`);
        if (c.mustContain) c.mustContain.forEach((s) => { if (!c.solution.includes(s)) fail(where, "в решении нет " + s); });
        try { parse(c.code); } catch (e) { if (!/\.\.\./.test(c.code)) fail(where, "заготовка не разбирается: " + e.message + " (строка " + e.line + ")"); }
        const st = runGd(c.code);
        if (st.ok && c.expect != null && norm(st.stdout) === norm(c.expect)) fail(where, "заготовка уже проходит проверку — задача решена заранее");
      } else if (c.t === "fill") {
        let k = 0;
        const code = c.code.replace(/___/g, () => c.answers[k++][0]);
        if (!/func /.test(code) || c.norun) return;
        const r = runs(code);
        if (!r.ok) fail(where, "код с ответами падает: " + r.stderr);
        else if (c.out != null && norm(r.stdout) !== norm(c.out)) fail(where, "вывод не совпал", r.stdout);
      } else if (c.t === "order") {
        const code = c.lines.join("\n");
        if (!/^extends|^func /m.test(code) || c.norun) return;
        const r = runs(code);
        if (!r.ok) fail(where, "собранный код падает: " + r.stderr);
      }
    });
  }
}
console.log(`\nзапусков: ${n}, проблем: ${bad}`);
process.exit(bad ? 1 : 0);
