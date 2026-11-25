#!/usr/bin/env python3
"""Заменяет отступы из 4 пробелов на табы внутри блоков кода GDScript в course/*/*.txt.
Godot по умолчанию использует табы; так код из курса можно копировать в редактор без ошибок."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CODE_TAGS = {"", "gd", "gdscript", "solution"}

for f in sorted((ROOT / "course").glob("*/*.txt")):
    out, in_fence, in_code, changed = [], False, False, False
    for line in f.read_text(encoding="utf-8").split("\n"):
        if line.startswith("```"):
            if not in_fence:
                in_fence, in_code = True, line[3:].strip() in CODE_TAGS
            else:
                in_fence = in_code = False
            out.append(line)
            continue
        if in_code:
            m2 = re.match(r"^((?:    )+)", line)
            if m2:
                line = "\t" * (len(m2.group(1)) // 4) + line[len(m2.group(1)):]
                changed = True
        out.append(line)
    if changed:
        f.write_text("\n".join(out), encoding="utf-8")
        print("табы:", f.relative_to(ROOT))
