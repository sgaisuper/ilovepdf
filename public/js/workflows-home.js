(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderHomeWorkflows() {
    if (!window.WorkflowStore) return;
    var container = document.querySelector(".tools__container");
    if (!container) return;

    // Remove previously injected cards
    container.querySelectorAll(".tools__item.workflows-saved").forEach(function (el) {
      el.remove();
    });

    var workflows = WorkflowStore.list().slice(0, 6);
    var addCard = container.querySelector(".tools__item.workflows-add");
    var createCard = container.querySelector(".tools__item.workflows");

    workflows.forEach(function (wf) {
      var stepNames = (wf.steps || [])
        .map(function (s) {
          return s.name || s.path;
        })
        .join(" → ");
      var card = document.createElement("div");
      card.className = "tools__item workflows workflows-saved hidden";
      card.setAttribute("data-category", "workflows");
      card.innerHTML =
        '<a href="/workflow/' +
        encodeURIComponent(wf.id) +
        '" title="' +
        escapeHtml(wf.name) +
        '">' +
        "<h3>" +
        escapeHtml(wf.name) +
        "</h3>" +
        '<div class="tools__item__content"><p>' +
        escapeHtml(stepNames || "Custom workflow") +
        "</p></div>" +
        '<div class="action">Run workflow <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><path stroke="#33333B" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="m4.667 11.333 6.667-6.666m0 0H4.667m6.667 0v6.666"/></svg></div>' +
        "</a>";

      if (addCard) container.insertBefore(card, addCard);
      else if (createCard && createCard.nextSibling)
        container.insertBefore(card, createCard.nextSibling);
      else container.appendChild(card);
    });

    // Update add card counter text if present
    if (addCard) {
      var p = addCard.querySelector(".tools__item__content p");
      if (p) p.textContent = Math.min(workflows.length, 6) + " of 6";
    }

    // Re-apply current filter
    var active = document.querySelector(".tools__filter .tag.active");
    if (active) active.click();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderHomeWorkflows);
  } else {
    renderHomeWorkflows();
  }
})();
