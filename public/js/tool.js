(function () {
  "use strict";

  var toolPath = document.body.getAttribute("data-tool") || location.pathname;
  var processLabel =
    document.body.getAttribute("data-process-label") || "Process";
  var processStatusText =
    document.body.getAttribute("data-process-status") || "Processing...";

  // Vercel serverless body limit ~4.5MB. Prefer browser for pdf-lib tools.
  var SERVER_PAYLOAD_LIMIT = 3.5 * 1024 * 1024;

  var files = [];
  var fileIdSeq = 0;
  var processing = false;
  var downloadUrl = null;

  var workArea = document.getElementById("workArea");
  var uploader = document.getElementById("uploader");
  var pickBtn = document.getElementById("pickfiles");
  var diskBtn = document.getElementById("uploadDisk");
  var fileInput = document.getElementById("fileInput");
  var fileGroups = document.getElementById("fileGroups");
  var sidebar = document.getElementById("sidebar");
  var toolOptions = document.getElementById("toolOptions");
  var processTask = document.getElementById("processTask");
  var processTaskText = document.getElementById("processTaskTextBtn");
  var processTaskWrapper = document.getElementById("processTaskWrapper");
  var uploadingEl = document.getElementById("uploading");
  var processEl = document.getElementById("process");
  var processText = document.getElementById("processText");
  var downloadEl = document.getElementById("download");
  var downloadLink = document.getElementById("downloadLink");
  var downloadStartOver = document.getElementById("downloadStartOver");
  var createFileLinkBtn = document.getElementById("createFileLinkBtn");
  var fileLinkBox = document.getElementById("fileLinkBox");
  var fileLinkInput = document.getElementById("fileLinkInput");
  var copyFileLinkBtn = document.getElementById("copyFileLinkBtn");
  var fileLinkQr = document.getElementById("fileLinkQr");
  var fileLinkTrack = document.getElementById("fileLinkTrack");
  var revokeFileLinkBtn = document.getElementById("revokeFileLinkBtn");
  var fileLinkStatus = document.getElementById("fileLinkStatus");
  var sharePanel = document.getElementById("sharePanel");
  var lastResultBlob = null;
  var lastResultName = null;
  var lastResultType = null;
  var activeLinkId = null;
  var uploadCurrent = document.getElementById("uploadCurrent");
  var uploadTotal = document.getElementById("uploadTotal");
  var uploadFileName = document.getElementById("uploadFileName");
  var uploadPercent = document.getElementById("uploadPercent");
  var uploadBarFill = document.getElementById("uploadBarFill");
  var topUploadBar = document.getElementById("topUploadBar");
  var topUploadBarFill = document.getElementById("topUploadBarFill");
  var timeLeft = document.getElementById("timeLeft");
  var uploadSpeed = document.getElementById("uploadSpeed");

  var SVG_REMOVE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><polygon fill="#47474F" fill-rule="evenodd" points="12 1.208 10.79 0 6 4.792 1.21 0 0 1.208 4.79 6 0 10.792 1.21 12 6 7.208 10.79 12 12 10.792 7.21 6"/></svg>';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function totalSize() {
    return files.reduce(function (sum, item) {
      return sum + (item.file.size || 0);
    }, 0);
  }

  function markActiveNav() {
    var path = location.pathname.replace(/\/$/, "") || "/";
    document.querySelectorAll("header a[href]").forEach(function (a) {
      var href = (a.getAttribute("href") || "").replace(/\/$/, "");
      if (!href || href === "#") return;
      if (href === path) {
        a.classList.add("active");
        var li = a.closest("li");
        if (li) li.classList.add("active");
      }
    });
  }

  function collectOptions() {
    var opts = {};
    if (!toolOptions) return opts;
    toolOptions.querySelectorAll("input, select, textarea").forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") {
        opts[el.name] = el.checked;
        return;
      }
      if (el.type === "radio") {
        if (el.checked) opts[el.name] = el.value;
        return;
      }
      opts[el.name] = el.value;
    });
    return opts;
  }

  function shouldUseClient() {
    if (!window.ClientPDF || !window.ClientPDF.canProcessClient(toolPath)) {
      return false;
    }
    // Always client for supported tools — avoids Vercel 413 on large merges
    return true;
  }

  function syncWorkspace() {
    var has = files.length > 0;
    document.body.classList.toggle("sidebar-active", has && !processing);
    document.body.classList.toggle("first-file-ready", has);

    if (uploader) uploader.style.display = has ? "none" : "";
    if (fileGroups) {
      fileGroups.style.display = has ? "flex" : "none";
      fileGroups.classList.toggle("active", has);
    }
    if (sidebar) {
      sidebar.style.display = has ? "flex" : "";
    }
    if (processTask) {
      var enable = has && !processing;
      if (toolPath === "/merge_pdf") enable = files.length >= 2 && !processing;
      processTask.style.display = enable || (has && !processing) ? "flex" : "none";
      if (has && !processing) processTask.style.display = "flex";
      else processTask.style.display = "none";
      processTask.disabled = !enable;
      processTask.classList.toggle("disabled", !enable);
    }
    if (processTaskText) processTaskText.textContent = processLabel;
    if (processTaskWrapper) {
      processTaskWrapper.style.display = has && !processing ? "block" : "none";
    }
  }

  function renderFiles() {
    if (!fileGroups) return;
    if (!files.length) {
      fileGroups.innerHTML = "";
      syncWorkspace();
      return;
    }

    var listHtml = files
      .map(function (item, index) {
        var ext = (item.file.name.split(".").pop() || "pdf").toUpperCase();
        var icon =
          ext === "PDF"
            ? "/img/filetype/pdf.svg"
            : ext === "DOC" || ext === "DOCX"
              ? "/img/filetype/word.svg"
              : "/img/filetype/pdf.svg";
        return (
          '<div class="file file--' +
          escapeHtml(toolPath.replace(/^\//, "")) +
          ' ui-sortable-handle" id="' +
          item.id +
          '" data-index="' +
          index +
          '" data-size="' +
          item.file.size +
          '" data-extension="' +
          escapeHtml(ext) +
          '" draggable="true">' +
          '<div class="file__actions">' +
          '<a class="file__btn remove tooltip--top tooltip" href="javascript:;" title="Delete" data-remove="' +
          item.id +
          '">' +
          SVG_REMOVE +
          "</a>" +
          "</div>" +
          '<div class="file__canvas">' +
          '<img src="' +
          icon +
          '" alt="" width="54" height="64" draggable="false">' +
          "</div>" +
          '<div class="file__info">' +
          '<span class="file__info__name" title="' +
          escapeHtml(item.file.name) +
          '">' +
          escapeHtml(item.file.name) +
          "</span>" +
          "</div>" +
          '<div class="tool--dropable"></div>' +
          "</div>"
        );
      })
      .join("");

    fileGroups.innerHTML =
      '<div id="filesGroup0" class="tool__workarea__group active">' +
      '<div class="tool__workarea__files ui-sortable" id="filesList">' +
      listHtml +
      '<div class="file file--add">' +
      '<button type="button" class="file__add" id="addMoreFilesBtn">' +
      '<span class="file__add__plus">+</span>' +
      "<span>Add more files</span>" +
      "</button>" +
      "</div>" +
      "</div></div>";

    fileGroups.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = btn.getAttribute("data-remove");
        files = files.filter(function (f) {
          return f.id !== id;
        });
        renderFiles();
      });
    });

    var addMore = document.getElementById("addMoreFilesBtn");
    if (addMore && fileInput) {
      addMore.addEventListener("click", function () {
        fileInput.click();
      });
    }

    bindSortable();
    syncWorkspace();
  }

  function bindSortable() {
    var list = document.getElementById("filesList");
    if (!list) return;
    var cards = list.querySelectorAll(".file:not(.file--add)");
    cards.forEach(function (el) {
      el.addEventListener("dragstart", function (e) {
        el.classList.add("file--dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", el.getAttribute("data-index"));
      });
      el.addEventListener("dragend", function () {
        el.classList.remove("file--dragging");
        list.querySelectorAll(".file--drag-over").forEach(function (n) {
          n.classList.remove("file--drag-over");
        });
      });
      el.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        el.classList.add("file--drag-over");
      });
      el.addEventListener("dragleave", function () {
        el.classList.remove("file--drag-over");
      });
      el.addEventListener("drop", function (e) {
        e.preventDefault();
        el.classList.remove("file--drag-over");
        var from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        var to = parseInt(el.getAttribute("data-index"), 10);
        if (isNaN(from) || isNaN(to) || from === to) return;
        var moved = files.splice(from, 1)[0];
        files.splice(to, 0, moved);
        renderFiles();
      });
    });
  }

  function addFiles(list) {
    list.forEach(function (f) {
      files.push({ id: "file-" + ++fileIdSeq, file: f });
    });
    hideOverlays();
    renderFiles();
  }

  function hideOverlays() {
    document.body.classList.remove("process-run", "upload-run");
    if (uploadingEl) uploadingEl.style.display = "none";
    if (processEl) {
      processEl.style.display = "none";
      processEl.classList.remove("active", "process--error", "process--done");
    }
    if (downloadEl) downloadEl.hidden = true;
    if (workArea) workArea.style.display = "";
    var toolRoot = document.querySelector(".tool");
    if (toolRoot) toolRoot.style.display = "";
  }

  function showUploading() {
    document.body.classList.add("process-run", "upload-run");
    if (workArea) workArea.style.display = "none";
    var toolRoot = document.querySelector(".tool");
    if (toolRoot) toolRoot.style.display = "none";
    if (processTask) processTask.style.display = "none";
    if (processEl) processEl.style.display = "none";
    if (downloadEl) downloadEl.hidden = true;
    if (uploadingEl) uploadingEl.style.display = "flex";
    if (uploadTotal) uploadTotal.textContent = String(files.length);
    if (topUploadBar) topUploadBar.style.display = "block";
  }

  function setUploadProgress(pct, currentIdx, name) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    if (uploadPercent) uploadPercent.textContent = pct + "%";
    if (uploadBarFill) uploadBarFill.style.width = pct + "%";
    if (topUploadBarFill) topUploadBarFill.style.width = pct + "%";
    if (uploadCurrent) uploadCurrent.textContent = String(currentIdx);
    if (uploadFileName) uploadFileName.textContent = name || "";
    if (uploadSpeed) uploadSpeed.textContent = (1.2 + pct / 80).toFixed(1) + " MB/S";
    if (timeLeft) {
      var left = Math.max(1, Math.round((100 - pct) / 18));
      timeLeft.textContent = left + " seconds";
    }
  }

  function showProcessing(message) {
    document.body.classList.add("process-run");
    document.body.classList.remove("upload-run");
    if (uploadingEl) uploadingEl.style.display = "none";
    if (downloadEl) downloadEl.hidden = true;
    if (workArea) workArea.style.display = "none";
    var toolRoot = document.querySelector(".tool");
    if (toolRoot) toolRoot.style.display = "none";
    if (processTask) processTask.style.display = "none";
    if (processEl) {
      processEl.style.display = "flex";
      processEl.classList.add("active");
      processEl.classList.remove("process--error", "process--done");
      var img = processEl.querySelector("img");
      if (img) img.style.display = "";
    }
    if (processText) processText.textContent = message || processStatusText;
  }

  function showError(message) {
    document.body.classList.add("process-run");
    if (uploadingEl) uploadingEl.style.display = "none";
    if (processEl) {
      processEl.style.display = "flex";
      processEl.classList.add("active", "process--error");
      var img = processEl.querySelector("img");
      if (img) img.style.display = "none";
    }
    if (processText) processText.textContent = message || "Something went wrong";
    var actions = processEl && processEl.querySelector(".process-actions");
    if (processEl && !actions) {
      actions = document.createElement("div");
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

  function showDownload(blob, filename) {
    document.body.classList.add("process-run");
    document.body.classList.remove("upload-run");
    if (uploadingEl) uploadingEl.style.display = "none";
    if (processEl) processEl.style.display = "none";
    if (workArea) workArea.style.display = "none";
    var toolRoot = document.querySelector(".tool");
    if (toolRoot) toolRoot.style.display = "none";
    if (processTask) processTask.style.display = "none";
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);
    lastResultBlob = blob;
    lastResultName = filename;
    lastResultType = blob.type || "application/octet-stream";
    activeLinkId = null;
    if (fileLinkBox) fileLinkBox.hidden = true;
    if (sharePanel) sharePanel.hidden = false;
    if (fileLinkStatus) fileLinkStatus.textContent = "";
    if (downloadLink) {
      downloadLink.href = downloadUrl;
      downloadLink.download = filename;
      downloadLink.textContent = "Download " + filename;
    }
    if (downloadEl) downloadEl.hidden = false;
  }

  async function createShareLink() {
    if (!lastResultBlob) return;
    if (lastResultBlob.size > 3.5 * 1024 * 1024) {
      if (fileLinkStatus) {
        fileLinkStatus.textContent =
          "File is too large to create a share link on this host (Vercel ~4.5MB limit). Download it instead.";
      }
      return;
    }
    if (createFileLinkBtn) {
      createFileLinkBtn.disabled = true;
      createFileLinkBtn.textContent = "Creating link…";
    }
    if (fileLinkStatus) fileLinkStatus.textContent = "";
    try {
      var fd = new FormData();
      fd.append("file", lastResultBlob, lastResultName || "download.bin");
      fd.append("filename", lastResultName || "download.bin");
      fd.append("contentType", lastResultType || "application/octet-stream");
      fd.append("tool", toolPath);
      var res = await fetch("/api/file-link", { method: "POST", body: fd });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.error || "Could not create link (" + res.status + ")");
      activeLinkId = data.id;
      if (fileLinkInput) fileLinkInput.value = data.downloadUrl;
      if (fileLinkTrack) {
        fileLinkTrack.href = data.trackUrl;
        fileLinkTrack.textContent = "Track downloads (" + (data.downloads || 0) + ")";
      }
      if (fileLinkQr) {
        fileLinkQr.src =
          "https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=" +
          encodeURIComponent(data.downloadUrl);
      }
      if (fileLinkBox) fileLinkBox.hidden = false;
      if (sharePanel) sharePanel.hidden = true;
      if (fileLinkStatus) fileLinkStatus.textContent = "Link ready — active until cancelled.";
    } catch (err) {
      if (fileLinkStatus) fileLinkStatus.textContent = err.message || String(err);
    } finally {
      if (createFileLinkBtn) {
        createFileLinkBtn.disabled = false;
        createFileLinkBtn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Share download link or scan QR';
      }
    }
  }

  function fakeUploadProgress() {
    return new Promise(function (resolve) {
      showUploading();
      var bytes = totalSize();
      var duration = Math.min(2000, Math.max(700, (bytes / (1024 * 1024)) * 450));
      var started = Date.now();
      var i = 0;

      function tick() {
        var elapsed = Date.now() - started;
        var pct = Math.min(99, (elapsed / duration) * 100);
        var idx = Math.min(files.length, Math.max(1, Math.ceil((pct / 100) * files.length)));
        var name = files[idx - 1] ? files[idx - 1].file.name : "";
        setUploadProgress(pct, idx, name);
        if (elapsed >= duration) {
          setUploadProgress(100, files.length, files.length ? files[files.length - 1].file.name : "");
          setTimeout(resolve, 150);
          return;
        }
        i += 1;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  async function runServerProcess(options) {
    var form = new FormData();
    form.append("tool", toolPath);
    form.append("options", JSON.stringify(options));
    Object.keys(options || {}).forEach(function (key) {
      form.append(key, options[key]);
    });
    files.forEach(function (item) {
      form.append("files", item.file, item.file.name);
    });
    var res = await fetch("/api/process", { method: "POST", body: form });
    if (!res.ok) {
      var errJson = null;
      try {
        errJson = await res.json();
      } catch (e) {}
      if (res.status === 413) {
        throw new Error(
          "File too large for server upload (Vercel ~4.5MB limit). This tool needs a smaller file, or use a browser-side tool like Merge/Split/Rotate."
        );
      }
      throw new Error((errJson && errJson.error) || "Processing failed (" + res.status + ")");
    }
    var disposition = res.headers.get("Content-Disposition") || "";
    var match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
    var filename = decodeURIComponent((match && (match[1] || match[2])) || "download.bin");
    return { blob: await res.blob(), filename: filename };
  }

  async function runProcess() {
    if (processing || !files.length) return;
    if (toolPath === "/merge_pdf" && files.length < 2) {
      showError("Please select at least 2 PDF files to merge");
      return;
    }

    processing = true;
    syncWorkspace();

    try {
      // Match production feel: upload progress UI first (client never sends large payloads)
      await fakeUploadProgress();
      showProcessing(processStatusText);

      var options = collectOptions();
      var result;

      if (shouldUseClient()) {
        result = await window.ClientPDF.process(
          toolPath,
          files.map(function (f) {
            return f.file;
          }),
          options
        );
      } else {
        if (totalSize() > SERVER_PAYLOAD_LIMIT) {
          throw new Error(
            "Combined upload exceeds Vercel’s ~4.5MB limit. Split files or use a client-side tool (Merge, Split, Rotate, Organize)."
          );
        }
        result = await runServerProcess(options);
      }

      showDownload(result.blob, result.filename);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      processing = false;
    }
  }

  // HTML to PDF: URL form (no file upload)
  var urlForm = document.getElementById("urlForm");
  var urlInput = document.getElementById("urlInput");
  if (urlForm && urlInput && toolPath === "/html-to-pdf") {
    urlForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = (urlInput.value || "").trim();
      if (!url) return;
      (async function () {
        if (processing) return;
        processing = true;
        try {
          showProcessing(processStatusText || "Converting HTML to PDF...");
          var form = new FormData();
          form.append("tool", toolPath);
          form.append("url", url);
          var res = await fetch("/api/process", { method: "POST", body: form });
          if (!res.ok) {
            var errJson = null;
            try {
              errJson = await res.json();
            } catch (_) {}
            throw new Error((errJson && errJson.error) || "Conversion failed (" + res.status + ")");
          }
          var disposition = res.headers.get("Content-Disposition") || "";
          var match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
          var filename = decodeURIComponent((match && (match[1] || match[2])) || "page.pdf");
          showDownload(await res.blob(), filename);
        } catch (err) {
          showError(err.message || String(err));
        } finally {
          processing = false;
        }
      })();
    });
  }

  // Wire pickers
  if (pickBtn && fileInput) {
    pickBtn.addEventListener("click", function (e) {
      e.preventDefault();
      fileInput.click();
    });
  }
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

  var modeSelect = document.getElementById("opt-mode");
  if (modeSelect) {
    modeSelect.addEventListener("change", function () {
      var ranges = document.querySelector(".opt-ranges");
      if (ranges) ranges.classList.toggle("hidden", modeSelect.value !== "range");
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

  if (processTask) {
    processTask.addEventListener("click", function (e) {
      e.preventDefault();
      runProcess();
    });
  }

  if (downloadStartOver) {
    downloadStartOver.addEventListener("click", function (e) {
      e.preventDefault();
      files = [];
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = null;
      lastResultBlob = null;
      lastResultName = null;
      activeLinkId = null;
      if (fileLinkBox) fileLinkBox.hidden = true;
      hideOverlays();
      renderFiles();
    });
  }

  if (createFileLinkBtn) {
    createFileLinkBtn.addEventListener("click", function (e) {
      e.preventDefault();
      createShareLink();
    });
  }

  if (copyFileLinkBtn) {
    copyFileLinkBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!fileLinkInput || !fileLinkInput.value) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fileLinkInput.value).then(function () {
          if (fileLinkStatus) fileLinkStatus.textContent = "Link copied.";
        });
      } else {
        fileLinkInput.select();
        document.execCommand("copy");
        if (fileLinkStatus) fileLinkStatus.textContent = "Link copied.";
      }
    });
  }

  if (revokeFileLinkBtn) {
    revokeFileLinkBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!activeLinkId) return;
      fetch("/api/file-link/" + encodeURIComponent(activeLinkId), { method: "DELETE" })
        .then(function (r) {
          return r.json();
        })
        .then(function () {
          activeLinkId = null;
          if (fileLinkBox) fileLinkBox.hidden = true;
          if (sharePanel) sharePanel.hidden = false;
          if (fileLinkStatus) fileLinkStatus.textContent = "Link cancelled.";
        })
        .catch(function (err) {
          if (fileLinkStatus) fileLinkStatus.textContent = err.message || String(err);
        });
    });
  }

  markActiveNav();
  syncWorkspace();
})();
