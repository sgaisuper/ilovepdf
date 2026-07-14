(function () {
  "use strict";

  var tools = [];
  var draft = {
    id: null,
    name: "",
    steps: [],
  };
  var runFiles = [];
  var downloadUrl = null;

  var view = document.body.getAttribute("data-workflow-view") || "list";
  var editId = document.body.getAttribute("data-workflow-id") || "";

  function $(sel) {
    return document.querySelector(sel);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toolByPath(path) {
    return tools.find(function (t) {
      return t.path === path;
    });
  }

  async function loadTools() {
    var res = await fetch("/data/workflow-tools.json");
    tools = await res.json();
  }

  function renderList() {
    var root = $("#workflowApp");
    if (!root) return;
    var items = WorkflowStore.list();
    root.innerHTML =
      '<div class="wf-hero">' +
      "<h1>Workflows</h1>" +
      "<p>Chain PDF tools together, save them, and reuse anytime. Processing runs in your browser when possible — no upload size limits for merge, rotate, watermark, and more.</p>" +
      '<a class="btn" href="/user/workflows/new">Create workflow</a>' +
      "</div>" +
      (items.length
        ? '<div class="wf-grid">' +
          items
            .map(function (w) {
              var stepNames = (w.steps || [])
                .map(function (s) {
                  return s.name || s.path;
                })
                .join(" → ");
              return (
                '<div class="wf-card">' +
                '<div class="wf-card__body">' +
                "<h3>" +
                escapeHtml(w.name) +
                "</h3>" +
                '<p class="wf-card__steps">' +
                escapeHtml(stepNames || "No steps") +
                "</p>" +
                '<div class="wf-card__meta">' +
                (w.steps || []).length +
                " steps</div>" +
                "</div>" +
                '<div class="wf-card__actions">' +
                '<a class="btn btn--sm" href="/workflow/' +
                encodeURIComponent(w.id) +
                '">Run</a>' +
                '<a class="btn btn--sm btn--secondary" href="/user/workflows/' +
                encodeURIComponent(w.id) +
                '">Edit</a>' +
                '<button type="button" class="btn btn--sm btn--secondary" data-delete="' +
                escapeHtml(w.id) +
                '">Delete</button>' +
                "</div>" +
                "</div>"
              );
            })
            .join("") +
          "</div>"
        : '<div class="wf-empty">No workflows yet. Create one to automate multi-step PDF tasks.</div>');

    root.querySelectorAll("[data-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Delete this workflow?")) return;
        WorkflowStore.remove(btn.getAttribute("data-delete"));
        renderList();
        syncHomeCards();
      });
    });
  }

  function renderBuilder() {
    var root = $("#workflowApp");
    if (!root) return;
    if (editId) {
      var existing = WorkflowStore.get(editId);
      if (existing) draft = JSON.parse(JSON.stringify(existing));
    }

    root.innerHTML =
      '<div class="wf-builder">' +
      '<div class="wf-builder__header">' +
      "<h1>" +
      (draft.id ? "Edit workflow" : "Create a workflow") +
      "</h1>" +
      '<label class="wf-name">Workflow name<input id="wfName" type="text" placeholder="My workflow" value="' +
      escapeHtml(draft.name || "") +
      '" /></label>' +
      "</div>" +
      '<div class="wf-builder__cols">' +
      '<div class="wf-panel">' +
      "<h2>Available tools</h2>" +
      '<div class="wf-tool-list" id="wfToolList"></div>' +
      "</div>" +
      '<div class="wf-panel">' +
      "<h2>Your steps</h2>" +
      '<div class="wf-steps" id="wfSteps"></div>' +
      '<div class="wf-builder__actions">' +
      '<button type="button" class="btn" id="wfSave">Save workflow</button>' +
      '<a class="btn btn--secondary" href="/user/workflows">Cancel</a>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";

    $("#wfName").addEventListener("input", function (e) {
      draft.name = e.target.value;
    });
    $("#wfSave").addEventListener("click", saveDraft);
    paintToolList();
    paintSteps();
  }

  function paintToolList() {
    var list = $("#wfToolList");
    list.innerHTML = tools
      .map(function (t) {
        return (
          '<button type="button" class="wf-tool" data-add="' +
          escapeHtml(t.path) +
          '">' +
          "<strong>" +
          escapeHtml(t.name) +
          "</strong>" +
          '<span class="wf-tool__meta">' +
          escapeHtml(t.category) +
          (t.client ? " · browser" : " · server") +
          "</span>" +
          "</button>"
        );
      })
      .join("");
    list.querySelectorAll("[data-add]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var t = toolByPath(btn.getAttribute("data-add"));
        if (!t) return;
        var options = {};
        (t.options || []).forEach(function (o) {
          options[o.key] = o.default || "";
        });
        draft.steps.push({
          path: t.path,
          name: t.name,
          client: !!t.client,
          options: options,
        });
        paintSteps();
      });
    });
  }

  function paintSteps() {
    var box = $("#wfSteps");
    if (!draft.steps.length) {
      box.innerHTML = '<div class="wf-empty">Add tools from the left to build your workflow.</div>';
      return;
    }
    box.innerHTML = draft.steps
      .map(function (step, i) {
        var t = toolByPath(step.path) || { options: [] };
        var optsHtml = (t.options || [])
          .map(function (o) {
            var val = (step.options && step.options[o.key]) || o.default || "";
            if (o.type === "select") {
              return (
                '<label>' +
                escapeHtml(o.label) +
                '<select data-step="' +
                i +
                '" data-key="' +
                escapeHtml(o.key) +
                '">' +
                o.values
                  .map(function (v) {
                    return (
                      '<option value="' +
                      escapeHtml(v) +
                      '"' +
                      (String(v) === String(val) ? " selected" : "") +
                      ">" +
                      escapeHtml(v) +
                      "</option>"
                    );
                  })
                  .join("") +
                "</select></label>"
              );
            }
            return (
              "<label>" +
              escapeHtml(o.label) +
              '<input data-step="' +
              i +
              '" data-key="' +
              escapeHtml(o.key) +
              '" type="' +
              escapeHtml(o.type || "text") +
              '" value="' +
              escapeHtml(val) +
              '" /></label>'
            );
          })
          .join("");

        return (
          '<div class="wf-step">' +
          '<div class="wf-step__top">' +
          '<span class="wf-step__num">' +
          (i + 1) +
          "</span>" +
          "<strong>" +
          escapeHtml(step.name) +
          "</strong>" +
          '<div class="wf-step__move">' +
          '<button type="button" data-up="' +
          i +
          '"' +
          (i === 0 ? " disabled" : "") +
          ">↑</button>" +
          '<button type="button" data-down="' +
          i +
          '"' +
          (i === draft.steps.length - 1 ? " disabled" : "") +
          ">↓</button>" +
          '<button type="button" data-remove="' +
          i +
          '">✕</button>' +
          "</div></div>" +
          (optsHtml ? '<div class="wf-step__opts">' + optsHtml + "</div>" : "") +
          "</div>"
        );
      })
      .join("");

    box.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        draft.steps.splice(Number(btn.getAttribute("data-remove")), 1);
        paintSteps();
      });
    });
    box.querySelectorAll("[data-up]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = Number(btn.getAttribute("data-up"));
        if (i <= 0) return;
        var tmp = draft.steps[i - 1];
        draft.steps[i - 1] = draft.steps[i];
        draft.steps[i] = tmp;
        paintSteps();
      });
    });
    box.querySelectorAll("[data-down]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = Number(btn.getAttribute("data-down"));
        if (i >= draft.steps.length - 1) return;
        var tmp = draft.steps[i + 1];
        draft.steps[i + 1] = draft.steps[i];
        draft.steps[i] = tmp;
        paintSteps();
      });
    });
    box.querySelectorAll("[data-step]").forEach(function (el) {
      el.addEventListener("change", function () {
        var i = Number(el.getAttribute("data-step"));
        var key = el.getAttribute("data-key");
        draft.steps[i].options = draft.steps[i].options || {};
        draft.steps[i].options[key] = el.value;
      });
      el.addEventListener("input", function () {
        var i = Number(el.getAttribute("data-step"));
        var key = el.getAttribute("data-key");
        draft.steps[i].options = draft.steps[i].options || {};
        draft.steps[i].options[key] = el.value;
      });
    });
  }

  function saveDraft() {
    if (!draft.steps.length) {
      alert("Add at least one tool step");
      return;
    }
    draft.name = (($("#wfName") && $("#wfName").value.trim()) || draft.name || "My workflow");
    var saved = WorkflowStore.save(draft);
    syncHomeCards();
    location.href = "/workflow/" + encodeURIComponent(saved.id);
  }

  function renderRunner() {
    var root = $("#workflowApp");
    var wf = WorkflowStore.get(editId);
    if (!wf) {
      root.innerHTML =
        '<div class="wf-empty">Workflow not found. <a href="/user/workflows">Back to workflows</a></div>';
      return;
    }

    root.innerHTML =
      '<div class="wf-runner">' +
      '<div class="tool__header">' +
      '<h1 class="tool__header__title">' +
      escapeHtml(wf.name) +
      "</h1>" +
      '<h2 class="tool__header__subtitle">Runs ' +
      escapeHtml(
        (wf.steps || [])
          .map(function (s) {
            return s.name;
          })
          .join(" → ")
      ) +
      " in order.</h2>" +
      "</div>" +
      '<div class="wf-runner__steps">' +
      (wf.steps || [])
        .map(function (s, i) {
          return (
            '<div class="wf-runner__step" data-step-index="' +
            i +
            '"><span>' +
            (i + 1) +
            "</span> " +
            escapeHtml(s.name) +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      '<div id="uploader" class="uploader">' +
      '<a class="uploader__btn" id="pickfiles" href="javascript:;"><span>Select PDF files</span></a>' +
      '<div class="uploader__droptxt">or drop PDFs here</div>' +
      '<input type="file" id="fileInput" class="hidden" multiple accept=".pdf,application/pdf" />' +
      "</div>" +
      '<div id="fileList" class="file-list hidden"></div>' +
      '<div id="process" class="process"><p id="processText" class="title2">Running workflow...</p><img src="/img/svg_icons/preload.svg" alt=""></div>' +
      '<div class="wf-runner__links"><a href="/user/workflows/' +
      encodeURIComponent(wf.id) +
      '">Edit workflow</a> · <a href="/user/workflows">All workflows</a></div>' +
      "</div>";

    wireRunner(wf);
  }

  function wireRunner(wf) {
    var uploader = $("#uploader");
    var pickBtn = $("#pickfiles");
    var fileInput = $("#fileInput");
    var fileList = $("#fileList");
    var processEl = $("#process");
    var processText = $("#processText");

    pickBtn.addEventListener("click", function (e) {
      e.preventDefault();
      fileInput.click();
    });
    fileInput.addEventListener("change", function () {
      runFiles = runFiles.concat(Array.prototype.slice.call(fileInput.files || []));
      fileInput.value = "";
      renderRunFiles();
    });

    ["dragenter", "dragover", "dragleave", "drop"].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    document.addEventListener("drop", function (e) {
      var dropped = e.dataTransfer && e.dataTransfer.files;
      if (dropped && dropped.length) {
        runFiles = runFiles.concat(Array.prototype.slice.call(dropped));
        renderRunFiles();
      }
    });

    function formatSize(n) {
      if (n < 1024) return n + " B";
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
      return (n / (1024 * 1024)).toFixed(1) + " MB";
    }

    function renderRunFiles() {
      if (!runFiles.length) {
        fileList.classList.add("hidden");
        fileList.innerHTML = "";
        return;
      }
      fileList.classList.remove("hidden");
      fileList.innerHTML =
        '<div class="file-list__items">' +
        runFiles
          .map(function (f, i) {
            return (
              '<div class="file-list__item"><div class="file-list__icon">PDF</div><div class="file-list__meta"><div class="file-list__name">' +
              escapeHtml(f.name) +
              '</div><div class="file-list__size">' +
              formatSize(f.size) +
              '</div></div><button type="button" class="file-list__remove" data-remove="' +
              i +
              '">&times;</button></div>'
            );
          })
          .join("") +
        '</div><button type="button" class="btn btn--process" id="processBtn">Run workflow</button>';

      fileList.querySelectorAll("[data-remove]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          runFiles.splice(Number(btn.getAttribute("data-remove")), 1);
          renderRunFiles();
        });
      });
      $("#processBtn").addEventListener("click", function () {
        runWorkflowNow(wf);
      });
    }

    async function runWorkflowNow(workflow) {
      if (!runFiles.length) return;
      uploader.style.display = "none";
      fileList.style.display = "none";
      processEl.style.display = "flex";
      processEl.classList.add("active");
      processEl.classList.remove("process--error", "process--done");
      var old = processEl.querySelector(".process-actions");
      if (old) old.remove();
      var img = processEl.querySelector("img");
      if (img) img.style.display = "";

      try {
        var result = await ClientPDF.runWorkflow(workflow.steps, runFiles, function (p) {
          processText.textContent =
            "Step " + (p.index + 1) + "/" + p.total + ": " + p.name + "...";
          document.querySelectorAll(".wf-runner__step").forEach(function (el, idx) {
            el.classList.toggle("is-active", idx === p.index);
            el.classList.toggle("is-done", idx < p.index);
          });
        });

        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        downloadUrl = URL.createObjectURL(result.blob);
        processText.textContent = "Ready! Workflow finished.";
        processEl.classList.add("process--done");
        if (img) img.style.display = "none";
        var actions = document.createElement("div");
        actions.className = "process-actions";
        actions.innerHTML =
          '<a class="btn" id="downloadBtn" download="' +
          escapeHtml(result.filename) +
          '" href="' +
          downloadUrl +
          '">Download ' +
          escapeHtml(result.filename) +
          '</a><button type="button" class="btn btn--secondary" id="resetTool">Run again</button>';
        processEl.appendChild(actions);
        $("#resetTool").addEventListener("click", function () {
          location.reload();
        });
      } catch (err) {
        processText.textContent = err.message || String(err);
        processEl.classList.add("process--error");
        if (img) img.style.display = "none";
        var actionsErr = document.createElement("div");
        actionsErr.className = "process-actions";
        actionsErr.innerHTML =
          '<button type="button" class="btn" id="resetTool">Try again</button>';
        processEl.appendChild(actionsErr);
        $("#resetTool").addEventListener("click", function () {
          location.reload();
        });
      }
    }
  }

  function syncHomeCards() {
    // Used when on homepage — no-op here; homepage script handles it
  }

  async function init() {
    await loadTools();
    if (view === "list") renderList();
    else if (view === "builder") renderBuilder();
    else if (view === "run") renderRunner();
  }

  init().catch(function (e) {
    var root = $("#workflowApp");
    if (root) root.innerHTML = '<div class="wf-empty">' + escapeHtml(e.message) + "</div>";
  });
})();
