(function () {
  "use strict";

  var uploader = document.getElementById("uploader");
  var pickBtn = document.getElementById("pickfiles");
  var fileInput = document.getElementById("fileInput");
  var fileList = document.getElementById("fileList");
  var processEl = document.getElementById("process");
  var processText = document.getElementById("processText");
  var workArea = document.getElementById("workArea");
  var dropArea = document.getElementById("dropArea");
  var files = [];

  if (!pickBtn || !fileInput) return;

  pickBtn.addEventListener("click", function (e) {
    e.preventDefault();
    fileInput.click();
  });

  var diskBtn = document.getElementById("uploadDisk");
  if (diskBtn) {
    diskBtn.addEventListener("click", function (e) {
      e.preventDefault();
      fileInput.click();
    });
  }

  fileInput.addEventListener("change", function () {
    addFiles(Array.prototype.slice.call(fileInput.files || []));
    fileInput.value = "";
  });

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
          return (
            '<div class="file-list__item" data-index="' +
            i +
            '">' +
            '<div class="file-list__icon">PDF</div>' +
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
    if (processBtn) {
      processBtn.addEventListener("click", runProcess);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function runProcess() {
    if (!files.length) return;
    if (uploader) uploader.style.display = "none";
    if (fileList) fileList.style.display = "none";
    if (workArea) {
      var header = workArea.querySelector(".tool__header");
      if (header) header.style.display = "none";
    }
    if (processEl) {
      processEl.style.display = "flex";
      processEl.classList.add("active");
    }

    setTimeout(function () {
      if (processText) processText.textContent = "Done! (UI demo — files are not uploaded)";
      var img = processEl && processEl.querySelector("img");
      if (img) img.style.display = "none";

      var actions = document.createElement("div");
      actions.className = "process-actions";
      actions.innerHTML =
        '<a class="btn" href="/">Back to tools</a>' +
        '<button type="button" class="btn btn--secondary" id="resetTool">Process more</button>';
      processEl.appendChild(actions);

      var reset = document.getElementById("resetTool");
      if (reset) {
        reset.addEventListener("click", function () {
          location.reload();
        });
      }
    }, 1400);
  }

  // HTML to PDF URL mode
  var urlForm = document.getElementById("urlForm");
  if (urlForm) {
    urlForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("urlInput");
      if (!input || !input.value.trim()) return;
      files = [{ name: input.value.trim(), size: 0 }];
      runProcess();
    });
  }
})();
