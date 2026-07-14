(function () {
  "use strict";

  /* ---- Tool category filters ---- */
  var filters = document.querySelectorAll(".tools__filter .tag");
  var items = document.querySelectorAll(".tools__item");

  function applyFilter(filter) {
    filters.forEach(function (tag) {
      tag.classList.toggle("active", tag.getAttribute("data-filter") === filter);
    });

    items.forEach(function (item) {
      var category = item.getAttribute("data-category") || "";
      var isWorkflowAdd = item.classList.contains("workflows-add");
      var show;

      if (filter === "all") {
        show = !isWorkflowAdd && category !== "workflows";
        // On "All", show regular tools; workflows card stays visible in original too
        if (category === "workflows" && item.classList.contains("workflows")) {
          show = true;
        }
        if (isWorkflowAdd) show = false;
      } else if (filter === "workflows") {
        show = category === "workflows" || item.classList.contains("workflows") || isWorkflowAdd;
      } else {
        show = category === filter;
      }

      item.classList.toggle("hidden", !show);
      if (isWorkflowAdd && filter === "workflows") {
        item.classList.remove("hidden");
      }
    });
  }

  filters.forEach(function (tag) {
    tag.addEventListener("click", function () {
      applyFilter(tag.getAttribute("data-filter"));
    });
  });

  /* ---- Mobile menu ---- */
  var menuSm = document.querySelector(".menu--sm");
  var menu = document.querySelector(".header .menu");
  if (menuSm && menu) {
    menuSm.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.toggle("open");
      document.body.classList.toggle("menu-open");
    });
  }

  /* ---- Dropdown menus: open on hover (desktop) / click (touch) ---- */
  var dropdowns = document.querySelectorAll(".nav-has-dropdown");
  dropdowns.forEach(function (item) {
    var trigger = item.querySelector(":scope > span");
    if (!trigger) return;
    trigger.addEventListener("click", function (e) {
      if (window.matchMedia("(max-width: 860px)").matches) {
        e.preventDefault();
        e.stopPropagation();
        item.classList.toggle("open");
      }
    });
  });

  document.addEventListener("click", function () {
    dropdowns.forEach(function (d) {
      d.classList.remove("open");
    });
    if (menu) menu.classList.remove("open");
    document.body.classList.remove("menu-open");
  });

  /* ---- Smooth appear for tool cards ---- */
  if (items.length) {
    items.forEach(function (item, i) {
      item.style.opacity = "0";
      item.style.transform = "translateY(12px)";
      setTimeout(function () {
        item.style.transition = "opacity .4s ease, transform .4s ease";
        item.style.opacity = "1";
        item.style.transform = "translateY(0)";
      }, 40 + i * 18);
    });
  }
})();
