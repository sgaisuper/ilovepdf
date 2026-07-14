(function () {
  "use strict";

  var toolPath = document.body.getAttribute("data-tool") || location.pathname;
  var uploader = document.getElementById("uploader");
  var pickBtn = document.getElementById("pickfiles");
  var fileInput = document.getElementById("fileInput");
  var fileList = document.getElementById("fileList");
  var processEl = document.getElementById("process");
  var processText = document.getElementById("processText");
  var workArea = document.getElementById("workArea");
  var toolOptions = document.getElementById("toolOptions");
  var files = [];
  var downloadUrl = null;

  var modeSelect = document.getElementById("opt-mode");
  if (modeSelect) {
    modeSelect.addEventListener("change", function () {
      var ranges = document.querySelector(".opt-ranges");
      if (ranges) ranges.classList.toggle("hidden", modeSelect.value !== "range");
    });
  }

  if (pickBtn && fileInput) {
    pickBtn.addEventListener("click", function (e) {
      e.preventDefault();
      fileInput.click();
    });
  }

  var diskBtn = document.getElementById("uploadDisk");
  if (diskBtn && fileInput) {
    diskBtn.addEventListener("click", function (e) {
      e.preventDefault();
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      addFiles(Array.prototype.slice.call(fileInput.files || []));
      fileInput.value = "";
    });
  }

  function prevent(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ["dragenter", "dragover", "dragleave", "drop"].forEach(function (ev) {
    document.addEventListener(ev, prevent, false);
  });

  ["dragenter", "dragover"].forEach(function (ev) {
    document.body.addEventListener(ev, function () {
      document.body.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach(function (ev) {
    document.body.addEventListener(ev, function () {
      document.body.classList.remove("is-dragover");
    });
  });

  document.addEventListener("drop", function (e) {
    var dropped = e.dataTransfer && e.dataTransfer.files;
    if (dropped && dropped.length) addFiles(Array.prototype.slice.call(dropped));
  });

  function addFiles(list) {
    list.forEach(function (f) {
      files.push(f);
    });
    renderFiles();
  }

  function formatSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function collectOptions() {
    var opts = {};
    if (!toolOptions) return opts;
    toolOptions.querySelectorAll("input, select, textarea").forEach(function (el) {
      if (!el.name) return;
      opts[el.name] = el.value;
    });
    return opts;
  }

  function renderFiles() {
    if (!fileList) return;
    if (!files.length) {
      fileList.innerHTML = "";
      fileList.classList.add("hidden");
      if (uploader) uploader.classList.remove("uploader--has-files");
      return;
    }

    fileList.classList.remove("hidden");
    if (uploader) uploader.classList.add("uploader--has-files");

    fileList.innerHTML =
      '<div class="file-list__items">' +
      files
        .map(function (f, i) {
          var ext = (f.name.split(".").pop() || "PDF").toUpperCase().slice(0, 4);
          return (
            '<div class="file-list__item" data-index="' +
            i +
            '">' +
            '<div class="file-list__icon">' +
            escapeHtml(ext) +
            "</div>" +
            '<div class="file-list__meta">' +
            '<div class="file-list__name">' +
            escapeHtml(f.name) +
            "</div>" +
            '<div class="file-list__size">' +
            formatSize(f.size) +
            "</div>" +
            "</div>" +
            '<button type="button" class="file-list__remove" data-remove="' +
            i +
            '" aria-label="Remove">&times;</button>' +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      '<button type="button" class="btn btn--process" id="processBtn">Process</button>';

    fileList.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        files.splice(Number(btn.getAttribute("data-remove")), 1);
        renderFiles();
      });
    });

    var processBtn = document.getElementById("processBtn");
    if (processBtn) processBtn.addEventListener("click", runProcess);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showProcessing(message) {
    if (uploader) uploader.style.display = "none";
    if (fileList) fileList.style.display = "none";
    if (toolOptions) toolOptions.style.display = "none";
    if (workArea) {
      var header = workArea.querySelector(".tool__header");
      if (header) header.style.display = "none";
    }
    if (processEl) {
      processEl.style.display = "flex";
      processEl.classList.add("active");
      processEl.classList.remove("process--error", "process--done");
      var oldActions = processEl.querySelector(".process-actions");
      if (oldActions) oldActions.remove();
      var img = processEl.querySelector("img");
      if (img) img.style.display = "";
    }
    if (processText) processText.textContent = message || "Processing...";
  }

  function showError(message) {
    if (processText) processText.textContent = message || "Something went wrong";
    if (processEl) {
      processEl.classList.add("process--error");
      var img = processEl.querySelector("img");
      if (img) img.style.display = "none";
      var actions = document.createElement("div");
      actions.className = "process-actions";
      actions.innerHTML =
        '<button type="button" class="btn" id="resetTool">Try again</button>' +
        '<a class="btn btn--secondary" href="/">Back to tools</a>';
      processEl.appendChild(actions);
      document.getElementById("resetTool").addEventListener("click", function () {
        location.reload();
      });
    }
  }

  function showDone(filename, blobUrl) {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = blobUrl;
    if (processText) processText.textContent = "Ready! Your file has been processed.";
    if (processEl) {
      processEl.classList.add("process--done");
      var img = processEl.querySelector("img");
      if (img) img.style.display = "none";
      var actions = document.createElement("div");
      actions.className = "process-actions";
      actions.innerHTML =
        '<a class="btn" id="downloadBtn" download="' +
        escapeHtml(filename) +
        '" href="' +
        blobUrl +
        '">Download ' +
        escapeHtml(filename) +
        "</a>" +
        '<button type="button" class="btn btn--secondary" id="resetTool">Process more</button>';
      processEl.appendChild(actions);
      document.getElementById("resetTool").addEventListener("click", function () {
        location.reload();
      });
    }
  }

  async function runProcess() {
    if (!files.length && toolPath !== "/html-to-pdf") return;

    var opts = collectOptions();
    if (toolPath === "/protect-pdf" && !opts.password) {
      alert("Please set a password");
      return;
    }
    if (toolPath === "/redact-pdf" && !opts.terms) {
      alert("Enter words to redact");
      return;
    }
    if (toolPath === "/split_pdf" && opts.mode === "range" && !opts.ranges) {
      alert("Enter page ranges");
      return;
    }

    showProcessing("Uploading and processing...");

    try {
      var form = new FormData();
      form.append("tool", toolPath);
      Object.keys(opts).forEach(function (key) {
        form.append(key, opts[key]);
      });
      files.forEach(function (f) {
        form.append("files", f, f.name);
      });

      var res = await fetch("/api/process", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        var errJson = null;
        try {
          errJson = await res.json();
        } catch (e) {}
        throw new Error((errJson && errJson.error) || "Processing failed (" + res.status + ")");
      }

      var disposition = res.headers.get("Content-Disposition") || "";
      var match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
      var filename = decodeURIComponent((match && (match[1] || match[2])) || "download.bin");
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      showDone(filename, url);
    } catch (err) {
      showError(err.message || String(err));
    }
  }

  // HTML to PDF URL mode
  var urlForm = document.getElementById("urlForm");
  if (urlForm) {
    urlForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var input = document.getElementById("urlInput");
      if (!input || !input.value.trim()) return;

      showProcessing("Converting webpage to PDF...");
      try {
        var form = new FormData();
        form.append("tool", "/html-to-pdf");
        form.append("url", input.value.trim());
        var res = await fetch("/api/process", { method: "POST", body: form });
        if (!res.ok) {
          var errJson = null;
          try {
            errJson = await res.json();
          } catch (e2) {}
          throw new Error((errJson && errJson.error) || "Conversion failed");
        }
        var disposition = res.headers.get("Content-Disposition") || "";
        var match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
        var filename = decodeURIComponent((match && (match[1] || match[2])) || "webpage.pdf");
        var blob = await res.blob();
        showDone(filename, URL.createObjectURL(blob));
      } catch (err) {
        showError(err.message || String(err));
      }
    });
  }
})();
