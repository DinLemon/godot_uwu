// Тренажёр GDScript: маленький интерпретатор подмножества GDScript 2.0 (Godot 4).
// Работает прямо в браузере, без сервера. Умеет переменные, типы, функции, классы,
// сигналы, массивы, словари, Vector2 и упрощённое дерево узлов с кадрами (_process).
// Физики, графики, файлов проекта и await здесь нет — это есть только в настоящем Godot.
(function (root) {
  "use strict";

  // ===================== Ошибки =====================
  class GdError extends Error {
    constructor(msg, line, tip) { super(msg); this.line = line; this.tip = tip; }
  }
  const TIPS = {
    parse: "Godot не смог **прочитать** код. Чаще всего это забытое двоеточие `:` в конце строки с `if`, `for`, `func`, лишняя или незакрытая скобка, кавычка.",
    indent: "Проблема с **отступами**. В GDScript отступ (Tab или 4 пробела) показывает, какие строки лежат внутри `func`, `if` или `for`. Строки одного блока должны начинаться ровно с одного места.",
    noindent: "После строки с двоеточием `:` Godot ждёт **блок с отступом** — хотя бы одну строку, сдвинутую вправо. Если пока писать нечего, поставь `pass`.",
    undeclared: "Godot **не знает такого имени**. Проверь опечатку (большие и маленькие буквы различаются) и то, что переменная создана через `var` выше и видна в этом месте.",
    types: "**Типы не подходят** друг к другу. Например, нельзя сложить число и текст: `5 + \"5\"`. Преврати число в текст через `str(5)` или текст в число через `int(\"5\")`.",
    assign: "Переменная объявлена с **типом**, и в неё нельзя положить значение другого типа. Например, в `var hp: int` нельзя положить текст.",
    zero: "**Деление на ноль.** Целое число нельзя делить на 0 — проверь делитель через `if` перед делением.",
    index: "**Нет такого элемента.** Номера в массиве идут с 0, последний — `size() - 1`. Для словаря: такого ключа нет — проверь через `has()` или возьми `get(ключ, запасное_значение)`.",
    null: "Значение равно **null** — то есть «ничего». У «ничего» нет свойств и методов. Чаще всего это узел, который не нашёлся, или переменная, в которую ещё ничего не положили.",
    nomethod: "У этого значения **нет такого метода или свойства**. Проверь название. Справка в Godot: зажми Ctrl и кликни по имени типа.",
    args: "Функции передано **не то количество аргументов**. Сравни вызов с объявлением `func`.",
    loop: "Программа работает **слишком долго**. Скорее всего, это бесконечный цикл: условие `while` никогда не становится ложным.",
    stack: "Функция **вызывает сама себя бесконечно** (переполнение стека). У рекурсии должно быть условие остановки.",
    constant: "Это **константа** (`const`). Её значение нельзя поменять после создания. Если значение должно меняться — используй `var`.",
    redecl: "Такое имя **уже занято** в этом блоке. Придумай другое имя или убери второе `var`.",
    onlygodot: "Эта возможность работает **только внутри настоящего Godot** (файлы проекта, физика, await, графика). В тренажёре её нет — попробуй этот код в редакторе Godot.",
    assert: "Проверка `assert` не прошла: условие оказалось ложным.",
    freed: "Этот объект **уже удалён** (`queue_free`). Пользоваться им больше нельзя. Проверь его через `is_instance_valid()`.",
  };

  // ===================== Лексер =====================
  const KEYWORDS = new Set(("if elif else for while match break continue pass return var const func class class_name extends " +
    "signal enum static and or not in is as self super true false null await when").split(" "));
  const OPS = ["**=", "<<=", ">>=", "**", "==", "!=", "<=", ">=", "<<", ">>", "&&", "||", "->", ":=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
    "+", "-", "*", "/", "%", "<", ">", "=", "!", "~", "&", "|", "^", "(", ")", "[", "]", "{", "}", ",", ":", ".", ";"];

  function lex(src) {
    const toks = [];
    const s = src.replace(/\r\n?/g, "\n");
    let i = 0, line = 1, depth = 0, atLineStart = true;
    const indents = [0];
    const push = (t, v, extra) => toks.push(Object.assign({ t, v, line }, extra || {}));
    while (i <= s.length) {
      if (atLineStart && depth === 0) {
        // считаем отступ
        let col = 0, j = i;
        while (j < s.length && (s[j] === " " || s[j] === "\t")) { col += s[j] === "\t" ? 4 : 1; j++; }
        if (j >= s.length) { i = j; break; }
        if (s[j] === "\n" || s[j] === "#") { // пустая строка или комментарий
          while (j < s.length && s[j] !== "\n") j++;
          i = j + 1; line++; continue;
        }
        if (s[j] === "\\" && s[j + 1] === "\n") { i = j + 2; line++; continue; }
        const top = indents[indents.length - 1];
        if (col > top) { indents.push(col); push("INDENT"); }
        else if (col < top) {
          while (col < indents[indents.length - 1]) { indents.pop(); push("DEDENT"); }
          if (col !== indents[indents.length - 1]) throw new GdError("Unindent doesn't match the previous indentation level.", line, "indent");
        }
        i = j; atLineStart = false;
      }
      if (i >= s.length) break;
      const c = s[i];
      if (c === "\n") {
        if (depth === 0) { push("NEWLINE"); atLineStart = true; }
        i++; line++; continue;
      }
      if (c === " " || c === "\t") { i++; continue; }
      if (c === "#") { while (i < s.length && s[i] !== "\n") i++; continue; }
      if (c === "\\" && s[i + 1] === "\n") { i += 2; line++; continue; }
      // строки
      if (c === '"' || c === "'" || ((c === "&" || c === "^") && (s[i + 1] === '"' || s[i + 1] === "'"))) {
        if (c === "&" || c === "^") i++;
        const q = s[i];
        const triple = s.substr(i, 3) === q + q + q;
        i += triple ? 3 : 1;
        let out = "";
        const startLine = line;
        for (;;) {
          if (i >= s.length) throw new GdError("Unterminated string.", startLine, "parse");
          const ch = s[i];
          if (triple ? s.substr(i, 3) === q + q + q : ch === q) { i += triple ? 3 : 1; break; }
          if (ch === "\n") { if (!triple) throw new GdError("Unterminated string.", startLine, "parse"); line++; out += ch; i++; continue; }
          if (ch === "\\") {
            const n = s[i + 1];
            const map = { n: "\n", t: "\t", r: "\r", '"': '"', "'": "'", "\\": "\\", "0": "\0" };
            if (n in map) { out += map[n]; i += 2; continue; }
            if (n === "u") { out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16)); i += 6; continue; }
            out += n; i += 2; continue;
          }
          out += ch; i++;
        }
        push("STR", out); continue;
      }
      // числа
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || ""))) {
        let m = /^0x[0-9a-fA-F_]+/.exec(s.slice(i)) || /^0b[01_]+/.exec(s.slice(i));
        if (m) { push("INT", BigInt(m[0].replace(/_/g, ""))); i += m[0].length; continue; }
        m = /^(\d[\d_]*)?(\.\d[\d_]*|\.(?![a-zA-Z_.]))?([eE][+-]?\d+)?/.exec(s.slice(i));
        const txt = m[0].replace(/_/g, "");
        if (m[2] || m[3]) push("FLOAT", parseFloat(txt)); else push("INT", BigInt(txt));
        i += m[0].length; continue;
      }
      // $Путь и %Уникальный
      if ((c === "$" || c === "%") && /[A-Za-z_"'Ѐ-ӿ]/.test(s[i + 1] || "") && (c === "$" || !/[\w)\]"']/.test(lastSig(toks)))) {
        i++;
        let path = "";
        if (s[i] === '"' || s[i] === "'") { const q = s[i++]; while (i < s.length && s[i] !== q) path += s[i++]; i++; }
        else { const m = /^(\.\.|[A-Za-z_Ѐ-ӿ][\wЀ-ӿ]*)(\/(\.\.|[A-Za-z_Ѐ-ӿ][\wЀ-ӿ]*))*/.exec(s.slice(i)); path = m[0]; i += path.length; }
        push("NODEPATH", path); continue;
      }
      if (c === "@") {
        const m = /^@([A-Za-z_]\w*)/.exec(s.slice(i));
        if (!m) throw new GdError("Unexpected \"@\".", line, "parse");
        push("ANNOT", m[1]); i += m[0].length; continue;
      }
      const m = /^[A-Za-z_Ѐ-ӿ][\wЀ-ӿ]*/.exec(s.slice(i));
      if (m) { push(KEYWORDS.has(m[0]) ? "KW" : "NAME", m[0]); i += m[0].length; continue; }
      const op = OPS.find((o) => s.startsWith(o, i));
      if (op) {
        if ("([{".includes(op)) depth++;
        if (")]}".includes(op)) depth = Math.max(0, depth - 1);
        push("OP", op); i += op.length; continue;
      }
      throw new GdError(`Invalid character "${c}".`, line, "parse");
    }
    if (toks.length && toks[toks.length - 1].t !== "NEWLINE") push("NEWLINE");
    while (indents.length > 1) { indents.pop(); push("DEDENT"); }
    push("EOF");
    return toks;
  }
  function lastSig(toks) { const t = toks[toks.length - 1]; return t ? (t.t === "NAME" || t.t === "INT" || t.t === "FLOAT" ? "a" : String(t.v || "")) : ""; }

  // ===================== Парсер =====================
  function parse(src) {
    const T = lex(src);
    let p = 0;
    const peek = (o = 0) => T[p + o];
    const next = () => T[p++];
    const is = (t, v, o = 0) => { const k = T[p + o]; return k && k.t === t && (v === undefined || k.v === v); };
    const isOp = (v, o) => is("OP", v, o);
    const isKw = (v, o) => is("KW", v, o);
    const fail = (msg, tip) => { throw new GdError(msg, (peek() || T[T.length - 1]).line, tip || "parse"); };
    const desc = (t) => t.t === "NEWLINE" ? "конец строки" : t.t === "EOF" ? "конец файла" : t.t === "INDENT" ? "отступ" : t.t === "DEDENT" ? "конец блока" : `"${t.v}"`;
    function expectOp(v, after) {
      if (!isOp(v)) fail(`Expected "${v}"${after ? " after " + after : ""}, but found ${desc(peek())}.`);
      return next();
    }
    function expectName(what) {
      if (!is("NAME")) fail(`Expected ${what || "identifier"}, but found ${desc(peek())}.`);
      return next().v;
    }
    function endStmt() {
      if (isOp(";")) next();
      if (is("NEWLINE")) { next(); return; }
      if (is("DEDENT") || is("EOF")) return;
      fail(`Expected end of statement, found ${desc(peek())}.`);
    }

    function parseType() {
      let name = next().v;
      if (isOp(".")) { next(); name += "." + expectName(); }
      if (isOp("[")) { next(); parseType(); expectOp("]"); }
      return name;
    }

    // ----- Класс (файл скрипта — тоже класс) -----
    function parseClassBody(cls, isFile) {
      let annots = [];
      while (!is("EOF") && !is("DEDENT")) {
        const t = peek();
        if (t.t === "NEWLINE") { next(); continue; }
        if (t.t === "ANNOT") {
          next();
          const a = { name: t.v, args: [] };
          if (isOp("(")) { next(); while (!isOp(")")) { a.args.push(parseExpr()); if (isOp(",")) next(); } next(); }
          annots.push(a);
          if (is("NEWLINE")) next();
          continue;
        }
        if (isKw("extends")) { next(); cls.base = parseType(); if (isKw("class_name")) continue; endStmt(); continue; }
        if (isKw("class_name")) { next(); cls.className = expectName("class name"); if (isKw("extends")) continue; endStmt(); continue; }
        let isStatic = false;
        if (isKw("static")) { next(); isStatic = true; }
        if (isKw("var")) { const v = parseVarDecl(); v.annots = annots; v.static = isStatic; cls.vars.push(v); annots = []; continue; }
        if (isKw("const")) { next(); const name = expectName(); let type = null; if (isOp(":")) { next(); if (!isOp("=")) type = parseType(); } if (isOp(":=")) next(); else expectOp("="); cls.consts.push({ name, type, expr: parseExpr(), line: t.line }); endStmt(); continue; }
        if (isKw("func")) { const f = parseFunc(); f.static = isStatic; cls.funcs[f.name] = f; annots = []; continue; }
        if (isKw("signal")) {
          next(); const name = expectName("signal name");
          if (isOp("(")) { next(); while (!isOp(")")) { next(); if (isOp(":")) { next(); parseType(); } if (isOp(",")) next(); } next(); }
          cls.signals.push(name); endStmt(); continue;
        }
        if (isKw("enum")) { cls.enums.push(parseEnum()); continue; }
        if (isKw("class")) {
          next(); const name = expectName("class name");
          const inner = newClass(name, t.line);
          if (isKw("extends")) { next(); inner.base = parseType(); }
          expectOp(":", "class name");
          if (!is("NEWLINE")) fail("Expected newline after class declaration.");
          next();
          if (!is("INDENT")) fail('Expected indented block after class declaration.', "noindent");
          next();
          parseClassBody(inner, false);
          if (is("DEDENT")) next();
          cls.inner[name] = inner; continue;
        }
        if (isFile) fail(`Unexpected ${desc(t)} in class body. (Код должен быть внутри func.)`, "parse");
        fail(`Unexpected ${desc(t)} in class body.`);
      }
    }
    function newClass(name, line) {
      return { k: "class", name, line, base: null, className: null, vars: [], consts: [], funcs: {}, signals: [], enums: [], inner: {} };
    }
    function parseEnum() {
      const line = next().line; let name = null;
      if (is("NAME")) name = next().v;
      expectOp("{", "enum");
      const items = [];
      while (!isOp("}")) {
        const n = expectName("enum value"); let e = null;
        if (isOp("=")) { next(); e = parseExpr(); }
        items.push({ name: n, expr: e });
        if (isOp(",")) next(); else if (!isOp("}")) fail('Expected "," or "}" in enum.');
      }
      next(); endStmt();
      return { name, items, line };
    }
    function parseVarDecl() {
      const line = next().line;
      const name = expectName("variable name");
      let type = null, infer = false, expr = null;
      if (isOp(":")) { next(); if (!isOp("=")) type = parseType(); }
      if (isOp(":=")) { next(); infer = true; expr = parseExpr(); }
      else if (isOp("=")) { next(); expr = parseExpr(); }
      // set/get-свойства (упрощённо — блок пропускаем)
      if (isOp(":") ) { skipBlock(); return { k: "var", name, type, infer, expr, line }; }
      endStmt();
      return { k: "var", name, type, infer, expr, line };
    }
    function skipBlock() {
      next(); if (is("NEWLINE")) next();
      if (is("INDENT")) { let d = 0; do { const t = next(); if (t.t === "INDENT") d++; if (t.t === "DEDENT") d--; } while (d > 0 && !is("EOF")); }
    }
    function parseParams() {
      expectOp("(", "function name");
      const params = [];
      while (!isOp(")")) {
        const name = expectName("parameter name"); let type = null, def = null;
        if (isOp(":")) { next(); type = parseType(); }
        if (isOp(":=")) { next(); def = parseExpr(); }
        else if (isOp("=")) { next(); def = parseExpr(); }
        params.push({ name, type, def });
        if (isOp(",")) next(); else if (!isOp(")")) fail('Expected "," or ")" after parameter.');
      }
      next();
      return params;
    }
    function parseFunc() {
      const line = next().line;
      const name = expectName("function name");
      const params = parseParams();
      let ret = null;
      if (isOp("->")) { next(); ret = parseType(); }
      expectOp(":", "function declaration");
      const body = parseBlock("function");
      return { k: "func", name, params, ret, body, line };
    }
    function parseBlock(after) {
      if (!is("NEWLINE")) { // однострочный блок: if x: return
        const st = parseSimple(); endStmt(); return [st];
      }
      next();
      if (!is("INDENT")) fail(`Expected indented block after ${after}.`, "noindent");
      next();
      const out = [];
      while (!is("DEDENT") && !is("EOF")) {
        if (is("NEWLINE")) { next(); continue; }
        out.push(parseStmt());
      }
      if (is("DEDENT")) next();
      return out;
    }

    // ----- Инструкции -----
    function parseStmt() {
      const t = peek();
      if (t.t === "INDENT") fail("Unexpected indent.", "indent");
      if (t.t === "ANNOT") { next(); if (isOp("(")) { next(); while (!isOp(")")) next(); next(); } if (is("NEWLINE")) next(); return { k: "pass", line: t.line }; }
      if (t.t === "KW") {
        switch (t.v) {
          case "if": return parseIf();
          case "while": { next(); const cond = parseExpr(); expectOp(":", '"while" condition'); return { k: "while", cond, body: parseBlock('"while" block'), line: t.line }; }
          case "for": {
            next(); const v = expectName("loop variable"); let type = null;
            if (isOp(":")) { next(); type = parseType(); }
            if (!isKw("in")) fail('Expected "in" after "for" variable name.');
            next(); const iter = parseExpr(); expectOp(":", '"for" iterator');
            return { k: "for", v, type, iter, body: parseBlock('"for" block'), line: t.line };
          }
          case "match": return parseMatch();
          case "var": return parseVarDecl();
          case "const": { next(); const name = expectName(); if (isOp(":")) { next(); if (!isOp("=")) parseType(); } if (isOp(":=")) next(); else expectOp("="); const expr = parseExpr(); endStmt(); return { k: "const", name, expr, line: t.line }; }
          case "func": fail("Функцию нельзя объявить внутри другой функции. Вынеси её на верхний уровень (без отступа).");
        }
      }
      const st = parseSimple(); endStmt(); return st;
    }
    function parseSimple() {
      const t = peek();
      if (t.t === "KW") {
        if (t.v === "pass") { next(); return { k: "pass", line: t.line }; }
        if (t.v === "break") { next(); return { k: "break", line: t.line }; }
        if (t.v === "continue") { next(); return { k: "continue", line: t.line }; }
        if (t.v === "return") { next(); const e = (is("NEWLINE") || is("DEDENT") || is("EOF") || isOp(";")) ? null : parseExpr(); return { k: "return", e, line: t.line }; }
        if (t.v === "var") { const line = next().line; const name = expectName(); let type = null, infer = false, expr = null; if (isOp(":")) { next(); if (!isOp("=")) type = parseType(); } if (isOp(":=")) { next(); infer = true; expr = parseExpr(); } else if (isOp("=")) { next(); expr = parseExpr(); } return { k: "var", name, type, infer, expr, line }; }
      }
      const e = parseExpr();
      const aop = ["=", "+=", "-=", "*=", "/=", "%=", "**=", "&=", "|=", "^=", "<<=", ">>="].find((o) => isOp(o));
      if (aop) {
        if (!["name", "attr", "index"].includes(e.k)) fail("Assignment target must be a variable, property or index.");
        next(); const v = parseExpr();
        return { k: "assign", op: aop, target: e, e: v, line: t.line };
      }
      return { k: "expr", e, line: t.line };
    }
    function parseIf() {
      const line = next().line;
      const cond = parseExpr();
      expectOp(":", '"if" condition');
      const body = parseBlock('"if" block');
      const node = { k: "if", cond, body, els: null, line };
      if (isKw("elif")) { node.els = [parseIf()]; }
      else if (isKw("else")) { next(); expectOp(":", '"else"'); node.els = parseBlock('"else" block'); }
      return node;
    }
    function parseMatch() {
      const line = next().line;
      const subject = parseExpr();
      expectOp(":", '"match" expression');
      if (!is("NEWLINE")) fail("Expected newline after match.");
      next();
      if (!is("INDENT")) fail("Expected indented block after match.", "noindent");
      next();
      const branches = [];
      while (!is("DEDENT") && !is("EOF")) {
        if (is("NEWLINE")) { next(); continue; }
        const pats = [parsePattern()];
        while (isOp(",")) { next(); pats.push(parsePattern()); }
        let guard = null;
        if (isKw("when")) { next(); guard = parseExpr(); }
        expectOp(":", "match pattern");
        branches.push({ pats, guard, body: parseBlock("match branch"), line: peek().line });
      }
      if (is("DEDENT")) next();
      return { k: "match", subject, branches, line };
    }
    function parsePattern() {
      if (is("NAME", "_")) { next(); return { k: "wild" }; }
      if (isKw("var")) { next(); return { k: "bind", name: expectName() }; }
      if (isOp("[")) {
        next(); const items = []; let rest = false;
        while (!isOp("]")) {
          if (isOp(".") && isOp(".", 1)) { next(); next(); rest = true; }
          else items.push(parsePattern());
          if (isOp(",")) next();
        }
        next(); return { k: "arr", items, rest };
      }
      return { k: "val", e: parseBinary(0) };
    }

    // ----- Выражения -----
    function parseExpr() {
      if (isKw("func")) return parseLambda();
      let e = parseBinary(0);
      if (isKw("if")) {
        next(); const cond = parseBinary(0);
        if (!isKw("else")) fail('Expected "else" after ternary "if".');
        next(); const els = parseExpr();
        return { k: "tern", cond, a: e, b: els, line: e.line };
      }
      return e;
    }
    function parseLambda() {
      const line = next().line;
      let name = null; if (is("NAME")) name = next().v;
      const params = parseParams();
      if (isOp("->")) { next(); parseType(); }
      expectOp(":", "lambda");
      if (is("NEWLINE")) fail("В тренажёре лямбда (func без имени) должна помещаться в одну строку: func(x): return x * 2", "onlygodot");
      const st = parseSimple();
      return { k: "lambda", name, params, body: [st], line };
    }
    const LEVELS = [
      [["or", "||"]], [["and", "&&"]], [["not", "!"], "unary"], [["in", "not in"]],
      [["==", "!=", "<", ">", "<=", ">="]], [["|"]], [["^"]], [["&"]], [["<<", ">>"]],
      [["+", "-"]], [["*", "/", "%"]], [["-", "+", "~"], "unary"], [["**"]], [["is", "as"]],
    ];
    function curOp() {
      const t = peek();
      if (t.t === "OP") return t.v;
      if (t.t === "KW" && ["or", "and", "not", "in", "is", "as"].includes(t.v)) {
        if (t.v === "not" && isKw("in", 1)) return "not in";
        return t.v;
      }
      return null;
    }
    function parseBinary(lv) {
      if (lv >= LEVELS.length) return parsePostfix();
      const [ops, kind] = LEVELS[lv];
      if (kind === "unary") {
        const o = curOp();
        if (o && ops.includes(o)) {
          const line = next().line;
          const a = parseBinary(lv);
          return { k: "un", op: o === "!" ? "not" : o, a, line };
        }
        return parseBinary(lv + 1);
      }
      let a = parseBinary(lv + 1);
      for (;;) {
        const o = curOp();
        if (!o || !ops.includes(o)) break;
        const line = next().line;
        if (o === "not in") next();
        if (o === "is" || o === "as") {
          let neg = false;
          if (o === "is" && isKw("not")) { next(); neg = true; }
          const tname = parseType();
          a = { k: o, a, type: tname, neg, line };
          continue;
        }
        const b = o === "**" ? parseBinary(lv + 1) : parseBinary(lv + 1);
        a = { k: "bin", op: o === "||" ? "or" : o === "&&" ? "and" : o, a, b, line };
      }
      return a;
    }
    function parseArgs() {
      const args = [];
      while (!isOp(")")) {
        args.push(parseExpr());
        if (isOp(",")) next(); else if (!isOp(")")) fail('Expected closing ")" after call arguments.');
      }
      next();
      return args;
    }
    function parsePostfix() {
      let e = parseAtom();
      for (;;) {
        if (isOp("(")) { const line = next().line; e = { k: "call", f: e, args: parseArgs(), line }; }
        else if (isOp(".")) { const line = next().line; const name = is("KW") ? next().v : expectName("property name"); e = { k: "attr", o: e, name, line }; }
        else if (isOp("[")) { const line = next().line; const idx = parseExpr(); expectOp("]"); e = { k: "index", o: e, i: idx, line }; }
        else break;
      }
      return e;
    }
    function parseAtom() {
      const t = next();
      const line = t.line;
      switch (t.t) {
        case "INT": return { k: "lit", v: t.v, line };
        case "FLOAT": return { k: "lit", v: t.v, line };
        case "STR": return { k: "lit", v: t.v, line };
        case "NAME": return { k: "name", name: t.v, line };
        case "NODEPATH": return { k: "nodepath", path: t.v, line };
        case "KW":
          if (t.v === "true") return { k: "lit", v: true, line };
          if (t.v === "false") return { k: "lit", v: false, line };
          if (t.v === "null") return { k: "lit", v: null, line };
          if (t.v === "self") return { k: "self", line };
          if (t.v === "super") return { k: "super", line };
          if (t.v === "await") return { k: "await", e: parsePostfix(), line };
          break;
        case "OP":
          if (t.v === "(") { const e = parseExpr(); expectOp(")"); return e; }
          if (t.v === "[") {
            const items = [];
            while (!isOp("]")) { items.push(parseExpr()); if (isOp(",")) next(); else if (!isOp("]")) fail('Expected closing "]" after array elements.'); }
            next(); return { k: "array", items, line };
          }
          if (t.v === "{") {
            const items = [];
            while (!isOp("}")) {
              let key;
              if (is("NAME") && isOp("=", 1)) { key = { k: "lit", v: next().v }; next(); }
              else { key = parseExpr(); expectOp(":", "dictionary key"); }
              items.push([key, parseExpr()]);
              if (isOp(",")) next(); else if (!isOp("}")) fail('Expected closing "}" after dictionary elements.');
            }
            next(); return { k: "dict", items, line };
          }
      }
      p--;
      fail(`Expected expression, but found ${desc(t)}.`);
    }

    const main = newClass(null, 1);
    parseClassBody(main, true);
    if (!is("EOF")) fail("Unexpected indent.", "indent");
    return main;
  }

  // ===================== Значения =====================
  const isInt = (v) => typeof v === "bigint";
  const isFloat = (v) => typeof v === "number";
  const isNum = (v) => isInt(v) || isFloat(v);
  const wrap64 = (v) => BigInt.asIntN(64, v);
  const toF = (v) => (isInt(v) ? Number(v) : v);

  class Vec {
    constructor(c, kind) { this.c = c; this.kind = kind; } // kind: Vector2 | Vector2i | Vector3 | Vector3i
    get isI() { return this.kind.endsWith("i"); }
    with(i, val) { const c = this.c.slice(); c[i] = val; return new Vec(c, this.kind); }
  }
  const AX = { x: 0, y: 1, z: 2 };
  const vec2 = (x, y) => new Vec([x, y], "Vector2");
  class Color { constructor(r, g, b, a) { this.r = r; this.g = g; this.b = b; this.a = a == null ? 1 : a; } }
  class Callable {
    constructor(kind, data) { this.kind = kind; Object.assign(this, data); this.bound = []; }
  }
  class Signal { constructor(obj, name) { this.obj = obj; this.name = name; } }
  class ClassRef { constructor(name, cls) { this.name = name; this.cls = cls; } } // тип как значение
  class EnumRef { constructor(name, map) { this.name = name; this.map = map; } }
  let OBJ_ID = 1000;
  class GdObject {
    constructor(builtin, cls) {
      this.builtin = builtin; this.cls = cls; this.props = new Map(); this.types = new Map();
      this.conns = new Map(); this.children = []; this.parent = null; this.inTree = false;
      this.freed = false; this.queued = false; this.groups = new Set(); this.id = (OBJ_ID += 7);
      this.isReady = false;
    }
  }

  // ----- Встроенные классы узлов -----
  const BUILTIN = {
    Object: { parent: null, props: () => ({}) },
    RefCounted: { parent: "Object", props: () => ({}) },
    Resource: { parent: "RefCounted", props: () => ({ resource_name: "" }) },
    Node: { parent: "Object", props: () => ({ name: "", process_mode: 0n }), signals: ["ready", "tree_entered", "tree_exiting", "tree_exited", "child_entered_tree"] },
    CanvasItem: { parent: "Node", props: () => ({ visible: true, modulate: new Color(1, 1, 1, 1), z_index: 0n }), signals: ["visibility_changed"] },
    Node2D: { parent: "CanvasItem", props: () => ({ position: vec2(0, 0), rotation: 0.0, scale: vec2(1, 1) }) },
    Sprite2D: { parent: "Node2D", props: () => ({ texture: null, flip_h: false, flip_v: false, centered: true, offset: vec2(0, 0) }) },
    AnimatedSprite2D: { parent: "Node2D", props: () => ({ animation: "default", flip_h: false, frame: 0n, speed_scale: 1.0, sprite_frames: null }), signals: ["animation_finished"] },
    Marker2D: { parent: "Node2D", props: () => ({}) },
    Camera2D: { parent: "Node2D", props: () => ({ zoom: vec2(1, 1), enabled: true }) },
    CollisionObject2D: { parent: "Node2D", props: () => ({ collision_layer: 1n, collision_mask: 1n }) },
    Area2D: { parent: "CollisionObject2D", props: () => ({ monitoring: true }), signals: ["body_entered", "body_exited", "area_entered", "area_exited"] },
    PhysicsBody2D: { parent: "CollisionObject2D", props: () => ({}) },
    StaticBody2D: { parent: "PhysicsBody2D", props: () => ({}) },
    RigidBody2D: { parent: "PhysicsBody2D", props: () => ({ mass: 1.0, linear_velocity: vec2(0, 0), gravity_scale: 1.0 }) },
    CharacterBody2D: { parent: "PhysicsBody2D", props: () => ({ velocity: vec2(0, 0), up_direction: vec2(0, -1) }) },
    CollisionShape2D: { parent: "Node2D", props: () => ({ shape: null, disabled: false }) },
    Timer: { parent: "Node", props: () => ({ wait_time: 1.0, one_shot: false, autostart: false, time_left: 0.0, paused: false }), signals: ["timeout"] },
    AudioStreamPlayer: { parent: "Node", props: () => ({ stream: null, volume_db: 0.0, playing: false }), signals: ["finished"] },
    AnimationPlayer: { parent: "Node", props: () => ({ current_animation: "", speed_scale: 1.0 }), signals: ["animation_finished"] },
    CanvasLayer: { parent: "Node", props: () => ({ layer: 1n, visible: true }) },
    Control: { parent: "CanvasItem", props: () => ({ position: vec2(0, 0), size: vec2(0, 0) }), signals: ["mouse_entered", "mouse_exited"] },
    Label: { parent: "Control", props: () => ({ text: "" }) },
    Button: { parent: "Control", props: () => ({ text: "", disabled: false }), signals: ["pressed", "button_down", "button_up"] },
    ProgressBar: { parent: "Control", props: () => ({ value: 0.0, min_value: 0.0, max_value: 100.0 }), signals: ["value_changed"] },
    HBoxContainer: { parent: "Control", props: () => ({}) },
    VBoxContainer: { parent: "Control", props: () => ({}) },
    Node3D: { parent: "Node", props: () => ({ position: new Vec([0, 0, 0], "Vector3"), rotation: new Vec([0, 0, 0], "Vector3"), scale: new Vec([1, 1, 1], "Vector3"), visible: true }) },
    MeshInstance3D: { parent: "Node3D", props: () => ({ mesh: null }) },
    Camera3D: { parent: "Node3D", props: () => ({ fov: 75.0, current: false }) },
    CharacterBody3D: { parent: "Node3D", props: () => ({ velocity: new Vec([0, 0, 0], "Vector3") }) },
    SceneTree: { parent: "Object", props: () => ({ paused: false }) },
  };
  const builtinIs = (b, target) => { while (b) { if (b === target) return true; b = BUILTIN[b] && BUILTIN[b].parent; } return false; };
  const isNodeObj = (o) => o instanceof GdObject && builtinIs(o.builtin, "Node");

  // ===================== Строки =====================
  function fmtFloat(v) {
    if (Number.isNaN(v)) return "nan";
    if (v === Infinity) return "inf";
    if (v === -Infinity) return "-inf";
    if (Number.isInteger(v) && Math.abs(v) < 1e16) return (Object.is(v, -0) ? "-0" : String(v)) + ".0";
    let s = String(parseFloat(v.toPrecision(14)));
    if (/^-?\d+$/.test(s)) s += ".0";
    return s;
  }
  function fmtF32(v) {
    if (Number.isInteger(v)) return v + ".0";
    let s = String(parseFloat(Math.fround(v).toPrecision(6)));
    if (/^-?\d+$/.test(s)) s += ".0";
    return s;
  }
  function quote(s) { return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"'; }
  function str(v, nested) {
    if (v === null || v === undefined) return "<null>";
    if (v === true) return "true";
    if (v === false) return "false";
    if (isInt(v)) return v.toString();
    if (isFloat(v)) return fmtFloat(v);
    if (typeof v === "string") return nested ? quote(v) : v;
    if (Array.isArray(v)) return "[" + v.map((x) => str(x, true)).join(", ") + "]";
    if (v instanceof Map) return v.size ? "{ " + [...v].map(([k, x]) => str(k, true) + ": " + str(x, true)).join(", ") + " }" : "{  }";
    if (v instanceof Vec) return "(" + v.c.map((x) => (v.isI ? String(x) : fmtF32(x))).join(", ") + ")";
    if (v instanceof Color) return "(" + [v.r, v.g, v.b, v.a].map(fmtF32).join(", ") + ")";
    if (v instanceof GdObject) {
      if (v.freed) return "<Freed Object>";
      const toS = findMethod(v, "_to_string");
      if (toS && CUR) return String(CUR.callUser(v, toS, []));
      const nm = isNodeObj(v) ? v.props.get("name") + ":" : "";
      return `${nm}<${v.cls && v.cls.className ? v.cls.className : v.builtin}#${v.id}>`;
    }
    if (v instanceof Callable) return v.kind === "method" ? `${v.obj.builtin}::${v.name}` : "<anonymous lambda>";
    if (v instanceof Signal) return `${v.obj.builtin}::[signal]${v.name}`;
    if (v instanceof ClassRef) return `<GDScriptNativeClass#${v.name}>`;
    if (v instanceof EnumRef) return str(new Map(Object.entries(v.map)));
    return String(v);
  }
  function typeName(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "boolean") return "bool";
    if (isInt(v)) return "int";
    if (isFloat(v)) return "float";
    if (typeof v === "string") return "String";
    if (Array.isArray(v)) return "Array";
    if (v instanceof Map) return "Dictionary";
    if (v instanceof Vec) return v.kind;
    if (v instanceof Color) return "Color";
    if (v instanceof Callable) return "Callable";
    if (v instanceof Signal) return "Signal";
    if (v instanceof GdObject) return v.cls && v.cls.className ? v.cls.className : v.builtin;
    return "Object";
  }
  const TYPE_IDS = { null: 0, bool: 1, int: 2, float: 3, String: 4, Vector2: 5, Vector2i: 6, Vector3: 9, Vector3i: 10, Color: 20, Object: 24, Callable: 25, Signal: 26, Dictionary: 27, Array: 28 };
  function typeId(v) { const n = typeName(v); return BigInt(TYPE_IDS[n] != null ? TYPE_IDS[n] : 24); }

  function formatPercent(fmt, args) {
    if (!Array.isArray(args)) args = [args];
    let k = 0;
    const out = fmt.replace(/%([-+0 ]*)(\d+|\*)?(?:\.(\d+))?([sdifxXoc%])/g, (all, flags, width, prec, conv) => {
      if (conv === "%") return "%";
      if (k >= args.length) throw new GdError("not enough arguments for format string", null, "types");
      const v = args[k++];
      let s;
      if (conv === "s") s = str(v);
      else if (conv === "d" || conv === "i") { if (!isNum(v)) throw new GdError("a number is required", null, "types"); s = (isInt(v) ? v : BigInt(Math.trunc(v))).toString(); if (flags.includes("+") && !s.startsWith("-")) s = "+" + s; }
      else if (conv === "f") { if (!isNum(v)) throw new GdError("a number is required", null, "types"); s = toF(v).toFixed(prec != null ? +prec : 6); if (flags.includes("+") && !s.startsWith("-")) s = "+" + s; }
      else if (conv === "x" || conv === "X") { s = (isInt(v) ? v : BigInt(Math.trunc(v))).toString(16); if (conv === "X") s = s.toUpperCase(); }
      else if (conv === "o") s = (isInt(v) ? v : BigInt(Math.trunc(v))).toString(8);
      else if (conv === "c") s = typeof v === "string" ? v[0] : String.fromCharCode(Number(v));
      if (width) {
        const w = +width;
        if (flags.includes("-")) s = s.padEnd(w);
        else if (flags.includes("0") && conv !== "s") { const neg = s.startsWith("-"); s = (neg ? "-" : "") + s.replace("-", "").padStart(w - (neg ? 1 : 0), "0"); }
        else s = s.padStart(w);
      }
      return s;
    });
    if (k < args.length) throw new GdError("not all arguments converted during string formatting", null, "types");
    return out;
  }

  // ===================== Равенство, правда, сравнение =====================
  function truthy(v) {
    if (v === null || v === undefined || v === false) return false;
    if (v === true) return true;
    if (isInt(v)) return v !== 0n;
    if (isFloat(v)) return v !== 0;
    if (typeof v === "string") return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (v instanceof Map) return v.size > 0;
    if (v instanceof Vec) return v.c.some((x) => x !== 0);
    if (v instanceof GdObject) return !v.freed;
    return true;
  }
  function eq(a, b) {
    if (isNum(a) && isNum(b)) return isInt(a) && isInt(b) ? a === b : toF(a) === toF(b);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
    if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => mapHas(b, k) && eq(v, mapGet(b, k)));
    if (a instanceof Vec && b instanceof Vec) return a.kind === b.kind && a.c.every((x, i) => x === b.c[i]);
    if (a instanceof Color && b instanceof Color) return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
    if (a instanceof Callable && b instanceof Callable) return a.kind === b.kind && a.obj === b.obj && a.name === b.name && a.fn === b.fn;
    if (a instanceof Signal && b instanceof Signal) return a.obj === b.obj && a.name === b.name;
    return a === b;
  }
  // Ключи словаря: int и float с одинаковым значением — разные ключи, как в Godot.
  function mapKey(m, k) { if (m.has(k)) return k; for (const kk of m.keys()) if (typeof kk === typeof k && eq(kk, k)) return kk; return undefined; }
  function mapHas(m, k) { return mapKey(m, k) !== undefined; }
  function mapGet(m, k) { const kk = mapKey(m, k); return kk === undefined ? undefined : m.get(kk); }
  function mapSet(m, k, v) { const kk = mapKey(m, k); m.set(kk === undefined ? k : kk, v); }

  function deepCopy(v) {
    if (Array.isArray(v)) return v.map(deepCopy);
    if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, deepCopy(x)]));
    return v;
  }

  // ===================== Интерпретатор =====================
  let CUR = null; // текущий запуск (нужен str() для _to_string)

  const MAX_STEPS = 3000000, MAX_DEPTH = 900, MAX_OUT = 4000;
  const CTRL_BREAK = { c: "break" }, CTRL_CONT = { c: "continue" };

  class Env {
    constructor(parent) { this.parent = parent; this.vars = new Map(); this.types = new Map(); this.consts = new Set(); }
    find(n) { let e = this; while (e) { if (e.vars.has(n)) return e; e = e.parent; } return null; }
  }

  function findMethod(obj, name) {
    let c = obj.cls;
    while (c) { if (c.funcs[name]) return Object.assign(c.funcs[name], { owner: c }); c = c.baseCls; }
    return null;
  }

  class Runner {
    constructor(opts) {
      this.out = []; this.steps = 0; this.depth = 0; this.line = 0;
      this.opts = opts; this.frame = 0; this.time = 0;
      this.rng = 0x2545F491; this.quitting = false;
      this.globalClasses = {};
    }
    print(s) {
      if (this.out.length >= MAX_OUT) throw new GdError("Слишком много строк вывода.", this.line, "loop");
      this.out.push(s);
    }
    err(msg, tip) { return new GdError(msg, this.line, tip); }
    tick() { if (++this.steps > MAX_STEPS) throw this.err("Программа выполняется слишком долго (больше 3 млн шагов).", "loop"); }

    // ----- Классы -----
    linkClass(cls, outer) {
      cls.outer = outer;
      for (const k in cls.inner) this.linkClass(cls.inner[k], cls);
    }
    resolveBase(cls) {
      if (cls.baseResolved) return;
      cls.baseResolved = true;
      const b = cls.base;
      if (!b) { cls.builtin = "RefCounted"; return; }
      if (BUILTIN[b]) { cls.builtin = b; return; }
      const user = this.lookupClass(b, cls.outer || cls);
      if (user) { this.resolveBase(user); cls.baseCls = user; cls.builtin = user.builtin; return; }
      if (/^"|res:\/\//.test(b)) throw new GdError("extends по пути к файлу работает только в Godot.", cls.line, "onlygodot");
      throw new GdError(`Could not find base class "${b}".`, cls.line, "undeclared");
    }
    lookupClass(name, from) {
      let c = from;
      while (c) { if (c.inner[name]) return c.inner[name]; if (c.name === name) return c; c = c.outer; }
      return this.globalClasses[name] || null;
    }
    classConsts(cls) {
      if (cls.constVals) return cls.constVals;
      const vals = cls.constVals = {};
      for (const en of cls.enums) {
        let n = 0n; const map = {};
        for (const it of en.items) {
          if (it.expr) n = this.evalIn(it.expr, cls);
          if (en.name) map[it.name] = n; else vals[it.name] = n;
          n = n + 1n;
        }
        if (en.name) vals[en.name] = new EnumRef(en.name, map);
      }
      for (const c of cls.consts) { this.line = c.line; vals[c.name] = this.evalIn(c.expr, cls); }
      return vals;
    }
    evalIn(expr, cls) { return this.eval(expr, { self: null, cls, env: new Env(null) }); }

    instantiate(cls, args) {
      this.resolveBase(cls);
      const o = new GdObject(cls.builtin, cls);
      this.initBuiltinProps(o, cls.builtin);
      const chain = [];
      for (let c = cls; c; c = c.baseCls) chain.unshift(c);
      for (const c of chain) {
        for (const s of c.signals) o.conns.set(s, []);
        for (const v of c.vars) {
          if (v.static) continue;
          o.types.set(v.name, v.type);
          o.props.set(v.name, v.type ? defaultFor(v.type) : null);
        }
      }
      const ctx = { self: o, cls, env: new Env(null) };
      for (const c of chain) {
        const cctx = { self: o, cls: c, env: new Env(null) };
        for (const v of c.vars) {
          if (v.static || !v.expr) continue;
          if (v.annots && v.annots.some((a) => a.name === "onready")) { (o.onready || (o.onready = [])).push([v, c]); continue; }
          this.line = v.line;
          let val = this.eval(v.expr, cctx);
          if (v.infer) o.types.set(v.name, typeName(val));
          o.props.set(v.name, this.coerce(val, o.types.get(v.name), v.name));
        }
      }
      const init = findMethod(o, "_init");
      if (init) this.callUser(o, init, args || []);
      else if (args && args.length) throw this.err(`Too many arguments for "new()" call. Expected at most 0 but received ${args.length}.`, "args");
      void ctx;
      return o;
    }
    initBuiltinProps(o, b) {
      const chain = [];
      for (let k = b; k; k = BUILTIN[k].parent) chain.unshift(k);
      for (const k of chain) {
        const ps = BUILTIN[k].props();
        for (const n in ps) o.props.set(n, ps[n]);
        for (const s of BUILTIN[k].signals || []) o.conns.set(s, []);
      }
      if (builtinIs(b, "Node")) o.props.set("name", "");
    }
    newBuiltin(name) {
      if (!BUILTIN[name]) throw this.err(`Тип ${name} есть в Godot, но в тренажёре его создать нельзя.`, "onlygodot");
      const o = new GdObject(name, null);
      this.initBuiltinProps(o, name);
      return o;
    }

    // ----- Типы -----
    coerce(v, type, what) {
      if (!type || type === "Variant") return v;
      const t = type.replace(/\[.*$/, "");
      const bad = () => { throw this.err(`Trying to assign value of type '${typeName(v)}' to a variable of type '${type}'.`, "assign"); };
      switch (t) {
        case "int": if (isInt(v)) return v; if (isFloat(v)) return BigInt(Math.trunc(v)); if (typeof v === "boolean") bad(); bad(); break;
        case "float": if (isFloat(v)) return v; if (isInt(v)) return Number(v); bad(); break;
        case "String": case "StringName": case "NodePath": if (typeof v === "string") return v; bad(); break;
        case "bool": if (typeof v === "boolean") return v; bad(); break;
        case "Array": if (Array.isArray(v)) return v; bad(); break;
        case "Dictionary": if (v instanceof Map) return v; bad(); break;
        case "Vector2": case "Vector2i": case "Vector3": case "Vector3i":
          if (v instanceof Vec && v.kind === t) return v;
          if (v instanceof Vec && v.kind.slice(0, 7) === t.slice(0, 7)) return new Vec(v.c.map((x) => (t.endsWith("i") ? Math.trunc(x) : x)), t);
          bad(); break;
        case "Color": if (v instanceof Color) return v; bad(); break;
        case "Callable": if (v instanceof Callable) return v; bad(); break;
        case "Signal": if (v instanceof Signal) return v; bad(); break;
        default:
          if (v === null) return v;
          if (this.isType(v, t)) return v;
          bad();
      }
      return v;
    }
    isType(v, t) {
      switch (t) {
        case "int": return isInt(v);
        case "float": return isFloat(v);
        case "String": case "StringName": return typeof v === "string";
        case "bool": return typeof v === "boolean";
        case "Array": return Array.isArray(v);
        case "Dictionary": return v instanceof Map;
        case "Vector2": case "Vector2i": case "Vector3": case "Vector3i": return v instanceof Vec && v.kind === t;
        case "Color": return v instanceof Color;
        case "Callable": return v instanceof Callable;
        case "Signal": return v instanceof Signal;
        case "Variant": return true;
      }
      if (!(v instanceof GdObject) || v.freed) return false;
      if (BUILTIN[t]) return builtinIs(v.builtin, t);
      for (let c = v.cls; c; c = c.baseCls) if (c.name === t || c.className === t) return true;
      return false;
    }

    // ----- Выполнение -----
    execBlock(stmts, ctx) {
      for (const st of stmts) {
        const r = this.exec(st, ctx);
        if (r) return r;
      }
      return null;
    }
    declare(env, name, val, type, isConst) {
      if (env.vars.has(name)) throw this.err(`There is already a variable named "${name}" declared in this scope.`, "redecl");
      env.vars.set(name, val); if (type) env.types.set(name, type); if (isConst) env.consts.add(name);
    }
    exec(st, ctx) {
      this.tick();
      this.line = st.line;
      switch (st.k) {
        case "expr": this.eval(st.e, ctx); return null;
        case "pass": return null;
        case "var": {
          let v = st.expr ? this.eval(st.expr, ctx) : (st.type ? defaultFor(st.type) : null);
          let type = st.type;
          if (st.infer) { if (v === null) throw this.err('Cannot infer the type of "' + st.name + '" variable because the value is "null".', "assign"); type = typeName(v); }
          this.line = st.line;
          this.declare(ctx.env, st.name, this.coerce(v, type, st.name), type);
          return null;
        }
        case "const": this.declare(ctx.env, st.name, this.eval(st.expr, ctx), null, true); return null;
        case "assign": this.assign(st, ctx); return null;
        case "if": {
          if (truthy(this.eval(st.cond, ctx))) return this.inScope(st.body, ctx);
          if (st.els) return this.inScope(st.els, ctx);
          return null;
        }
        case "while": {
          while (truthy(this.eval(st.cond, ctx))) {
            this.tick();
            const r = this.inScope(st.body, ctx);
            if (r === CTRL_BREAK) break;
            if (r && r !== CTRL_CONT) return r;
            this.line = st.line;
          }
          return null;
        }
        case "for": {
          const it = this.eval(st.iter, ctx);
          const run = (val) => {
            this.tick();
            const env = new Env(ctx.env);
            env.vars.set(st.v, this.coerce(val, st.type, st.v)); if (st.type) env.types.set(st.v, st.type);
            return this.execBlock(st.body, Object.assign({}, ctx, { env }));
          };
          const loop = (gen) => { for (const v of gen) { const r = run(v); if (r === CTRL_BREAK) break; if (r && r !== CTRL_CONT) return r; } return null; };
          if (isInt(it)) return loop((function* () { for (let i = 0n; i < it; i++) yield i; })());
          if (isFloat(it)) return loop((function* () { for (let i = 0n; i < Math.ceil(it); i++) yield i; })());
          if (Array.isArray(it)) return loop((function* () { for (let i = 0; i < it.length; i++) yield it[i]; })());
          if (it instanceof Map) return loop([...it.keys()]);
          if (typeof it === "string") return loop([...it]);
          if (it instanceof Vec) return loop((function* () { const [a, b, s] = it.c.length === 3 ? it.c : [it.c[0], it.c[1], 1]; for (let i = a; s > 0 ? i < b : i > b; i += s) yield BigInt(i); })());
          throw this.err(`Unable to iterate on value of type "${typeName(it)}".`, "types");
        }
        case "match": {
          const v = this.eval(st.subject, ctx);
          for (const br of st.branches) {
            for (const pat of br.pats) {
              const env = new Env(ctx.env);
              if (this.matchPat(pat, v, env, ctx)) {
                const c2 = Object.assign({}, ctx, { env });
                if (br.guard && !truthy(this.eval(br.guard, c2))) continue;
                return this.execBlock(br.body, c2);
              }
            }
          }
          return null;
        }
        case "break": return CTRL_BREAK;
        case "continue": return CTRL_CONT;
        case "return": return { c: "return", v: st.e ? this.eval(st.e, ctx) : null };
      }
      throw this.err("Unknown statement " + st.k);
    }
    inScope(body, ctx) { return this.execBlock(body, Object.assign({}, ctx, { env: new Env(ctx.env) })); }
    matchPat(pat, v, env, ctx) {
      switch (pat.k) {
        case "wild": return true;
        case "bind": env.vars.set(pat.name, v); return true;
        case "val": { const pv = this.eval(pat.e, ctx); return typeName(pv) === typeName(v) || (isNum(pv) && isNum(v)) ? eq(pv, v) : false; }
        case "arr":
          if (!Array.isArray(v)) return false;
          if (pat.rest ? v.length < pat.items.length : v.length !== pat.items.length) return false;
          return pat.items.every((p, i) => this.matchPat(p, v[i], env, ctx));
      }
      return false;
    }

    assign(st, ctx) {
      let val = this.eval(st.e, ctx);
      if (st.op !== "=") {
        const cur = this.eval(st.target, ctx);
        this.line = st.line;
        val = this.binop(st.op.slice(0, -1), cur, val);
      }
      this.line = st.line;
      this.setTarget(st.target, val, ctx);
    }
    setTarget(t, val, ctx) {
      if (t.k === "name") return this.setName(t.name, val, ctx);
      if (t.k === "attr") {
        const base = this.eval(t.o, ctx);
        this.line = t.line;
        if (base instanceof Vec || base instanceof Color) {
          const nb = this.setValueAttr(base, t.name, val);
          return this.setTarget(t.o, nb, ctx);
        }
        return this.setProp(base, t.name, val);
      }
      if (t.k === "index") {
        const base = this.eval(t.o, ctx);
        const idx = this.eval(t.i, ctx);
        this.line = t.line;
        if (Array.isArray(base)) { base[this.arrIndex(base, idx, true)] = val; return; }
        if (base instanceof Map) { mapSet(base, idx, val); return; }
        if (base instanceof Vec) { return this.setTarget(t.o, base.with(this.arrIndex(base.c, idx, true), toF(val)), ctx); }
        if (base instanceof GdObject && typeof idx === "string") return this.setProp(base, idx, val);
        if (typeof base === "string") throw this.err("Строки в GDScript нельзя менять по индексу. Собери новую строку.", "types");
        throw this.err(`Invalid assignment of index '${str(idx)}' (on base: '${typeName(base)}').`, "index");
      }
    }
    setValueAttr(base, name, val) {
      if (base instanceof Vec) {
        if (!(name in AX) || AX[name] >= base.c.length) throw this.err(`Invalid assignment of property or key '${name}' on a base object of type '${base.kind}'.`, "nomethod");
        if (!isNum(val)) throw this.err(`Invalid assignment of property or key '${name}' with value of type '${typeName(val)}' on a base object of type '${base.kind}'.`, "types");
        return base.with(AX[name], base.isI ? Number(toF(val) | 0) : toF(val));
      }
      const c = new Color(base.r, base.g, base.b, base.a);
      if (!["r", "g", "b", "a"].includes(name)) throw this.err(`Invalid assignment of property or key '${name}' on a base object of type 'Color'.`, "nomethod");
      c[name] = toF(val); return c;
    }
    setName(name, val, ctx) {
      const e = ctx.env.find(name);
      if (e) {
        if (e.consts.has(name)) throw this.err("Cannot assign a new value to a constant.", "constant");
        e.vars.set(name, this.coerce(val, e.types.get(name), name)); return;
      }
      if (ctx.self && (ctx.self.props.has(name) || this.specialProp(ctx.self, name) !== undefined)) return this.setProp(ctx.self, name, val);
      if (ctx.cls) {
        for (const c of scopeClasses(ctx.cls)) {
          const sv = c.vars.find((v) => v.static && v.name === name);
          if (sv) { c.staticVals[name] = this.coerce(val, sv.type, name); return; }
          if (this.classConsts(c)[name] !== undefined) throw this.err("Cannot assign a new value to a constant.", "constant");
        }
      }
      throw this.err(`Identifier "${name}" not declared in the current scope.`, "undeclared");
    }
    setProp(o, name, val) {
      if (o === null || o === undefined) throw this.err(`Invalid assignment of property or key '${name}' with value of type '${typeName(val)}' on a base object of type 'null instance'.`, "null");
      if (o instanceof Map) { mapSet(o, name, val); return; }
      if (!(o instanceof GdObject)) throw this.err(`Invalid assignment of property or key '${name}' on a base object of type '${typeName(o)}'.`, "nomethod");
      if (o.freed) throw this.err(`Invalid assignment of property or key '${name}' on a base object of type 'previously freed'.`, "freed");
      if (name === "rotation_degrees" && o.props.has("rotation")) { o.props.set("rotation", toF(val) * Math.PI / 180); return; }
      if (name === "global_position" && o.props.has("position")) { const gp = this.globalPos(o.parent); o.props.set("position", this.binop("-", val, gp)); return; }
      if (!o.props.has(name)) {
        // статическая переменная класса
        for (let c = o.cls; c; c = c.baseCls) { const sv = c.vars.find((v) => v.static && v.name === name); if (sv) { c.staticVals[name] = val; return; } }
        throw this.err(`Invalid assignment of property or key '${name}' with value of type '${typeName(val)}' on a base object of type '${typeName(o)}'.`, "nomethod");
      }
      const t = o.types.get(name) || builtinPropType(o, name);
      o.props.set(name, this.coerce(val, t, name));
      // сеттеры ProgressBar/Timer и т.п. не нужны: свойства простые
    }
    globalPos(o) {
      let p = vec2(0, 0);
      for (let n = o; n; n = n.parent) if (n.props.get("position") instanceof Vec && n.props.get("position").kind === "Vector2") p = this.binop("+", p, n.props.get("position"));
      return p;
    }
    arrIndex(arr, idx, set) {
      if (!isNum(idx)) throw this.err(`Invalid ${set ? "assignment of" : "access to"} index '${str(idx)}' (on base: 'Array').`, "index");
      let i = Number(idx);
      if (i < 0) i += arr.length;
      if (i < 0 || i >= arr.length) throw this.err(`Out of bounds ${set ? "set" : "get"} index '${str(idx)}' (on base: '${Array.isArray(arr) ? "Array" : "Vector"}')`, "index");
      return i;
    }

    // ----- Выражения -----
    eval(e, ctx) {
      switch (e.k) {
        case "lit": return e.v;
        case "name": this.line = e.line; return this.lookup(e.name, ctx);
        case "self": if (!ctx.self) throw this.err("Cannot use self inside a static function.", "undeclared"); return ctx.self;
        case "array": return e.items.map((x) => this.eval(x, ctx));
        case "dict": { const m = new Map(); for (const [k, v] of e.items) mapSet(m, this.eval(k, ctx), this.eval(v, ctx)); return m; }
        case "tern": return truthy(this.eval(e.cond, ctx)) ? this.eval(e.a, ctx) : this.eval(e.b, ctx);
        case "un": {
          const a = this.eval(e.a, ctx); this.line = e.line;
          if (e.op === "not") return !truthy(a);
          if (e.op === "-") { if (isInt(a)) return wrap64(-a); if (isFloat(a)) return -a; if (a instanceof Vec) return new Vec(a.c.map((x) => -x), a.kind); }
          if (e.op === "+" && isNum(a)) return a;
          if (e.op === "~" && isInt(a)) return ~a;
          throw this.err(`Invalid operand of type '${typeName(a)}' for unary operator '${e.op}'.`, "types");
        }
        case "bin": {
          if (e.op === "and") return truthy(this.eval(e.a, ctx)) && truthy(this.eval(e.b, ctx));
          if (e.op === "or") return truthy(this.eval(e.a, ctx)) || truthy(this.eval(e.b, ctx));
          const a = this.eval(e.a, ctx), b = this.eval(e.b, ctx);
          this.line = e.line;
          return this.binop(e.op, a, b);
        }
        case "is": { const a = this.eval(e.a, ctx); const r = this.isType(a, e.type); return e.neg ? !r : r; }
        case "as": { const a = this.eval(e.a, ctx); if (["int", "float", "String", "bool"].includes(e.type)) return this.convert(e.type, [a]); return this.isType(a, e.type) ? a : null; }
        case "attr": { const o = this.eval(e.o, ctx); this.line = e.line; return this.getAttr(o, e.name, ctx, e.o); }
        case "index": {
          const o = this.eval(e.o, ctx), i = this.eval(e.i, ctx); this.line = e.line;
          if (Array.isArray(o)) return o[this.arrIndex(o, i)];
          if (typeof o === "string") { const ch = [...o]; return ch[this.arrIndex(ch, i)]; }
          if (o instanceof Map) { const v = mapGet(o, i); if (v === undefined) throw this.err(`Invalid access to property or key ${str(i, true)} on a base object of type 'Dictionary'.`, "index"); return v; }
          if (o instanceof Vec) return o.isI ? BigInt(o.c[this.arrIndex(o.c, i)]) : o.c[this.arrIndex(o.c, i)];
          if (o instanceof GdObject && typeof i === "string") return this.getAttr(o, i, ctx);
          if (o === null) throw this.err(`Invalid access to index '${str(i)}' on a base object of type 'null instance'.`, "null");
          throw this.err(`Invalid access to index '${str(i)}' on a base object of type '${typeName(o)}'.`, "index");
        }
        case "call": return this.evalCall(e, ctx);
        case "lambda": return new Callable("lambda", { fn: e, env: ctx.env, self: ctx.self, cls: ctx.cls });
        case "nodepath": { this.line = e.line; return this.getNode(ctx.self, e.path, true); }
        case "super": throw this.err("super можно использовать только как super.метод() или super().", "parse");
        case "await": throw this.err("await работает только в настоящем Godot. В тренажёре используй узел Timer и сигнал timeout.", "onlygodot");
      }
      throw this.err("Unknown expression " + e.k);
    }

    lookup(name, ctx) {
      const e = ctx.env.find(name);
      if (e) return e.vars.get(name);
      const o = ctx.self;
      if (o) {
        if (o.freed) throw this.err("Object was freed.", "freed");
        if (o.props.has(name)) return o.props.get(name);
        const special = this.specialProp(o, name);
        if (special !== undefined) return special;
        if (findMethod(o, name)) return new Callable("method", { obj: o, name });
        if (o.conns.has(name)) return new Signal(o, name);
        if (builtinMethod(o, name)) return new Callable("method", { obj: o, name });
      }
      for (const c of scopeClasses(ctx.cls)) {
        const cv = this.classConsts(c);
        if (name in cv) return cv[name];
        if (c.inner[name]) return new ClassRef(name, c.inner[name]);
        if (c.staticVals && name in c.staticVals) return c.staticVals[name];
        if (c.funcs[name] && c.funcs[name].static) return new Callable("static", { cls: c, name });
        if (c.name === name) return new ClassRef(name, c);
      }
      if (this.globalClasses[name]) return new ClassRef(name, this.globalClasses[name]);
      if (name in GLOBALS) return GLOBALS[name](this);
      if (BUILTIN[name] || BUILTIN_TYPES.has(name)) return new ClassRef(name, null);
      if (name in BUILTIN_FUNCS) return new Callable("builtin", { name });
      throw this.err(`Identifier "${name}" not declared in the current scope.`, "undeclared");
    }
    specialProp(o, name) {
      if (name === "rotation_degrees" && o.props.has("rotation")) return toF(o.props.get("rotation")) * 180 / Math.PI;
      if (name === "global_position" && o.props.get("position") instanceof Vec) return this.globalPos(o);
      if (name === "is_on_floor_now") return undefined;
      return undefined;
    }

    getAttr(o, name, ctx, srcExpr) {
      if (o === null || o === undefined) throw this.err(`Invalid access to property or key '${name}' on a base object of type 'null instance'.`, "null");
      if (o instanceof Vec) {
        if (name in AX && AX[name] < o.c.length) return o.isI ? BigInt(o.c[AX[name]]) : o.c[AX[name]];
        throw this.err(`Invalid access to property or key '${name}' on a base object of type '${o.kind}'.`, "nomethod");
      }
      if (o instanceof Color) { if (["r", "g", "b", "a"].includes(name)) return o[name]; throw this.err(`Invalid access to property or key '${name}' on a base object of type 'Color'.`, "nomethod"); }
      if (o instanceof Map) { const v = mapGet(o, name); if (v === undefined) throw this.err(`Invalid access to property or key '${name}' on a base object of type 'Dictionary'.`, "index"); return v; }
      if (o instanceof EnumRef) { if (name in o.map) return o.map[name]; throw this.err(`Cannot find member "${name}" in base "${o.name}".`, "undeclared"); }
      if (o instanceof ClassRef) {
        if (o.cls) {
          for (let c = o.cls; c; c = c.baseCls) {
            const cv = this.classConsts(c);
            if (name in cv) return cv[name];
            if (c.inner[name]) return new ClassRef(name, c.inner[name]);
            if (c.staticVals && name in c.staticVals) return c.staticVals[name];
          }
        }
        const sc = STATIC_CONSTS[o.name];
        if (sc && name in sc) return sc[name]();
        throw this.err(`Cannot find member "${name}" in base "${o.name}".`, "undeclared");
      }
      if (o instanceof GdObject) {
        if (o.freed) throw this.err(`Invalid access to property or key '${name}' on a base object of type 'previously freed'.`, "freed");
        if (o.props.has(name)) return o.props.get(name);
        const sp = this.specialProp(o, name); if (sp !== undefined) return sp;
        if (o.conns.has(name)) return new Signal(o, name);
        if (findMethod(o, name) || builtinMethod(o, name)) return new Callable("method", { obj: o, name });
        for (let c = o.cls; c; c = c.baseCls) { const cv = this.classConsts(c); if (name in cv) return cv[name]; if (c.staticVals && name in c.staticVals) return c.staticVals[name]; }
      }
      if (typeof o === "string" && name === "length") throw this.err("Invalid access to property or key 'length' on a base object of type 'String'. (Это метод: пиши length() со скобками.)", "nomethod");
      throw this.err(`Invalid access to property or key '${name}' on a base object of type '${typeName(o)}'.`, "nomethod");
    }

    binop(op, a, b) {
      const bad = () => { throw this.err(`Invalid operands '${typeName(a)}' and '${typeName(b)}' in operator '${op}'.`, "types"); };
      if (op === "==") return eq(a, b);
      if (op === "!=") return !eq(a, b);
      if (op === "in") {
        if (Array.isArray(b)) return b.some((x) => eq(x, a));
        if (b instanceof Map) return mapHas(b, a);
        if (typeof b === "string" && typeof a === "string") return b.includes(a);
        if (b instanceof GdObject && typeof a === "string") return b.props.has(a);
        bad();
      }
      if (op === "not in") return !this.binop("in", a, b);
      if (isInt(a) && isInt(b)) {
        switch (op) {
          case "+": return wrap64(a + b);
          case "-": return wrap64(a - b);
          case "*": return wrap64(a * b);
          case "/": if (b === 0n) throw this.err("Division by zero error in operator '/'.", "zero"); return a / b;
          case "%": if (b === 0n) throw this.err("Modulo by zero error in operator '%'.", "zero"); return a % b;
          case "**": return b < 0n ? Math.pow(Number(a), Number(b)) : wrap64(a ** b);
          case "<": return a < b; case ">": return a > b; case "<=": return a <= b; case ">=": return a >= b;
          case "&": return a & b; case "|": return a | b; case "^": return a ^ b;
          case "<<": return wrap64(a << b); case ">>": return a >> b;
        }
      }
      if (isNum(a) && isNum(b)) {
        const x = toF(a), y = toF(b);
        switch (op) {
          case "+": return x + y; case "-": return x - y; case "*": return x * y; case "/": return x / y;
          case "**": return Math.pow(x, y);
          case "<": return x < y; case ">": return x > y; case "<=": return x <= y; case ">=": return x >= y;
        }
        bad();
      }
      if (typeof a === "string") {
        if (op === "+" && typeof b === "string") return a + b;
        if (op === "%") { try { return formatPercent(a, b); } catch (err) { throw this.err(err.message, "types"); } }
        if (typeof b === "string" && ["<", ">", "<=", ">="].includes(op)) return op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
        bad();
      }
      if (Array.isArray(a) && Array.isArray(b) && op === "+") return a.concat(b);
      if (a instanceof Vec || b instanceof Vec) {
        const V = a instanceof Vec ? a : b;
        const n = V.c.length;
        const comp = (v, i) => (v instanceof Vec ? v.c[i] : isNum(v) ? toF(v) : NaN);
        if (!(a instanceof Vec && b instanceof Vec) && !(isNum(a) || isNum(b))) bad();
        if (a instanceof Vec && b instanceof Vec && a.c.length !== b.c.length) bad();
        const fix = (x) => (V.isI && (a instanceof Vec ? a.isI : true) && (b instanceof Vec ? b.isI : isInt(b)) ? Math.trunc(x) : x);
        const kind = V.isI && !(isFloat(a) || isFloat(b)) ? V.kind : V.kind.replace(/i$/, "");
        const mk = (f) => new Vec(Array.from({ length: n }, (_, i) => fix(f(comp(a, i), comp(b, i)))), kind);
        switch (op) {
          case "+": if (!(a instanceof Vec && b instanceof Vec)) bad(); return mk((x, y) => x + y);
          case "-": if (!(a instanceof Vec && b instanceof Vec)) bad(); return mk((x, y) => x - y);
          case "*": return mk((x, y) => x * y);
          case "/": if (!(a instanceof Vec)) bad(); return mk((x, y) => x / y);
          case "<": case ">": case "<=": case ">=": {
            if (!(a instanceof Vec && b instanceof Vec)) bad();
            for (let i = 0; i < n; i++) if (a.c[i] !== b.c[i]) return op[0] === "<" ? a.c[i] < b.c[i] : a.c[i] > b.c[i];
            return op.length === 2;
          }
        }
      }
      if (a instanceof Color && b instanceof Color) {
        const f = { "+": (x, y) => x + y, "-": (x, y) => x - y, "*": (x, y) => x * y }[op];
        if (f) return new Color(f(a.r, b.r), f(a.g, b.g), f(a.b, b.b), f(a.a, b.a));
      }
      if (a instanceof Color && isNum(b) && (op === "*" || op === "/")) { const y = toF(b); const f = op === "*" ? (x) => x * y : (x) => x / y; return new Color(f(a.r), f(a.g), f(a.b), f(a.a)); }
      bad();
    }

    // ----- Вызовы -----
    evalCall(e, ctx) {
      const f = e.f;
      const args = () => e.args.map((a) => this.eval(a, ctx));
      if (f.k === "attr" && f.o.k === "super") {
        const a = args(); this.line = e.line;
        return this.callSuper(ctx, f.name, a);
      }
      if (f.k === "super") { const a = args(); this.line = e.line; return this.callSuper(ctx, "_init", a); }
      if (f.k === "name") {
        const name = f.name;
        // локальная переменная с Callable
        const env = ctx.env.find(name);
        if (env) { const c = env.vars.get(name); const a = args(); this.line = e.line; if (c instanceof Callable) return this.callCallable(c, a); throw this.err(`"${name}" не функция.`, "nomethod"); }
        if (ctx.self && !ctx.self.freed) {
          const m = findMethod(ctx.self, name);
          if (m) { const a = args(); this.line = e.line; return this.callUser(ctx.self, m, a); }
          if (builtinMethod(ctx.self, name) && !(name in BUILTIN_FUNCS)) { const a = args(); this.line = e.line; return this.callBuiltinMethod(ctx.self, name, a); }
        }
        for (const c of scopeClasses(ctx.cls)) {
          if (c.funcs[name] && c.funcs[name].static) { const a = args(); this.line = e.line; return this.callStatic(c, c.funcs[name], a); }
          if (c.funcs[name] && !ctx.self) throw this.err(`Cannot call non-static function "${name}()" from a static function.`, "undeclared");
        }
        if (name in BUILTIN_FUNCS) { const a = args(); this.line = e.line; return BUILTIN_FUNCS[name](this, a, ctx); }
        if (["int", "float", "str", "bool", "String", "Array", "Dictionary", "Vector2", "Vector2i", "Vector3", "Vector3i", "Color"].includes(name)) { const a = args(); this.line = e.line; return this.convert(name, a); }
        if (ctx.self && ctx.self.props.has(name)) { const c = ctx.self.props.get(name); if (c instanceof Callable) { const a = args(); this.line = e.line; return this.callCallable(c, a); } }
        this.line = e.line;
        if (["preload", "load"].includes(name)) throw this.err(`${name}() загружает файлы проекта. Их нет в тренажёре.`, "onlygodot");
        throw this.err(`Function "${name}()" not found in base self.`, "undeclared");
      }
      if (f.k === "attr") {
        const obj = this.eval(f.o, ctx);
        const a = args();
        this.line = e.line;
        return this.callMethod(obj, f.name, a, ctx, f.o);
      }
      const c = this.eval(f, ctx); const a = args(); this.line = e.line;
      if (c instanceof Callable) return this.callCallable(c, a);
      throw this.err(`Попытка вызвать как функцию значение типа ${typeName(c)}.`, "nomethod");
    }
    callSuper(ctx, name, args) {
      const owner = ctx.fnOwner;
      const base = owner && owner.baseCls;
      for (let c = base; c; c = c.baseCls) if (c.funcs[name]) return this.callUser(ctx.self, Object.assign(c.funcs[name], { owner: c }), args);
      if (ctx.self && builtinMethod(ctx.self, name)) return this.callBuiltinMethod(ctx.self, name, args);
      return null; // у встроенных _ready/_init и т.п. тела нет
    }
    callUser(self, fn, args, closure, lambdaCtx) {
      if (++this.depth > MAX_DEPTH) throw this.err("Stack overflow (stack size: 1024). Check for infinite recursion in your script.", "stack");
      const env = new Env(closure || null);
      const ps = fn.params;
      const required = ps.filter((p) => !p.def).length;
      const nm = fn.name || "<anonymous lambda>";
      if (args.length < required) throw this.err(`Too few arguments for "${nm}()" call. Expected at least ${required} but received ${args.length}.`, "args");
      if (args.length > ps.length) throw this.err(`Too many arguments for "${nm}()" call. Expected at most ${ps.length} but received ${args.length}.`, "args");
      const ctx = lambdaCtx ? Object.assign({}, lambdaCtx, { env }) : { self, cls: fn.owner || (self && self.cls), env, fnOwner: fn.owner };
      ps.forEach((p, i) => {
        let v = i < args.length ? args[i] : this.eval(p.def, ctx);
        if (p.type) { try { v = this.coerce(v, p.type); } catch (err) { throw this.err(`Invalid type in function '${nm}'. The value of argument ${i + 1} is of type '${typeName(v)}' but expected '${p.type}'.`, "assign"); } env.types.set(p.name, p.type); }
        env.vars.set(p.name, v);
      });
      const saveLine = this.line;
      const r = this.execBlock(fn.body, ctx);
      this.depth--;
      this.line = saveLine;
      let ret = r && r.c === "return" ? r.v : null;
      if (fn.ret && fn.ret !== "void" && ret !== null) ret = this.coerce(ret, fn.ret);
      return ret;
    }
    callStatic(cls, fn, args) { return this.callUser(null, Object.assign(fn, { owner: cls }), args); }
    callCallable(c, args) {
      args = c.bound.length ? args.concat(c.bound) : args;
      if (c.kind === "lambda") return this.callUser(c.self, c.fn, args, c.env, { self: c.self, cls: c.cls });
      if (c.kind === "method") return this.callMethod(c.obj, c.name, args);
      if (c.kind === "static") return this.callStatic(c.cls, c.cls.funcs[c.name], args);
      if (c.kind === "builtin") return BUILTIN_FUNCS[c.name](this, args, {});
      throw this.err("Bad callable");
    }
    callMethod(obj, name, args, ctx, srcExpr) {
      if (obj === null || obj === undefined) throw this.err(`Cannot call method '${name}' on a null value.`, "null");
      if (obj instanceof GdObject) {
        if (obj.freed) throw this.err(`Cannot call method '${name}' on a previously freed instance.`, "freed");
        const m = findMethod(obj, name);
        if (m) return this.callUser(obj, m, args);
        if (builtinMethod(obj, name)) return this.callBuiltinMethod(obj, name, args);
        const p = obj.props.get(name);
        if (p instanceof Callable) return this.callCallable(p, args);
        throw this.err(`Invalid call. Nonexistent function '${name}' in base '${typeName(obj)}'.`, "nomethod");
      }
      if (obj instanceof ClassRef) {
        if (name === "new") {
          if (obj.cls) return this.instantiate(obj.cls, args);
          if (BUILTIN[obj.name]) return this.newBuiltin(obj.name);
          throw this.err(`Тип ${obj.name} нельзя создать через new().`, "nomethod");
        }
        if (obj.cls) for (let c = obj.cls; c; c = c.baseCls) if (c.funcs[name]) {
          if (!c.funcs[name].static) throw this.err(`Cannot call non-static function "${name}()" on the class "${obj.name}" directly. Make an instance instead.`, "nomethod");
          return this.callStatic(c, c.funcs[name], args);
        }
        const sm = STATIC_METHODS[obj.name] && STATIC_METHODS[obj.name][name];
        if (sm) return sm(this, args);
        throw this.err(`Static function "${name}()" not found in base "${obj.name}".`, "nomethod");
      }
      if (obj instanceof Callable) {
        if (name === "call") return this.callCallable(obj, args);
        if (name === "callv") return this.callCallable(obj, args[0]);
        if (name === "bind") { const c = Object.assign(Object.create(Callable.prototype), obj); c.bound = args.concat(obj.bound); return c; }
        if (name === "is_valid") return !(obj.obj && obj.obj.freed);
        if (name === "get_method") return obj.name || "<anonymous lambda>";
      }
      if (obj instanceof Signal) return this.signalMethod(obj, name, args);
      if (obj instanceof EnumRef) {
        const E = { keys: () => Object.keys(obj.map), values: () => Object.values(obj.map), size: () => BigInt(Object.keys(obj.map).length), has: () => args[0] in obj.map, find_key: () => { const k = Object.keys(obj.map).find((x) => obj.map[x] === args[0]); return k === undefined ? null : k; } };
        if (E[name]) return E[name]();
      }
      const table = typeof obj === "string" ? STRING_M : Array.isArray(obj) ? ARRAY_M : obj instanceof Map ? DICT_M : obj instanceof Vec ? VEC_M : obj instanceof Color ? COLOR_M : isNum(obj) ? NUM_M : null;
      if (table && table[name]) {
        const r = table[name](this, obj, args);
        // Vector2/Color — значения; методы их не меняют.
        return r;
      }
      throw this.err(`Invalid call. Nonexistent function '${name}' in base '${typeName(obj)}'.`, "nomethod");
    }
    signalMethod(sg, name, args) {
      const list = sg.obj.conns.get(sg.name);
      switch (name) {
        case "connect": {
          const c = args[0];
          if (!(c instanceof Callable)) throw this.err("connect() ждёт функцию (Callable): имя функции без скобок или func(...).", "types");
          if (list.some((x) => eq(x.c, c))) throw this.err(`Signal '${sg.name}' is already connected to given callable.`, "args");
          list.push({ c, once: args[1] != null && (Number(args[1]) & 4) !== 0 }); return 0n;
        }
        case "disconnect": { const i = list.findIndex((x) => eq(x.c, args[0])); if (i < 0) throw this.err("Attempt to disconnect a nonexistent connection.", "args"); list.splice(i, 1); return null; }
        case "is_connected": return list.some((x) => eq(x.c, args[0]));
        case "emit": this.emit(sg.obj, sg.name, args); return null;
        case "get_connections": return list.map((x) => new Map([["callable", x.c], ["signal", sg]]));
        case "get_name": return sg.name;
      }
      throw this.err(`Invalid call. Nonexistent function '${name}' in base 'Signal'.`, "nomethod");
    }
    emit(obj, name, args) {
      const list = obj.conns.get(name);
      if (!list) throw this.err(`Signal "${name}" not found.`, "undeclared");
      for (const x of list.slice()) {
        if (x.once) list.splice(list.indexOf(x), 1);
        if (x.c.obj && x.c.obj.freed) continue;
        this.callCallable(x.c, args);
      }
    }

    convert(name, a) {
      const v = a[0];
      switch (name) {
        case "int":
          if (a.length === 0) return 0n;
          if (isInt(v)) return v; if (isFloat(v)) { if (!isFinite(v)) return 0n; return BigInt(Math.trunc(v)); }
          if (typeof v === "boolean") return v ? 1n : 0n;
          if (typeof v === "string") { const m = /^\s*[-+]?\d+/.exec(v.replace(/_/g, "")); return m ? BigInt(m[0].trim()) : 0n; }
          break;
        case "float":
          if (a.length === 0) return 0.0;
          if (isNum(v)) return toF(v); if (typeof v === "boolean") return v ? 1 : 0;
          if (typeof v === "string") { const f = parseFloat(v); return isNaN(f) ? 0 : f; }
          break;
        case "bool": return a.length ? truthy(v) : false;
        case "str": return a.map((x) => str(x)).join("");
        case "String": return a.length ? str(v) : "";
        case "Array": return a.length ? (Array.isArray(v) ? v.slice() : [v]) : [];
        case "Dictionary": return a.length ? new Map(v) : new Map();
        case "Vector2": case "Vector2i": case "Vector3": case "Vector3i": {
          const n = name.startsWith("Vector2") ? 2 : 3, isI = name.endsWith("i");
          if (a.length === 0) return new Vec(new Array(n).fill(0), name);
          if (a.length === 1 && v instanceof Vec) return new Vec(v.c.map((x) => (isI ? Math.trunc(x) : x)), name);
          if (a.length !== n || !a.every(isNum)) throw this.err(`No constructor of "${name}" matches the signature "${name}(${a.map(typeName).join(", ")})".`, "args");
          return new Vec(a.map((x) => (isI ? Math.trunc(toF(x)) : toF(x))), name);
        }
        case "Color":
          if (typeof v === "string") return parseColor(this, v);
          if (a.length >= 3) return new Color(toF(a[0]), toF(a[1]), toF(a[2]), a[3] != null ? toF(a[3]) : 1);
          if (a.length === 0) return new Color(0, 0, 0, 1);
          break;
      }
      throw this.err(`Cannot convert ${typeName(v)} to ${name}.`, "types");
    }

    // ----- Узлы и дерево -----
    callBuiltinMethod(o, name, args) { return builtinMethod(o, name)(this, o, args); }
    getNode(from, path, dollar) {
      if (!from) throw this.err("$ работает только внутри узла.", "null");
      let n = from;
      let parts = path.split("/");
      if (path.startsWith("/")) { n = this.root; parts = parts.slice(2); }
      for (const p of parts) {
        if (p === "" || p === ".") continue;
        if (p === "..") { n = n.parent; if (!n) break; continue; }
        n = n.children.find((c) => c.props.get("name") === p && !c.freed) || null;
        if (!n) break;
      }
      if (!n) {
        if (dollar === "or_null") return null;
        throw this.err(`Node not found: "${path}" (relative to "${from.props.get("name")}").`, "null");
      }
      return n;
    }
    addChild(parent, child, readable) {
      if (!isNodeObj(child)) throw this.err("add_child() принимает только узлы (Node).", "types");
      if (child.parent) throw this.err(`Can't add child '${child.props.get("name")}' to '${parent.props.get("name")}', already has a parent '${child.parent.props.get("name")}'.`, "args");
      const base = child.props.get("name") || (child.cls && child.cls.className) || child.builtin;
      const taken = (x) => parent.children.some((c) => c.props.get("name") === x);
      let nm = base;
      if (!child.props.get("name") || taken(nm)) {
        // Как в Godot: без add_child(узел, true) имя получается служебным, вида @Node2D@2
        if (readable) { if (taken(nm)) { let k = 2; while (taken(base + k)) k++; nm = base + k; } }
        else { do { nm = "@" + base + "@" + (this.autoName = (this.autoName || 1) + 1); } while (taken(nm)); }
      }
      child.props.set("name", nm);
      child.parent = parent; parent.children.push(child);
      if (parent.inTree) this.enterTree(child);
    }
    enterTree(n) {
      n.inTree = true;
      const et = findMethod(n, "_enter_tree"); if (et) this.callUser(n, et, []);
      this.emit(n, "tree_entered", []);
      for (const c of n.children.slice()) this.enterTree(c);
      if (!n.isReady) {
        n.isReady = true;
        if (n.onready) for (const [v, c] of n.onready) {
          this.line = v.line;
          let val = this.eval(v.expr, { self: n, cls: c, env: new Env(null) });
          if (v.infer) n.types.set(v.name, typeName(val));
          n.props.set(v.name, this.coerce(val, n.types.get(v.name), v.name));
        }
        const r = findMethod(n, "_ready"); if (r) this.callUser(n, r, []);
        this.emit(n, "ready", []);
      }
      if (n.builtin === "Timer" && n.props.get("autostart")) this.timerStart(n, null);
    }
    exitTree(n) {
      for (const c of n.children.slice()) this.exitTree(c);
      const ex = findMethod(n, "_exit_tree"); if (ex) this.callUser(n, ex, []);
      this.emit(n, "tree_exiting", []);
      n.inTree = false;
    }
    free(n) {
      if (n.freed) return;
      if (n.inTree) this.exitTree(n);
      if (n.parent) { const p = n.parent; p.children.splice(p.children.indexOf(n), 1); n.parent = null; }
      const all = []; const walk = (x) => { all.push(x); x.children.forEach(walk); }; walk(n);
      all.forEach((x) => { x.freed = true; });
    }
    walkTree(fn) { const w = (n) => { if (n.freed) return; fn(n); n.children.slice().forEach(w); }; w(this.root); }
    timerStart(t, time) {
      if (time != null && toF(time) > 0) t.props.set("wait_time", toF(time));
      t.props.set("time_left", toF(t.props.get("wait_time")));
      t.running = true;
    }
    pressed(action, frame) {
      const p = this.opts.press[action];
      if (!p) return false;
      return p.some(([a, b]) => frame >= a && frame <= b);
    }
    justPressed(action, frame) { return this.pressed(action, frame) && !this.pressed(action, frame - 1); }

    // ----- Запуск программы -----
    run(src) {
      CUR = this;
      const main = parse(src);
      this.linkClass(main, null);
      const reg = (c) => { if (c.className) this.globalClasses[c.className] = c; for (const k in c.inner) reg(c.inner[k]); };
      reg(main);
      const initStatics = (c) => { c.staticVals = {}; for (const v of c.vars) if (v.static) { this.line = v.line; c.staticVals[v.name] = v.expr ? this.evalIn(v.expr, c) : (v.type ? defaultFor(v.type) : null); } for (const k in c.inner) initStatics(c.inner[k]); };
      this.resolveBase(main);
      const resolveAll = (c) => { this.resolveBase(c); for (const k in c.inner) resolveAll(c.inner[k]); };
      resolveAll(main);
      initStatics(main);
      // корень дерева
      this.root = this.newBuiltin("Node"); this.root.props.set("name", "root"); this.root.inTree = true; this.root.isReady = true;
      this.tree = this.newBuiltin("SceneTree");
      const obj = this.instantiate(main, []);
      this.main = obj;
      if (!isNodeObj(obj)) return;
      obj.props.set("name", this.opts.name || (main.className || "Main"));
      this.addChild(this.root, obj, true);
      // кадры
      let any = false;
      this.walkTree((n) => { if (findMethod(n, "_process") || findMethod(n, "_physics_process") || n.builtin === "Timer") any = true; });
      if (!any || this.quitting) return;
      const delta = this.opts.delta;
      for (let f = 1; f <= this.opts.frames && !this.quitting; f++) {
        this.frame = f; this.time += delta;
        this.walkTree((n) => { const m = findMethod(n, "_physics_process"); if (m && n.inTree && !this.quitting) this.callUser(n, m, [delta]); });
        this.walkTree((n) => { const m = findMethod(n, "_process"); if (m && n.inTree && !this.quitting) this.callUser(n, m, [delta]); });
        this.walkTree((n) => {
          if (n.builtin === "Timer" && n.running && !n.props.get("paused")) {
            const left = n.props.get("time_left") - delta;
            if (left <= 1e-9) {
              if (n.props.get("one_shot")) { n.running = false; n.props.set("time_left", 0.0); } else n.props.set("time_left", left + toF(n.props.get("wait_time")));
              this.emit(n, "timeout", []);
            } else n.props.set("time_left", left);
          }
        });
        const q = []; this.walkTree((n) => { if (n.queued) q.push(n); });
        q.forEach((n) => this.free(n));
      }
    }
  }

  function scopeClasses(cls) {
    const out = [];
    for (let o = cls; o; o = o.outer) for (let c = o; c; c = c.baseCls) if (!out.includes(c)) out.push(c);
    return out;
  }
  function defaultFor(type) {
    const t = type.replace(/\[.*$/, "");
    switch (t) {
      case "int": return 0n; case "float": return 0.0; case "bool": return false; case "String": case "StringName": return "";
      case "Array": return []; case "Dictionary": return new Map();
      case "Vector2": return vec2(0, 0); case "Vector2i": return new Vec([0, 0], "Vector2i");
      case "Vector3": return new Vec([0, 0, 0], "Vector3"); case "Vector3i": return new Vec([0, 0, 0], "Vector3i");
      case "Color": return new Color(0, 0, 0, 1);
    }
    return null;
  }
  function builtinPropType(o, name) {
    const v = o.props.get(name);
    if (o.types.has(name)) return o.types.get(name);
    if (v === null || v === undefined) return null;
    if (o.cls) for (let c = o.cls; c; c = c.baseCls) if (c.vars.some((x) => x.name === name)) return null;
    return typeName(v);
  }
  function parseColor(r, s) {
    const named = { red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1], white: [1, 1, 1], black: [0, 0, 0], yellow: [1, 1, 0] };
    if (named[s.toLowerCase()]) return new Color(...named[s.toLowerCase()], 1);
    const h = s.replace(/^#/, "");
    if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) throw r.err(`Invalid color code: ${s}`, "types");
    const n = (i) => parseInt(h.substr(i, 2), 16) / 255;
    return new Color(n(0), n(2), n(4), h.length === 8 ? n(6) : 1);
  }

  // ===================== Встроенные функции =====================
  const num = (r, v, fn) => { if (!isNum(v)) throw r.err(`Invalid type in utility function '${fn}()'. Cannot convert argument 1 from ${typeName(v)} to float.`, "types"); return toF(v); };
  const keepInt = (a, f) => (isInt(a) ? BigInt(f(Number(a))) : f(a));
  function nextRand(r) { r.rng ^= r.rng << 13; r.rng ^= r.rng >>> 17; r.rng ^= r.rng << 5; return (r.rng >>> 0) / 4294967296; }
  const BUILTIN_FUNCS = {
    print: (r, a) => { r.print(a.map((x) => str(x)).join("")); return null; },
    prints: (r, a) => { r.print(a.map((x) => str(x)).join(" ")); return null; },
    printt: (r, a) => { r.print(a.map((x) => str(x)).join("\t")); return null; },
    print_rich: (r, a) => { r.print(a.map((x) => str(x)).join("").replace(/\[\/?[a-z_]+(=[^\]]*)?\]/g, "")); return null; },
    printerr: (r, a) => { r.print(a.map((x) => str(x)).join("")); return null; },
    push_error: (r, a) => { r.print("ОШИБКА: " + a.map((x) => str(x)).join("")); return null; },
    push_warning: (r, a) => { r.print("ПРЕДУПРЕЖДЕНИЕ: " + a.map((x) => str(x)).join("")); return null; },
    len: (r, a) => {
      const v = a[0];
      if (typeof v === "string") return BigInt([...v].length);
      if (Array.isArray(v)) return BigInt(v.length);
      if (v instanceof Map) return BigInt(v.size);
      throw r.err(`Invalid type in utility function 'len()'. Cannot get length of value of type ${typeName(v)}.`, "types");
    },
    range: (r, a) => {
      if (!a.every(isNum)) throw r.err("range() принимает только числа.", "types");
      const n = a.map((x) => (isInt(x) ? x : BigInt(Math.trunc(x))));
      let [s, e, st] = n.length === 1 ? [0n, n[0], 1n] : [n[0], n[1], n[2] != null ? n[2] : 1n];
      if (st === 0n) throw r.err("Step argument is zero!", "args");
      const out = [];
      for (let i = s; st > 0n ? i < e : i > e; i += st) { out.push(i); if (out.length > 1e6) throw r.err("Слишком большой range.", "loop"); }
      return out;
    },
    abs: (r, a) => keepInt(a[0], Math.abs), absi: (r, a) => (a[0] < 0n ? -a[0] : a[0]), absf: (r, a) => Math.abs(num(r, a[0], "absf")),
    sign: (r, a) => keepInt(a[0], Math.sign), signi: (r, a) => (a[0] > 0n ? 1n : a[0] < 0n ? -1n : 0n), signf: (r, a) => Math.sign(num(r, a[0], "signf")),
    min: (r, a) => a.reduce((m, x) => (r.binop("<", x, m) ? x : m)),
    max: (r, a) => a.reduce((m, x) => (r.binop(">", x, m) ? x : m)),
    mini: (r, a) => a.reduce((m, x) => (x < m ? x : m)), maxi: (r, a) => a.reduce((m, x) => (x > m ? x : m)),
    minf: (r, a) => Math.min(...a.map(toF)), maxf: (r, a) => Math.max(...a.map(toF)),
    clamp: (r, a) => (r.binop("<", a[0], a[1]) ? a[1] : r.binop(">", a[0], a[2]) ? a[2] : a[0]),
    clampi: (r, a) => (a[0] < a[1] ? a[1] : a[0] > a[2] ? a[2] : a[0]),
    clampf: (r, a) => Math.min(Math.max(toF(a[0]), toF(a[1])), toF(a[2])),
    floor: (r, a) => keepInt(a[0], Math.floor), ceil: (r, a) => keepInt(a[0], Math.ceil), round: (r, a) => keepInt(a[0], (x) => Math.sign(x) * Math.round(Math.abs(x))),
    floori: (r, a) => BigInt(Math.floor(toF(a[0]))), ceili: (r, a) => BigInt(Math.ceil(toF(a[0]))), roundi: (r, a) => BigInt(Math.sign(toF(a[0])) * Math.round(Math.abs(toF(a[0])))),
    floorf: (r, a) => Math.floor(toF(a[0])), ceilf: (r, a) => Math.ceil(toF(a[0])), roundf: (r, a) => Math.sign(toF(a[0])) * Math.round(Math.abs(toF(a[0]))),
    sqrt: (r, a) => Math.sqrt(num(r, a[0], "sqrt")), pow: (r, a) => Math.pow(toF(a[0]), toF(a[1])),
    sin: (r, a) => Math.sin(toF(a[0])), cos: (r, a) => Math.cos(toF(a[0])), tan: (r, a) => Math.tan(toF(a[0])), atan2: (r, a) => Math.atan2(toF(a[0]), toF(a[1])),
    exp: (r, a) => Math.exp(toF(a[0])), log: (r, a) => Math.log(toF(a[0])),
    fmod: (r, a) => toF(a[0]) % toF(a[1]),
    posmod: (r, a) => { const b = a[1]; if (b === 0n) throw r.err("Modulo by zero error in operator '%'.", "zero"); const m = a[0] % b; return (m < 0n) !== (b < 0n) && m !== 0n ? m + b : m; },
    fposmod: (r, a) => { const x = toF(a[0]), y = toF(a[1]); const m = x % y; return m < 0 !== y < 0 && m !== 0 ? m + y : m; },
    snapped: (r, a) => { const x = toF(a[0]), s = toF(a[1]); const v = s === 0 ? x : Math.floor(x / s + 0.5) * s; return isInt(a[0]) && isInt(a[1]) ? BigInt(Math.round(v)) : parseFloat(v.toPrecision(12)); },
    lerp: (r, a) => { if (a[0] instanceof Vec) return VEC_M.lerp(r, a[0], [a[1], a[2]]); const x = toF(a[0]), y = toF(a[1]), t = toF(a[2]); return x + (y - x) * t; },
    lerpf: (r, a) => toF(a[0]) + (toF(a[1]) - toF(a[0])) * toF(a[2]),
    inverse_lerp: (r, a) => (toF(a[2]) - toF(a[0])) / (toF(a[1]) - toF(a[0])),
    remap: (r, a) => { const [v, i0, i1, o0, o1] = a.map(toF); return o0 + (o1 - o0) * ((v - i0) / (i1 - i0)); },
    move_toward: (r, a) => { const [f, t, d] = a.map(toF); return Math.abs(t - f) <= d ? t : f + Math.sign(t - f) * d; },
    wrapi: (r, a) => { const [v, lo, hi] = a; const rg = hi - lo; if (rg === 0n) return lo; let m = (v - lo) % rg; if (m < 0n) m += rg; return lo + m; },
    wrapf: (r, a) => { const [v, lo, hi] = a.map(toF); const rg = hi - lo; if (rg === 0) return lo; return v - rg * Math.floor((v - lo) / rg); },
    deg_to_rad: (r, a) => toF(a[0]) * Math.PI / 180, rad_to_deg: (r, a) => toF(a[0]) * 180 / Math.PI,
    is_equal_approx: (r, a) => Math.abs(toF(a[0]) - toF(a[1])) < 1e-5, is_zero_approx: (r, a) => Math.abs(toF(a[0])) < 1e-5,
    is_nan: (r, a) => Number.isNaN(toF(a[0])), is_inf: (r, a) => !isFinite(toF(a[0])) && !Number.isNaN(toF(a[0])),
    randi: (r) => BigInt(Math.floor(nextRand(r) * 4294967296)),
    randf: (r) => nextRand(r),
    randi_range: (r, a) => { let lo = Number(a[0]), hi = Number(a[1]); if (lo > hi) [lo, hi] = [hi, lo]; return BigInt(lo + Math.floor(nextRand(r) * (hi - lo + 1))); },
    randf_range: (r, a) => toF(a[0]) + nextRand(r) * (toF(a[1]) - toF(a[0])),
    randomize: (r) => { r.rng = (Date.now() & 0x7fffffff) | 1; return null; },
    seed: (r, a) => { r.rng = (Number(BigInt.asUintN(32, a[0] * 2654435761n)) | 1); return null; },
    typeof: (r, a) => typeId(a[0]),
    type_string: (r, a) => Object.keys(TYPE_IDS).find((k) => BigInt(TYPE_IDS[k]) === a[0]) || "Object",
    is_instance_valid: (r, a) => a[0] instanceof GdObject && !a[0].freed,
    is_same: (r, a) => a[0] === a[1],
    assert: (r, a) => { if (!truthy(a[0])) throw r.err("Assertion failed" + (a[1] ? ": " + str(a[1]) : "."), "assert"); return null; },
    char: (r, a) => String.fromCodePoint(Number(a[0])),
    var_to_str: (r, a) => str(a[0], true),
    instance_from_id: () => null,
    hash: (r, a) => { let h = 5381; for (const ch of str(a[0], true)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return BigInt(h); },
    get_stack: () => [],
    print_debug: (r, a) => { r.print(a.map((x) => str(x)).join("")); return null; },
  };
  const BUILTIN_TYPES = new Set(["int", "float", "bool", "String", "StringName", "Array", "Dictionary", "Vector2", "Vector2i", "Vector3", "Vector3i", "Color", "Callable", "Signal", "Variant", "NodePath", "PackedScene", "Texture2D", "AudioStream", "Input", "Time", "OS", "Engine", "JSON"]);

  const GLOBALS = {
    PI: () => Math.PI, TAU: () => Math.PI * 2, INF: () => Infinity, NAN: () => NaN,
    Input: (r) => r.inputRef || (r.inputRef = new ClassRef("Input", null)),
    OK: () => 0n, FAILED: () => 1n, ERR_UNAVAILABLE: () => 2n,
    CONNECT_ONE_SHOT: () => 4n, CONNECT_DEFERRED: () => 1n,
    KEY_SPACE: () => 32n, KEY_ENTER: () => 4194309n, KEY_ESCAPE: () => 4194305n,
    MOUSE_BUTTON_LEFT: () => 1n, MOUSE_BUTTON_RIGHT: () => 2n,
  };
  for (const k in TYPE_IDS) GLOBALS["TYPE_" + (k === "null" ? "NIL" : k.replace(/([a-z])([A-Z0-9])/g, "$1_$2").replace(/(\d)([a-z])/g, "$1_$2").toUpperCase())] = () => BigInt(TYPE_IDS[k]);

  const V = (x, y) => () => vec2(x, y);
  const V3 = (x, y, z) => () => new Vec([x, y, z], "Vector3");
  const STATIC_CONSTS = {
    Vector2: { ZERO: V(0, 0), ONE: V(1, 1), UP: V(0, -1), DOWN: V(0, 1), LEFT: V(-1, 0), RIGHT: V(1, 0), INF: V(Infinity, Infinity) },
    Vector2i: { ZERO: () => new Vec([0, 0], "Vector2i"), ONE: () => new Vec([1, 1], "Vector2i"), UP: () => new Vec([0, -1], "Vector2i"), DOWN: () => new Vec([0, 1], "Vector2i"), LEFT: () => new Vec([-1, 0], "Vector2i"), RIGHT: () => new Vec([1, 0], "Vector2i") },
    Vector3: { ZERO: V3(0, 0, 0), ONE: V3(1, 1, 1), UP: V3(0, 1, 0), DOWN: V3(0, -1, 0), LEFT: V3(-1, 0, 0), RIGHT: V3(1, 0, 0), FORWARD: V3(0, 0, -1), BACK: V3(0, 0, 1) },
    Color: { RED: () => new Color(1, 0, 0, 1), GREEN: () => new Color(0, 1, 0, 1), BLUE: () => new Color(0, 0, 1, 1), WHITE: () => new Color(1, 1, 1, 1), BLACK: () => new Color(0, 0, 0, 1), YELLOW: () => new Color(1, 1, 0, 1), TRANSPARENT: () => new Color(1, 1, 1, 0), GRAY: () => new Color(0.745098, 0.745098, 0.745098, 1), ORANGE: () => new Color(1, 0.647059, 0, 1) },
    Timer: { TIMER_PROCESS_CALLBACK_IDLE: () => 1n },
  };
  const STATIC_METHODS = {
    Input: {
      is_action_pressed: (r, a) => r.pressed(a[0], r.frame),
      is_action_just_pressed: (r, a) => r.justPressed(a[0], r.frame),
      is_action_just_released: (r, a) => !r.pressed(a[0], r.frame) && r.pressed(a[0], r.frame - 1),
      get_action_strength: (r, a) => (r.pressed(a[0], r.frame) ? 1.0 : 0.0),
      get_axis: (r, a) => (r.pressed(a[1], r.frame) ? 1.0 : 0.0) - (r.pressed(a[0], r.frame) ? 1.0 : 0.0),
      get_vector: (r, a) => {
        const x = (r.pressed(a[1], r.frame) ? 1 : 0) - (r.pressed(a[0], r.frame) ? 1 : 0);
        const y = (r.pressed(a[3], r.frame) ? 1 : 0) - (r.pressed(a[2], r.frame) ? 1 : 0);
        const l = Math.hypot(x, y); return l > 1 ? vec2(x / l, y / l) : vec2(x, y);
      },
      is_key_pressed: () => false, is_mouse_button_pressed: () => false,
    },
    String: { num: (r, a) => (a[1] != null ? String(parseFloat(toF(a[0]).toFixed(Number(a[1])))) : fmtFloat(toF(a[0]))), num_int64: (r, a) => a[0].toString(), chr: (r, a) => String.fromCodePoint(Number(a[0])) },
    Color: { html: (r, a) => parseColor(r, a[0]), from_hsv: (r, a) => { const [h, s, v] = a.map(toF); const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); const m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6]; return new Color(m[0], m[1], m[2], a[3] != null ? toF(a[3]) : 1); } },
    Time: { get_ticks_msec: (r) => BigInt(Math.round(r.time * 1000)), get_unix_time_from_system: () => 1767225600.0 },
    JSON: {
      stringify: (r, a) => {
        const sort = a[2] !== false; // как в Godot: ключи сортируются по умолчанию
        const conv = (v) => {
          if (v instanceof Map) { let e = [...v].map(([k, x]) => [str(k), conv(x)]); if (sort) e.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0)); return Object.fromEntries(e); }
          if (Array.isArray(v)) return v.map(conv);
          if (isInt(v)) return Number(v);
          if (v instanceof Vec || v instanceof Color) return str(v);
          if (v instanceof GdObject) return str(v);
          return v;
        };
        return JSON.stringify(conv(a[0]), null, a[1] ? String(a[1]) : undefined);
      },
      parse_string: (r, a) => { const conv = (v) => (Array.isArray(v) ? v.map(conv) : v && typeof v === "object" ? new Map(Object.entries(v).map(([k, x]) => [k, conv(x)])) : v); try { return conv(JSON.parse(a[0])); } catch (e) { return null; } },
    },
  };

  // ----- Методы строк -----
  const chars = (s) => [...s];
  const STRING_M = {
    length: (r, s) => BigInt(chars(s).length),
    is_empty: (r, s) => s.length === 0,
    to_upper: (r, s) => s.toUpperCase(), to_lower: (r, s) => s.toLowerCase(),
    capitalize: (r, s) => s.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").split(" ").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" "),
    begins_with: (r, s, a) => s.startsWith(a[0]), ends_with: (r, s, a) => s.endsWith(a[0]),
    contains: (r, s, a) => s.includes(a[0]), containsn: (r, s, a) => s.toLowerCase().includes(a[0].toLowerCase()),
    find: (r, s, a) => BigInt(s.indexOf(a[0], a[1] != null ? Number(a[1]) : 0)), rfind: (r, s, a) => BigInt(s.lastIndexOf(a[0])),
    findn: (r, s, a) => BigInt(s.toLowerCase().indexOf(a[0].toLowerCase())),
    count: (r, s, a) => BigInt(a[0] ? s.split(a[0]).length - 1 : 0),
    replace: (r, s, a) => s.split(a[0]).join(a[1]),
    split: (r, s, a) => { let parts = a.length && a[0] !== "" ? s.split(a[0]) : chars(s); if (a[1] === false) parts = parts.filter((x) => x !== ""); return parts; },
    split_floats: (r, s, a) => s.split(a[0]).map(parseFloat),
    substr: (r, s, a) => { const c = chars(s); const from = Number(a[0]), len = a[1] != null && Number(a[1]) >= 0 ? Number(a[1]) : c.length; return c.slice(from, from + len).join(""); },
    left: (r, s, a) => { const c = chars(s), n = Number(a[0]); return (n >= 0 ? c.slice(0, n) : c.slice(0, c.length + n)).join(""); },
    right: (r, s, a) => { const c = chars(s), n = Number(a[0]); return (n >= 0 ? c.slice(Math.max(0, c.length - n)) : c.slice(-n)).join(""); },
    strip_edges: (r, s) => s.trim(), lstrip: (r, s, a) => s.replace(new RegExp("^[" + a[0].replace(/[\]\\^-]/g, "\\$&") + "]+"), ""), rstrip: (r, s, a) => s.replace(new RegExp("[" + a[0].replace(/[\]\\^-]/g, "\\$&") + "]+$"), ""),
    trim_prefix: (r, s, a) => (s.startsWith(a[0]) ? s.slice(a[0].length) : s), trim_suffix: (r, s, a) => (s.endsWith(a[0]) ? s.slice(0, -a[0].length) : s),
    repeat: (r, s, a) => s.repeat(Number(a[0])), reverse: (r, s) => chars(s).reverse().join(""),
    to_int: (r, s) => r.convert("int", [s]), to_float: (r, s) => r.convert("float", [s]),
    is_valid_int: (r, s) => /^[+-]?\d+$/.test(s), is_valid_float: (r, s) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s),
    join: (r, s, a) => a[0].map((x) => str(x)).join(s),
    insert: (r, s, a) => { const c = chars(s); c.splice(Number(a[0]), 0, a[1]); return c.join(""); },
    unicode_at: (r, s, a) => BigInt(chars(s)[Number(a[0])].codePointAt(0)),
    pad_zeros: (r, s, a) => { const n = Number(a[0]); const m = /^(-?)(\d*)(.*)$/.exec(s); return m[1] + m[2].padStart(n, "0") + m[3]; },
    pad_decimals: (r, s, a) => toF(parseFloat(s)).toFixed(Number(a[0])),
    lpad: (r, s, a) => s.padStart(Number(a[0]), a[1] != null ? a[1] : " "), rpad: (r, s, a) => s.padEnd(Number(a[0]), a[1] != null ? a[1] : " "),
    format: (r, s, a) => {
      const v = a[0];
      if (v instanceof Map) return s.replace(/\{(\w+)\}/g, (m, k) => (mapHas(v, k) ? str(mapGet(v, k)) : m));
      if (Array.isArray(v)) return s.replace(/\{(\d+)\}/g, (m, k) => (+k < v.length ? str(v[+k]) : m));
      throw r.err("format() ждёт словарь или массив.", "types");
    },
    md5_text: (r, s) => s, sha256_text: (r, s) => s,
    get_slice: (r, s, a) => s.split(a[0])[Number(a[1])] || "",
    is_valid_identifier: (r, s) => /^[A-Za-z_]\w*$/.test(s),
    hash: (r, s) => BUILTIN_FUNCS.hash(r, [s]),
  };
  // ----- Методы массивов -----
  const cb = (r, c, args) => r.callCallable(c, args);
  const ARRAY_M = {
    size: (r, a) => BigInt(a.length), is_empty: (r, a) => a.length === 0,
    append: (r, a, x) => { a.push(x[0]); return null; }, push_back: (r, a, x) => { a.push(x[0]); return null; },
    push_front: (r, a, x) => { a.unshift(x[0]); return null; }, append_array: (r, a, x) => { a.push(...x[0]); return null; },
    pop_back: (r, a) => (a.length ? a.pop() : null), pop_front: (r, a) => (a.length ? a.shift() : null),
    pop_at: (r, a, x) => a.splice(r.arrIndex(a, x[0]), 1)[0],
    insert: (r, a, x) => { const i = Number(x[0]); if (i < 0 || i > a.length) throw r.err(`Index ${i} out of bounds.`, "index"); a.splice(i, 0, x[1]); return 0n; },
    remove_at: (r, a, x) => { a.splice(r.arrIndex(a, x[0]), 1); return null; },
    erase: (r, a, x) => { const i = a.findIndex((y) => eq(y, x[0])); if (i >= 0) a.splice(i, 1); return null; },
    clear: (r, a) => { a.length = 0; return null; },
    has: (r, a, x) => a.some((y) => eq(y, x[0])),
    find: (r, a, x) => { for (let i = x[1] != null ? Number(x[1]) : 0; i < a.length; i++) if (eq(a[i], x[0])) return BigInt(i); return -1n; },
    rfind: (r, a, x) => { for (let i = a.length - 1; i >= 0; i--) if (eq(a[i], x[0])) return BigInt(i); return -1n; },
    count: (r, a, x) => BigInt(a.filter((y) => eq(y, x[0])).length),
    front: (r, a) => (a.length ? a[0] : (() => { throw r.err("Can't take value from empty array.", "index"); })()),
    back: (r, a) => (a.length ? a[a.length - 1] : (() => { throw r.err("Can't take value from empty array.", "index"); })()),
    sort: (r, a) => { a.sort((x, y) => (r.binop("<", x, y) ? -1 : r.binop(">", x, y) ? 1 : 0)); return null; },
    sort_custom: (r, a, x) => { a.sort((p, q) => (truthy(cb(r, x[0], [p, q])) ? -1 : truthy(cb(r, x[0], [q, p])) ? 1 : 0)); return null; },
    reverse: (r, a) => { a.reverse(); return null; },
    duplicate: (r, a, x) => (x[0] ? deepCopy(a) : a.slice()),
    slice: (r, a, x) => { const n = a.length; let b = Number(x[0]), e = x[1] != null ? Number(x[1]) : n; if (b < 0) b += n; if (e < 0) e += n; return a.slice(b, e); },
    map: (r, a, x) => a.map((v) => cb(r, x[0], [v])),
    filter: (r, a, x) => a.filter((v) => truthy(cb(r, x[0], [v]))),
    reduce: (r, a, x) => { let acc = x.length > 1 ? x[1] : a[0]; for (let i = x.length > 1 ? 0 : 1; i < a.length; i++) acc = cb(r, x[0], [acc, a[i]]); return acc; },
    any: (r, a, x) => a.some((v) => truthy(cb(r, x[0], [v]))), all: (r, a, x) => a.every((v) => truthy(cb(r, x[0], [v]))),
    max: (r, a) => (a.length ? BUILTIN_FUNCS.max(r, a) : null), min: (r, a) => (a.length ? BUILTIN_FUNCS.min(r, a) : null),
    pick_random: (r, a) => (a.length ? a[Math.floor(nextRand(r) * a.length)] : null),
    shuffle: (r, a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(nextRand(r) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return null; },
    fill: (r, a, x) => { a.fill(x[0]); return null; },
    resize: (r, a, x) => { const n = Number(x[0]); while (a.length < n) a.push(null); a.length = n; return 0n; },
    get: (r, a, x) => a[r.arrIndex(a, x[0])], set: (r, a, x) => { a[r.arrIndex(a, x[0], true)] = x[1]; return null; },
    hash: (r, a) => BUILTIN_FUNCS.hash(r, [a]),
  };
  // ----- Методы словарей -----
  const DICT_M = {
    size: (r, d) => BigInt(d.size), is_empty: (r, d) => d.size === 0,
    has: (r, d, a) => mapHas(d, a[0]), has_all: (r, d, a) => a[0].every((k) => mapHas(d, k)),
    keys: (r, d) => [...d.keys()], values: (r, d) => [...d.values()],
    erase: (r, d, a) => { const k = mapKey(d, a[0]); if (k === undefined) return false; d.delete(k); return true; },
    clear: (r, d) => { d.clear(); return null; },
    get: (r, d, a) => { const v = mapGet(d, a[0]); return v === undefined ? (a.length > 1 ? a[1] : null) : v; },
    get_or_add: (r, d, a) => { if (!mapHas(d, a[0])) mapSet(d, a[0], a[1]); return mapGet(d, a[0]); },
    set: (r, d, a) => { mapSet(d, a[0], a[1]); return true; },
    merge: (r, d, a) => { for (const [k, v] of a[0]) if (a[1] || !mapHas(d, k)) mapSet(d, k, v); return null; },
    merged: (r, d, a) => { const n = new Map(d); for (const [k, v] of a[0]) if (a[1] || !mapHas(n, k)) mapSet(n, k, v); return n; },
    duplicate: (r, d, a) => (a[0] ? deepCopy(d) : new Map(d)),
    find_key: (r, d, a) => { for (const [k, v] of d) if (eq(v, a[0])) return k; return null; },
    hash: (r, d) => BUILTIN_FUNCS.hash(r, [d]),
  };
  // ----- Методы векторов -----
  const vlen = (v) => Math.hypot(...v.c);
  const mkv = (v, c) => new Vec(c, v.kind.replace(/i$/, ""));
  const VEC_M = {
    length: (r, v) => vlen(v), length_squared: (r, v) => v.c.reduce((s, x) => s + x * x, 0),
    normalized: (r, v) => { const l = vlen(v); return mkv(v, v.c.map((x) => (l ? x / l : 0))); },
    is_normalized: (r, v) => Math.abs(vlen(v) - 1) < 1e-5,
    distance_to: (r, v, a) => Math.hypot(...v.c.map((x, i) => x - a[0].c[i])),
    distance_squared_to: (r, v, a) => v.c.reduce((s, x, i) => s + (x - a[0].c[i]) ** 2, 0),
    direction_to: (r, v, a) => VEC_M.normalized(r, mkv(v, a[0].c.map((x, i) => x - v.c[i]))),
    dot: (r, v, a) => v.c.reduce((s, x, i) => s + x * a[0].c[i], 0),
    cross: (r, v, a) => (v.c.length === 2 ? v.c[0] * a[0].c[1] - v.c[1] * a[0].c[0] : mkv(v, [v.c[1] * a[0].c[2] - v.c[2] * a[0].c[1], v.c[2] * a[0].c[0] - v.c[0] * a[0].c[2], v.c[0] * a[0].c[1] - v.c[1] * a[0].c[0]])),
    angle: (r, v) => Math.atan2(v.c[1], v.c[0]),
    angle_to_point: (r, v, a) => Math.atan2(a[0].c[1] - v.c[1], a[0].c[0] - v.c[0]),
    rotated: (r, v, a) => { const t = toF(a[0]), c = Math.cos(t), s = Math.sin(t); return mkv(v, [v.c[0] * c - v.c[1] * s, v.c[0] * s + v.c[1] * c]); },
    lerp: (r, v, a) => { const t = toF(a[1]); return mkv(v, v.c.map((x, i) => x + (a[0].c[i] - x) * t)); },
    move_toward: (r, v, a) => { const d = toF(a[1]); const diff = a[0].c.map((x, i) => x - v.c[i]); const l = Math.hypot(...diff); return l <= d || l < 1e-9 ? mkv(v, a[0].c.slice()) : mkv(v, v.c.map((x, i) => x + (diff[i] / l) * d)); },
    limit_length: (r, v, a) => { const m = a[0] != null ? toF(a[0]) : 1; const l = vlen(v); return l > m && l > 0 ? mkv(v, v.c.map((x) => (x / l) * m)) : v; },
    abs: (r, v) => new Vec(v.c.map(Math.abs), v.kind), floor: (r, v) => new Vec(v.c.map(Math.floor), v.kind), ceil: (r, v) => new Vec(v.c.map(Math.ceil), v.kind), round: (r, v) => new Vec(v.c.map((x) => Math.sign(x) * Math.round(Math.abs(x))), v.kind),
    sign: (r, v) => new Vec(v.c.map(Math.sign), v.kind),
    is_zero_approx: (r, v) => v.c.every((x) => Math.abs(x) < 1e-5), is_equal_approx: (r, v, a) => v.c.every((x, i) => Math.abs(x - a[0].c[i]) < 1e-5),
    clamp: (r, v, a) => new Vec(v.c.map((x, i) => Math.min(Math.max(x, a[0].c[i]), a[1].c[i])), v.kind),
    snapped: (r, v, a) => new Vec(v.c.map((x, i) => (a[0].c[i] ? Math.floor(x / a[0].c[i] + 0.5) * a[0].c[i] : x)), v.kind),
    max_axis_index: (r, v) => BigInt(v.c.indexOf(Math.max(...v.c))), min_axis_index: (r, v) => BigInt(v.c.indexOf(Math.min(...v.c))),
    aspect: (r, v) => v.c[0] / v.c[1],
  };
  const COLOR_M = {
    lerp: (r, c, a) => { const t = toF(a[1]), d = a[0]; return new Color(c.r + (d.r - c.r) * t, c.g + (d.g - c.g) * t, c.b + (d.b - c.b) * t, c.a + (d.a - c.a) * t); },
    darkened: (r, c, a) => { const k = 1 - toF(a[0]); return new Color(c.r * k, c.g * k, c.b * k, c.a); },
    lightened: (r, c, a) => { const k = toF(a[0]); return new Color(c.r + (1 - c.r) * k, c.g + (1 - c.g) * k, c.b + (1 - c.b) * k, c.a); },
    inverted: (r, c) => new Color(1 - c.r, 1 - c.g, 1 - c.b, c.a),
    to_html: (r, c, a) => [c.r, c.g, c.b].concat(a[0] === false ? [] : [c.a]).map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join(""),
  };
  const NUM_M = {};

  // ----- Методы встроенных узлов -----
  function nodeMethods(name) {
    switch (name) {
      case "add_child": return (r, o, a) => { r.addChild(o, a[0], truthy(a[1])); return null; };
      case "remove_child": return (r, o, a) => { const c = a[0]; const i = o.children.indexOf(c); if (i < 0) throw r.err("Cannot remove child, it's not a child of this node.", "args"); if (c.inTree) r.exitTree(c); o.children.splice(i, 1); c.parent = null; return null; };
      case "get_child": return (r, o, a) => o.children[r.arrIndex(o.children, a[0])];
      case "get_children": return (r, o) => o.children.filter((c) => !c.freed);
      case "get_child_count": return (r, o) => BigInt(o.children.filter((c) => !c.freed).length);
      case "get_parent": return (r, o) => (o.parent && o.parent !== r.root ? o.parent : o.parent);
      case "get_node": return (r, o, a) => r.getNode(o, a[0], true);
      case "get_node_or_null": return (r, o, a) => r.getNode(o, a[0], "or_null");
      case "has_node": return (r, o, a) => r.getNode(o, a[0], "or_null") !== null;
      case "find_child": return (r, o, a) => { let found = null; const w = (n) => { for (const c of n.children) { if (found) return; if (c.props.get("name") === a[0]) { found = c; return; } w(c); } }; w(o); return found; };
      case "queue_free": return (r, o) => { o.queued = true; if (!o.inTree) r.free(o); return null; };
      case "free": return (r, o) => { r.free(o); return null; };
      case "is_queued_for_deletion": return (r, o) => !!o.queued;
      case "is_inside_tree": return (r, o) => o.inTree;
      case "is_node_ready": return (r, o) => o.isReady;
      case "add_to_group": return (r, o, a) => { o.groups.add(a[0]); return null; };
      case "remove_from_group": return (r, o, a) => { o.groups.delete(a[0]); return null; };
      case "is_in_group": return (r, o, a) => o.groups.has(a[0]);
      case "get_tree": return (r) => r.tree;
      case "get_path": return (r, o) => { const parts = []; for (let n = o; n; n = n.parent) parts.unshift(n.props.get("name")); return "/" + parts.join("/"); };
      case "get_index": return (r, o) => BigInt(o.parent ? o.parent.children.indexOf(o) : 0);
      case "move_child": return (r, o, a) => { const i = o.children.indexOf(a[0]); o.children.splice(i, 1); o.children.splice(Number(a[1]), 0, a[0]); return null; };
      case "reparent": return (r, o, a) => { const p = o.parent; if (p) { p.children.splice(p.children.indexOf(o), 1); o.parent = null; } r.addChild(a[0], o); return null; };
      case "print_tree_pretty": return (r, o) => {
        const lines = [];
        const w = (n, pre, last, top) => {
          lines.push(top ? " ┖╴" + n.props.get("name") : pre + (last ? "┖╴" : "┠╴") + n.props.get("name"));
          const kids = n.children.filter((c) => !c.freed);
          kids.forEach((c, i) => w(c, top ? "    " : pre + (last ? "   " : "┃  "), i === kids.length - 1, false));
        };
        w(o, "", true, true);
        lines.forEach((l) => r.print(l)); return null;
      };
      case "print_tree": return (r, o) => { const w = (n, p) => { r.print(p + n.props.get("name")); n.children.forEach((c) => w(c, p + n.props.get("name") + "/")); }; r.print(o.props.get("name")); o.children.forEach((c) => w(c, "")); return null; };
      case "get_class": return (r, o) => o.builtin;
      case "is_class": return (r, o, a) => builtinIs(o.builtin, a[0]);
      case "has_method": return (r, o, a) => !!(findMethod(o, a[0]) || builtinMethod(o, a[0]));
      case "has_signal": return (r, o, a) => o.conns.has(a[0]);
      case "get": return (r, o, a) => (o.props.has(a[0]) ? o.props.get(a[0]) : r.specialProp(o, a[0]) !== undefined ? r.specialProp(o, a[0]) : null);
      case "set": return (r, o, a) => { r.setProp(o, a[0], a[1]); return null; };
      case "call": return (r, o, a) => r.callMethod(o, a[0], a.slice(1));
      case "emit_signal": return (r, o, a) => { r.emit(o, a[0], a.slice(1)); return null; };
      case "connect": return (r, o, a) => r.signalMethod(new Signal(o, a[0]), "connect", a.slice(1));
      case "disconnect": return (r, o, a) => r.signalMethod(new Signal(o, a[0]), "disconnect", a.slice(1));
      case "is_connected": return (r, o, a) => r.signalMethod(new Signal(o, a[0]), "is_connected", a.slice(1));
      case "get_instance_id": return (r, o) => BigInt(o.id);
      case "set_process": case "set_physics_process": return () => null;
      case "duplicate": return (r, o) => { const n = new GdObject(o.builtin, o.cls); o.props.forEach((v, k) => n.props.set(k, deepCopy(v))); o.types.forEach((v, k) => n.types.set(k, v)); o.conns.forEach((v, k) => n.conns.set(k, [])); n.props.set("name", ""); return n; };
    }
    return null;
  }
  function builtinMethod(o, name) {
    if (!(o instanceof GdObject)) return null;
    const b = o.builtin;
    if (b === "SceneTree") {
      const T = {
        get_nodes_in_group: (r, t, a) => { const out = []; r.walkTree((n) => { if (n.groups.has(a[0])) out.push(n); }); return out; },
        get_first_node_in_group: (r, t, a) => { let f = null; r.walkTree((n) => { if (!f && n.groups.has(a[0])) f = n; }); return f; },
        call_group: (r, t, a) => { const ns = []; r.walkTree((n) => { if (n.groups.has(a[0])) ns.push(n); }); ns.forEach((n) => r.callMethod(n, a[1], a.slice(2))); return null; },
        quit: (r) => { r.quitting = true; return null; },
        reload_current_scene: () => { throw CUR.err("Смена сцен работает только в Godot.", "onlygodot"); },
        change_scene_to_file: () => { throw CUR.err("Смена сцен работает только в Godot (нужны файлы .tscn).", "onlygodot"); },
        change_scene_to_packed: () => { throw CUR.err("Смена сцен работает только в Godot.", "onlygodot"); },
        create_timer: () => { throw CUR.err("create_timer() используют вместе с await, а await есть только в Godot. В тренажёре сделай узел Timer.", "onlygodot"); },
        get_frame: (r) => BigInt(r.frame),
      };
      if (name === "root") return null;
      return T[name] || null;
    }
    if (builtinIs(b, "Node")) {
      const m = nodeMethods(name);
      if (m) return m;
    }
    if (builtinIs(b, "Node2D") || builtinIs(b, "Control")) {
      const M = {
        translate: (r, o, a) => { o.props.set("position", r.binop("+", o.props.get("position"), a[0])); return null; },
        rotate: (r, o, a) => { o.props.set("rotation", toF(o.props.get("rotation")) + toF(a[0])); return null; },
        show: (r, o) => { o.props.set("visible", true); return null; }, hide: (r, o) => { o.props.set("visible", false); return null; },
        is_visible_in_tree: (r, o) => { for (let n = o; n && n !== r.root; n = n.parent) if (n.props.get("visible") === false) return false; return true; },
        look_at: (r, o, a) => { const gp = r.globalPos(o); o.props.set("rotation", Math.atan2(a[0].c[1] - gp.c[1], a[0].c[0] - gp.c[0])); return null; },
        to_global: (r, o, a) => r.binop("+", r.globalPos(o), a[0]), to_local: (r, o, a) => r.binop("-", a[0], r.globalPos(o)),
        get_global_mouse_position: () => vec2(0, 0),
      };
      if (M[name]) return M[name];
    }
    if (builtinIs(b, "CharacterBody2D") || builtinIs(b, "CharacterBody3D")) {
      const M = {
        move_and_slide: (r, o) => {
          const d = r.opts.delta;
          o.props.set("position", r.binop("+", o.props.get("position"), r.binop("*", o.props.get("velocity"), d)));
          o.onFloor = false;
          if (r.opts.floor != null && o.builtin !== "CharacterBody3D") {
            const p = o.props.get("position");
            if (p.c[1] >= r.opts.floor) {
              o.props.set("position", p.with(1, r.opts.floor));
              const v = o.props.get("velocity"); if (v.c[1] > 0) o.props.set("velocity", v.with(1, 0));
              o.onFloor = true;
            }
          }
          return false;
        },
        is_on_floor: (r, o) => !!o.onFloor, is_on_wall: () => false, is_on_ceiling: () => false,
        get_gravity: () => vec2(0, 980), get_slide_collision_count: () => 0n,
      };
      if (M[name]) return M[name];
    }
    if (b === "Timer") {
      const M = {
        start: (r, o, a) => { r.timerStart(o, a[0]); return null; },
        stop: (r, o) => { o.running = false; o.props.set("time_left", 0.0); return null; },
        is_stopped: (r, o) => !o.running,
      };
      if (M[name]) return M[name];
    }
    if (b === "AnimatedSprite2D" || b === "AnimationPlayer") {
      const M = {
        play: (r, o, a) => { if (a[0] != null) o.props.set(b === "AnimationPlayer" ? "current_animation" : "animation", a[0]); o.playing = true; return null; },
        stop: (r, o) => { o.playing = false; return null; }, pause: (r, o) => { o.playing = false; return null; },
        is_playing: (r, o) => !!o.playing,
      };
      if (M[name]) return M[name];
    }
    if (b === "AudioStreamPlayer") {
      const M = { play: (r, o) => { o.props.set("playing", true); return null; }, stop: (r, o) => { o.props.set("playing", false); return null; } };
      if (M[name]) return M[name];
    }
    if (b === "Area2D") {
      const M = { get_overlapping_bodies: () => [], get_overlapping_areas: () => [], has_overlapping_bodies: () => false };
      if (M[name]) return M[name];
    }
    if (name === "get_class") return (r, o) => o.builtin;
    if (name === "has_method") return (r, o, a) => !!findMethod(o, a[0]);
    if (name === "get") return (r, o, a) => (o.props.has(a[0]) ? o.props.get(a[0]) : null);
    if (name === "set") return (r, o, a) => { r.setProp(o, a[0], a[1]); return null; };
    if (name === "call") return (r, o, a) => r.callMethod(o, a[0], a.slice(1));
    if (name === "emit_signal") return (r, o, a) => { r.emit(o, a[0], a.slice(1)); return null; };
    if (name === "connect") return (r, o, a) => r.signalMethod(new Signal(o, a[0]), "connect", a.slice(1));
    if (name === "is_class") return (r, o, a) => builtinIs(o.builtin, a[0]);
    if (name === "get_instance_id") return (r, o) => BigInt(o.id);
    if (name === "free") return (r, o) => { o.freed = true; return null; };
    if (name === "duplicate") return nodeMethods("duplicate");
    return null;
  }

  // ===================== Настройки тренажёра из комментария =====================
  // # тренажёр: кадров=4 дельта=0.25 нажато=ui_right,jump@2 пол=300 имя=Player
  function readOptions(src) {
    const o = { frames: 3, delta: 0.25, press: {}, floor: null, name: null };
    const m = /^\s*#\s*тренажёр:(.*)$/m.exec(src);
    if (!m) return o;
    for (const part of m[1].trim().split(/\s+/)) {
      const [k, v] = part.split("=");
      if (!v) continue;
      if (k === "кадров") o.frames = Math.min(600, parseInt(v, 10) || 3);
      else if (k === "дельта") o.delta = parseFloat(v) || 0.25;
      else if (k === "пол") o.floor = parseFloat(v);
      else if (k === "имя") o.name = v;
      else if (k === "нажато") {
        for (const item of v.split(",")) {
          const [act, fr] = item.split("@");
          let range = [1, 1e9];
          if (fr) { const [a, b] = fr.split("-").map(Number); range = [a, b || a]; }
          (o.press[act] || (o.press[act] = [])).push(range);
        }
      }
    }
    return o;
  }

  function runGd(src) {
    const r = new Runner(readOptions(src));
    try {
      r.run(src);
      CUR = null;
      return { ok: true, stdout: r.out.join("\n"), stderr: "", tips: [] };
    } catch (e) {
      CUR = null;
      if (!(e instanceof GdError)) {
        if (e instanceof RangeError) e = new GdError("Stack overflow.", r.line, "stack");
        else return { ok: false, stdout: r.out.join("\n"), stderr: "Внутренняя ошибка тренажёра: " + e.message, tips: [], internal: true };
      }
      const line = e.line || r.line;
      return {
        ok: false, stdout: r.out.join("\n"),
        stderr: (line ? `Строка ${line}: ` : "") + e.message,
        line, tips: e.tip && TIPS[e.tip] ? [TIPS[e.tip]] : [], kind: e.tip,
      };
    }
  }

  const api = { runGd, parse, lex, TIPS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RK = root.RK || {};
  Object.assign(root.RK, api);
})(typeof window !== "undefined" ? window : globalThis);
