(function () {
  "use strict";

  var id = document.body.getAttribute("data-link-id");
  if (!id) return;

  var downloadUrl = location.origin + "/d/" + encodeURIComponent(id);

  var copyBtn = document.getElementById("copyLinkPageBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(downloadUrl).then(function () {
          copyBtn.textContent = "Copied!";
          setTimeout(function () {
            copyBtn.textContent = "Copy download link";
          }, 1500);
        });
      }
    });
  }

  var revokeBtn = document.getElementById("revokeLinkPageBtn");
  if (revokeBtn) {
    revokeBtn.addEventListener("click", function () {
      if (!confirm("Cancel this download link?")) return;
      fetch("/api/file-link/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function (r) {
          return r.json();
        })
        .then(function () {
          location.reload();
        })
        .catch(function (err) {
          alert(err.message || String(err));
        });
    });
  }

  // Refresh stats periodically while page is open
  function refresh() {
    fetch("/api/file-link/" + encodeURIComponent(id))
      .then(function (r) {
        return r.json();
      })
      .then(function (meta) {
        var el = document.getElementById("statDownloads");
        if (el) el.textContent = String(meta.downloads || 0);
      })
      .catch(function () {});
  }
  setInterval(refresh, 5000);
})();
