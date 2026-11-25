// Наглядные схемы. Содержимое хранится в course/visuals.json и собирается вместе с уроками.
(function () {
  "use strict";
  const {esc, inline} = window.RK;
  const lines = (items) => items.map((text) => `<span>${esc(text)}</span>`).join("");
  const panel = (area, title, content) => `<div class="visual-region visual-${area}" data-area="${area}"><b>${esc(title)}</b>${content}</div>`;
  const stage = `<svg viewBox="0 0 320 180" role="img" aria-label="Персонаж, платформа и монетка в окне сцены">
    <path d="M0 30h320M0 60h320M0 90h320M0 120h320M0 150h320M40 0v180M80 0v180M120 0v180M160 0v180M200 0v180M240 0v180M280 0v180" stroke="currentColor" opacity=".12" fill="none"/>
    <path d="M24 142h272v16H24Z" fill="#83bba5"/><path d="M24 142h272" stroke="#5e8c78" stroke-width="4"/>
    <path d="M76 139v-33l10-13 10 13v33Z" fill="#efa66c" stroke="#825343" stroke-width="2"/><path d="m78 104-2-13 10 7 10-7-2 13" fill="#efa66c" stroke="#825343" stroke-width="2"/>
    <circle cx="224" cy="106" r="11" fill="#ffe197" stroke="#b98b36" stroke-width="3"/><path d="M224 100v12" stroke="#b98b36" stroke-width="3"/>
  </svg>`;
  const stage3D = `<svg viewBox="0 0 320 220" role="img" aria-label="Куб над плоскостью в трёхмерной сцене, положительная ось Y направлена вверх">
    <path d="m30 164 126-65 133 66-128 46Z" fill="#b9d9d0" stroke="#5e8c78" stroke-width="2"/>
    <path d="m110 145 48-24 49 24-48 25Z" fill="#b69bda" stroke="#775c9f" stroke-width="2"/>
    <path d="m110 145 49 25v-58l-49-25Z" fill="#9682bf" stroke="#775c9f" stroke-width="2"/>
    <path d="m159 170 48-25V87l-48 25Z" fill="#7b6aa4" stroke="#775c9f" stroke-width="2"/>
    <path d="m110 87 48-24 49 24-48 25Z" fill="#d6c5ec" stroke="#775c9f" stroke-width="2"/>
    <path d="M57 169v-76m-5 8 5-8 5 8" fill="none" stroke="#5fba8b" stroke-width="3"/>
    <text x="36" y="87" fill="currentColor" font-family="sans-serif" font-size="15">+Y</text>
  </svg>`;

  function editor(data) {
    const right = data.right || ["Transform", "Position   x 0   y 0", "Rotation   0", "Scale   x 1   y 1"];
    return `<div class="editor-scheme">
      ${panel("menu", "Godot 4", `<span class="visual-menu">Project · Scene · Debug · Editor</span><span>2D · 3D · Script</span><span class="visual-play">▶ F6</span>`)}
      ${panel("scene", "Scene", lines(data.tree || ["＋ Add Child Node", "Main", "  ├ Sprite2D", "  └ CollisionShape2D"]))}
      ${panel("center", data.workspace || "2D · окно сцены", data.code ? `<pre>${esc(data.code)}</pre>` : data.space === "3d" ? stage3D : stage)}
      ${panel("inspector", data.rightTitle || "Inspector", lines(right))}
      ${panel("files", "FileSystem", lines(data.files || ["res://", "  scenes/", "  scripts/", "  art/", "  icon.svg"]))}
      ${panel("bottom", data.bottomTitle || "Нижняя панель", lines(data.bottom || ["Output · Debugger · Animation", "Здесь видны сообщения и редакторы ресурсов."]))}
    </div>`;
  }

  function dialog(data) {
    return `<div class="dialog-scheme">
      ${panel("menu", data.window || "Project → Project Settings", "")}
      ${panel("tabs", "Вкладки", lines(data.tabs || ["General", "Input Map", "Globals"]))}
      <div class="dialog-fields">
        ${panel("field", data.fieldTitle || "Поле ввода", lines(data.fields || ["Add New Action", "move_left"]))}
        ${panel("list", data.listTitle || "Список", lines(data.rows || ["move_left     ＋", "  A", "  Left", "move_right   ＋"]))}
        ${panel("confirm", data.confirm || "Add / OK", "")}
      </div>
    </div>`;
  }

  function concept(data) {
    if (data.layout === "axes") {
      return `<div class="coordinate-scheme"><svg viewBox="0 0 520 240" role="img" aria-label="Ось X направлена вправо, Y вниз. Точка игрока имеет координаты 160 и 80.">
        <path d="M65 35h380m-10-7 10 7-10 7M65 35v170m-7-10 7 10 7-10" stroke="currentColor" stroke-width="3" fill="none"/>
        <path d="M225 35v80H65" stroke="#9679be" stroke-dasharray="5 5" fill="none"/>
        <circle cx="225" cy="115" r="12" fill="#efa66c" stroke="#825343" stroke-width="2"/>
        <g fill="currentColor" font-family="sans-serif" font-size="17"><text x="34" y="29">0, 0</text><text x="446" y="41">+X</text><text x="42" y="226">+Y</text><text x="196" y="26">160</text><text x="30" y="119">80</text><text x="248" y="121">Player (160, 80)</text></g>
      </svg></div>`;
    }
    return `<ol class="concept-flow concept-${esc(data.layout || "flow")}">${data.nodes.map((node, index) => `<li>
      <span class="concept-number" aria-hidden="true">${index + 1}</span><strong>${esc(node[0])}</strong><span>${esc(node[1])}</span>
      ${index < data.nodes.length - 1 ? '<i aria-hidden="true">→</i>' : ""}</li>`).join("")}</ol>`;
  }

  function draw(data) {
    if (data.kind === "editor") return editor(data);
    if (data.kind === "dialog") return dialog(data);
    return concept(data);
  }

  function renderVisual(card, target) {
    const data = window.GODOT_VISUALS && window.GODOT_VISUALS[card.visual];
    if (!data) return;
    const root = document.createElement("details");
    root.className = "lesson-visual";
    root.open = true;
    const isGuide = card.t === "steps";
    root.innerHTML = `<summary>${esc(data.title)}<span>${isGuide ? "Куда нажимать" : "Наглядно"}</span></summary>
      <figure><div class="visual-picture">${draw(data.frames?.[0] || data)}</div>
        <figcaption>${esc(data.caption || (isGuide ? "Схема Godot 4. Выбери номер действия, чтобы подсветить нужную область." : "Проследи путь по стрелкам, затем прочитай объяснение ниже."))}</figcaption>
      </figure>
      ${isGuide ? `<div class="visual-actions" role="group" aria-label="Показать действие на схеме">${card.items.map((item, index) => `<button type="button" data-index="${index}" aria-pressed="false" aria-label="Показать действие ${index + 1}">${index + 1}</button>`).join("")}</div><div class="visual-note" role="status"></div>` : `<p class="visual-takeaway">${inline(data.takeaway)}</p>`}
      ${data.source ? `<a class="visual-source" href="${esc(data.source)}" target="_blank" rel="noopener noreferrer">Открыть документацию Godot ↗</a>` : ""}`;
    if (isGuide) {
      const buttons = [...root.querySelectorAll(".visual-actions button")];
      const picture = root.querySelector(".visual-picture");
      const note = root.querySelector(".visual-note");
      const select = (index) => {
        buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
        picture.innerHTML = draw(data.frames?.[index] || data);
        const active = data.areas[index].split(" ");
        const regions = [...picture.querySelectorAll(".visual-region")];
        regions.forEach((region) => region.classList.toggle("is-active", active.includes(region.dataset.area)));
        note.innerHTML = `<b>Действие ${index + 1}.</b> ${inline(card.items[index])}`;
      };
      buttons.forEach((button, index) => button.addEventListener("click", () => select(index)));
      select(0);
    }
    target.appendChild(root);
  }
  window.RK.renderVisual = renderVisual;
})();
