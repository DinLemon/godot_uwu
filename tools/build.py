#!/usr/bin/env python3
"""Собирает уроки курса Godot из course/*.txt в content/course-data.js.

Формат файла урока (кратко, подробно — в README.md):

  # MODULE m01 | Название модуля | Подзаголовок
  ## LESSON m01-1 | Название урока | 6        (6 — минуты)
  :: goals            — строки "- ..."
  :: text Заголовок   — markdown до следующей строки "::" / "##" / "#"
  :: code             — markdown, блок ```gd, необязательный ```out (ожидаемый вывод), текст после
  :: quiz             — markdown-вопрос (можно с ```gd), варианты "[x] верный => почему" / "[ ] неверный => почему"
  :: fill             — markdown, ```gd с ___, строки "= ответ | вариант" по одной на пропуск
  :: order            — markdown, ```gd с правильным порядком строк
  :: task             — markdown, ```gd заготовка, ```solution, ```expect, "hint: ..." (несколько)
  :: recap            — строки "- ..."
  Общие ключи: "explain: ...", "hint: ...", "tests: yes", "contains: строка"
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_card(kind, title, lines, where):
    card = {"t": kind}
    if title:
        card["title"] = title
    md, fences, opts, answers, hints, items = [], [], [], [], [], []
    after = []
    i = 0
    seen_fence = False
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^```(\w*)\s*$", line)
        if m:
            tag = m.group(1) or "gd"
            if tag == "gdscript":
                tag = "gd"
            buf = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            if i >= len(lines):
                raise SystemExit(f"{where}: незакрытый блок ```")
            i += 1
            # в text/quiz код остаётся частью markdown
            if kind == "steps" and items:
                after.append("```" + tag); after.extend(buf); after.append("```")
            elif kind in ("text", "quiz", "steps") or (kind == "deep" and (tag not in ("gd", "out") or (tag == "gd" and "func " not in "\n".join(buf)))):
                md.append("```" + tag)
                md.extend(buf)
                md.append("```")
            else:
                fences.append((tag, "\n".join(buf)))
                if tag == "gd" and kind != "deep":
                    seen_fence = True
            continue
        if kind == "quiz" and re.match(r"^\[( |x)\] ", line):
            right = line[1] == "x"
            body = line[4:]
            why = None
            if " => " in body:
                body, why = body.split(" => ", 1)
            opts.append((body.strip(), right, why.strip() if why else None))
        elif kind == "fill" and line.startswith("= "):
            answers.append([a.strip() for a in line[2:].split(" | ")])
        elif kind in ("goals", "recap", "steps") and line.startswith("- ") and not seen_fence:
            items.append(line[2:].strip())
        elif line.startswith("explain: "):
            card["explain"] = line[9:].strip()
        elif line.startswith("hint: "):
            hints.append(line[6:].strip())
        elif line.startswith("tests: "):
            card["tests"] = line[7:].strip() in ("yes", "true", "да")
        elif line.startswith("norun: "):
            card["norun"] = line[7:].strip() in ("yes", "true", "да")
        elif line.startswith("fails: "):
            card["fails"] = line[7:].strip() in ("yes", "true", "да")
        elif line.startswith("contains: "):
            card.setdefault("mustContain", []).append(line[10:].strip())
        elif line.startswith("visual: "):
            card["visual"] = line[8:].strip()
        elif line.startswith("lab: "):
            card["lab"] = line[5:].strip()
        elif (kind == "code" and seen_fence) or (kind == "steps" and items):
            after.append(line)
        else:
            md.append(line)
        i += 1

    text = "\n".join(md).strip()
    if text:
        card["md"] = text
    fd = {}
    if kind in ("code", "fill", "order", "task"):
        n_rust = sum(1 for t, _ in fences if t == "gd")
        if n_rust != 1:
            raise SystemExit(f"{where}: в карточке {kind} должен быть ровно один блок ```gd, а их {n_rust}")
        # блоки с другими тегами (text, sh) внутри описания задачи — часть markdown
        for t, body in fences:
            if t not in ("gd", "out", "solution", "expect"):
                md.extend(["```" + t, body, "```"])
    for tag, body in fences:
        fd.setdefault(tag, body)

    if kind == "steps":
        if not items:
            raise SystemExit(f"{where}: пустой список steps")
        card["items"] = items
        if "\n".join(after).strip():
            card["after"] = "\n".join(after).strip()
    elif kind in ("goals", "recap"):
        if not items:
            raise SystemExit(f"{where}: пустой список {kind}")
        card["items"] = items
    elif kind == "deep":
        if not title:
            raise SystemExit(f"{where}: у карточки deep нужен заголовок")
        if "gd" in fd:
            card["code"] = fd["gd"]
        if "out" in fd:
            card["out"] = fd["out"]
    elif kind == "code":
        card["code"] = fd["gd"]
        if "out" in fd:
            card["out"] = fd["out"]
        if "\n".join(after).strip():
            card["after"] = "\n".join(after).strip()
    elif kind == "quiz":
        if len(opts) < 2 or sum(1 for o in opts if o[1]) != 1:
            raise SystemExit(f"{where}: в квизе нужно ≥2 вариантов и ровно один [x]")
        card["options"] = [o[0] for o in opts]
        card["answer"] = next(k for k, o in enumerate(opts) if o[1])
        if any(o[2] for o in opts):
            card["why"] = [o[2] for o in opts]
    elif kind == "fill":
        code = fd["gd"]
        n = code.count("___")
        if n != len(answers) or n == 0:
            raise SystemExit(f"{where}: пропусков {n}, ответов {len(answers)}")
        card["code"] = code
        card["answers"] = answers
        if hints:
            card["hint"] = hints[0]
    elif kind == "order":
        card["lines"] = [l for l in fd["gd"].split("\n") if l.strip()]
    elif kind == "task":
        card["code"] = fd["gd"]
        if "solution" in fd:
            card["solution"] = fd["solution"]
        if "expect" in fd:
            card["expect"] = fd["expect"]
        if hints:
            card["hints"] = hints
        if "solution" not in fd:
            raise SystemExit(f"{where}: у задачи нет ```solution")
    return card


def parse_file(path):
    modules = []
    mod = lesson = None
    kind = title = None
    buf = []
    lineno = 0

    def flush():
        nonlocal kind, buf
        if kind:
            if lesson is None:
                raise SystemExit(f"{path}:{lineno}: карточка вне урока")
            lesson["cards"].append(parse_card(kind, title, buf, f"{path.name}:{lesson['id']}"))
        kind, buf = None, []

    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip()
        if line.startswith("# MODULE "):
            flush()
            mid, mtitle, msub = [x.strip() for x in line[9:].split("|")]
            mod = {"id": mid, "title": mtitle, "sub": msub, "lessons": []}
            modules.append(mod)
            lesson = None
        elif line.startswith("## LESSON "):
            flush()
            parts = [x.strip() for x in line[10:].split("|")]
            lesson = {"id": parts[0], "title": parts[1], "min": int(parts[2]), "cards": []}
            if len(parts) > 3 and parts[3] == "practice":
                lesson["practice"] = True
            mod["lessons"].append(lesson)
        elif line.startswith(":: "):
            flush()
            head = line[3:].strip().split(" ", 1)
            kind = head[0]
            title = head[1] if len(head) > 1 else None
            if kind not in ("goals", "text", "code", "quiz", "fill", "order", "task", "recap", "deep", "steps"):
                raise SystemExit(f"{path}:{lineno}: неизвестный тип карточки {kind}")
        else:
            if kind is None and line.strip() and not line.startswith("//"):
                raise SystemExit(f"{path}:{lineno}: текст вне карточки: {line[:40]}")
            if kind:
                buf.append(raw)
    flush()
    return modules


def load_lang(lang):
    modules = []
    for f in sorted((ROOT / "course" / lang).glob("m*.txt")):
        modules.extend(parse_file(f))
    ids = set()
    for m in modules:
        for l in m["lessons"]:
            if l["id"] in ids:
                raise SystemExit(f"{lang}: повтор id урока {l['id']}")
            ids.add(l["id"])
            g = [c for c in l["cards"] if c["t"] == "goals"]
            if g:
                l["goals"] = g[0]["items"]
                l["cards"] = [c for c in l["cards"] if c["t"] != "goals"]
    gloss = []
    gpath = ROOT / "course" / lang / "glossary.txt"
    if gpath.exists():
        for line in gpath.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("//"):
                term, en, d = [x.strip() for x in line.split("|", 2)]
                gloss.append({"term": term, "en": en, "def": d})
    return modules, gloss


def shape(modules):
    """Структура курса без текста: должна совпадать у всех языков."""
    out = {}
    for m in modules:
        for l in m["lessons"]:
            out[l["id"]] = (m["id"], bool(l.get("practice")), tuple(
                (c["t"], bool(c.get("tests")), len(c.get("options", [])), c.get("answer"), len(c.get("answers", [])), len(c.get("lines", [])))
                for c in l["cards"]))
    return out


def main():
    strict = "--partial" not in sys.argv
    courses, glossaries = {}, {}
    langs = [d.name for d in sorted((ROOT / "course").iterdir()) if d.is_dir() and list(d.glob("m*.txt"))]
    for lang in langs:
        courses[lang], glossaries[lang] = load_lang(lang)
    if "en" not in courses:
        courses["en"] = courses["ru"]
        glossaries["en"] = glossaries["ru"]
        single = True
    else:
        single = False
    ru_shape, en_shape = shape(courses["ru"]), shape(courses["en"])
    problems = []
    for lid, sh in ru_shape.items():
        if lid not in en_shape:
            problems.append(f"en: нет урока {lid}")
        elif en_shape[lid] != sh:
            a, b = sh[2], en_shape[lid][2]
            diff = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
            problems.append(f"{lid}: структура ru/en расходится с карточки #{diff}: ru={a[diff:diff+1]} en={b[diff:diff+1]} (карточек ru {len(a)}, en {len(b)})")
    for lid in en_shape:
        if lid not in ru_shape:
            problems.append(f"ru: нет урока {lid}")
    missing_en = [p for p in problems if p.startswith("en: нет урока")]
    other = [p for p in problems if not p.startswith("en: нет урока")]
    for p in other:
        print("ОШИБКА", p)
    if other or (strict and missing_en):
        if missing_en:
            print(f"нет перевода для {len(missing_en)} уроков")
        raise SystemExit(1)
    if missing_en:
        # временно: недостающие модули берём из русской версии
        have = {m["id"] for m in courses["en"]}
        merged = []
        for m in courses["ru"]:
            merged.append(next((x for x in courses["en"] if x["id"] == m["id"]), m))
        courses["en"] = merged
        print(f"ВНИМАНИЕ: {len(missing_en)} уроков без перевода, вставлены по-русски")
    if single:
        del courses["en"], glossaries["en"]
    visuals_path = ROOT / "course" / "visuals.json"
    visuals = json.loads(visuals_path.read_text(encoding="utf-8")) if visuals_path.exists() else {}
    practice_path = ROOT / "course" / "practice.json"
    practice = json.loads(practice_path.read_text(encoding="utf-8")) if practice_path.exists() else {}
    links_path = ROOT / "course" / "practice-links.json"
    practice_links = json.loads(links_path.read_text(encoding="utf-8")) if links_path.exists() else {}
    lesson_ids = {l["id"] for m in courses["ru"] for l in m["lessons"]}
    for lesson_id, refs in practice_links.items():
        if lesson_id not in lesson_ids or not isinstance(refs, list) or not refs or len(set(refs)) != len(refs):
            raise SystemExit(f"Неверные ссылки на практику: {lesson_id}")
        if any(ref not in practice for ref in refs):
            raise SystemExit(f"{lesson_id}: ссылка на неизвестное задание")
    linked_labs = set()
    for lang, modules in courses.items():
        for module in modules:
            for lesson in module["lessons"]:
                if lesson["id"] in practice_links:
                    lesson["practiceLinks"] = practice_links[lesson["id"]]
                for card in lesson["cards"]:
                    if "lab" in card:
                        lab = practice.get(card["lab"])
                        if not lab or lab.get("lesson") != lesson["id"] or not lab.get("goals") or not lab.get("hints"):
                            raise SystemExit(f"{lang}/{lesson['id']}: неверное практическое задание {card['lab']}")
                        linked_labs.add(card["lab"])
                    if "visual" not in card:
                        continue
                    visual = visuals.get(card["visual"])
                    if not visual:
                        raise SystemExit(f"{lang}/{lesson['id']}: неизвестная схема {card['visual']}")
                    if card["t"] == "steps" and len(visual.get("areas", [])) != len(card["items"]):
                        raise SystemExit(f"{lang}/{lesson['id']}: число отметок на схеме не совпадает с действиями")
                    regions = {
                        "editor": {"menu", "scene", "center", "inspector", "files", "bottom"},
                        "dialog": {"menu", "tabs", "field", "list", "confirm"},
                    }
                    for index, area in enumerate(visual.get("areas", [])):
                        frame = visual.get("frames", {}).get(str(index), visual)
                        if not set(area.split()).issubset(regions.get(frame["kind"], set())):
                            raise SystemExit(f"{lang}/{lesson['id']}: область действия {index + 1} отсутствует на схеме")
    if set(practice) != linked_labs:
        raise SystemExit(f"Практические задания без карточки: {sorted(set(practice) - linked_labs)}")
    out = ROOT / "content" / "course-data.js"
    out.parent.mkdir(exist_ok=True)
    out.write_text(
        "// Сгенерировано tools/build.py из course/<язык>/*.txt. Не редактируй вручную.\n"
        f"window.COURSES = {json.dumps({k: {'modules': v} for k, v in courses.items()}, ensure_ascii=False, indent=0)};\n"
        f"window.GLOSSARIES = {json.dumps(glossaries, ensure_ascii=False, indent=0)};\n",
        # Схемы добавляют иллюстрации внутрь карточек, сохраняя их порядок.
        encoding="utf-8",
    )
    if visuals:
        with out.open("a", encoding="utf-8") as stream:
            stream.write(f"window.GODOT_VISUALS = {json.dumps(visuals, ensure_ascii=False, indent=0)};\n")
    with out.open("a", encoding="utf-8") as stream:
        stream.write(f"window.GODOT_PRACTICE = {json.dumps(practice, ensure_ascii=False, indent=0)};\n")
    for lang, modules in courses.items():
        n_l = sum(len(m["lessons"]) for m in modules)
        n_c = sum(len(l["cards"]) for m in modules for l in m["lessons"])
        n_t = sum(1 for m in modules for l in m["lessons"] for c in l["cards"] if c["t"] in ("task", "fill", "order"))
        n_s = sum(1 for m in modules for l in m["lessons"] for c in l["cards"] if c["t"] == "steps")
        n_d = sum(1 for m in modules for l in m["lessons"] for c in l["cards"] if c["t"] == "deep")
        mins = sum(l["min"] for m in modules for l in m["lessons"])
        print(f"{lang}: модулей {len(modules)}, уроков {n_l}, карточек {n_c}, практики {n_t}, шагов в Godot {n_s}, углублений {n_d}, минут {mins}, терминов {len(glossaries[lang])}")


if __name__ == "__main__":
    main()
