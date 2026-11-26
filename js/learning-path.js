// Связь уроков и практики: ссылки сохраняют точный шаг возвращения.
(function () {
  "use strict";
  const RK = window.RK;
  const validStep = value => /^(0|[1-9]\d{0,4})$/.test(String(value)) ? Number(value) : null;
  function related(lesson, catalog) {
    return [...new Set(lesson.practiceLinks || [])].filter(id => Object.prototype.hasOwnProperty.call(catalog, id));
  }
  function practiceHref(lab, lesson, step) {
    return `#/practice/${encodeURIComponent(lab)}/from/${encodeURIComponent(lesson)}/${validStep(step) ?? 0}`;
  }
  function returnHref(parts, byId, lab) {
    const lesson = byId[parts[3]], step = validStep(parts[4]);
    return parts[2] === "from" && lesson && step !== null && (lesson.practiceLinks || []).includes(lab)
      ? `#/l/${encodeURIComponent(lesson.id)}/${step}` : null;
  }
  function render(lesson, step, catalog, progress) {
    const refs = related(lesson, catalog);
    if (!refs.length) return "";
    return `<aside class="lesson-practice" aria-label="Практика по теме урока">
      <strong>Закрепить в редакторе</strong>
      <ul>${refs.map(id => `<li><a href="${practiceHref(id,lesson.id,step)}">${RK.esc(catalog[id].title)}</a>${progress?.[id]?.passed ? '<span class="practice-link-done">Выполнено</span>' : ""}</li>`).join("")}</ul>
      <p>Сцена сохранится отдельно. Под редактором есть возврат к этому шагу. Практику можно пройти позже.</p>
    </aside>`;
  }
  RK.LearningPath = {related, practiceHref, returnHref, render};
})();
