function optionsForTool(tool) {
  const p = tool.path;
  if (p === "/split_pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Split mode
          <select name="mode" id="opt-mode">
            <option value="pages">Extract all pages</option>
            <option value="range">Custom ranges</option>
          </select>
        </label>
        <label class="opt-ranges hidden">Ranges (e.g. 1-3,5)
          <input name="ranges" id="opt-ranges" type="text" placeholder="1-3,5,8-10" />
        </label>
      </div>`;
  }
  if (p === "/rotate_pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Rotation
          <select name="angle" id="opt-angle">
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </select>
        </label>
      </div>`;
  }
  if (p === "/organize-pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Page order (comma-separated, 1-based)
          <input name="order" id="opt-order" type="text" placeholder="1,3,2,4" />
        </label>
      </div>`;
  }
  if (p === "/add_pdf_page_number") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Position
          <select name="position" id="opt-position">
            <option value="bottom-center">Bottom center</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="top-center">Top center</option>
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
          </select>
        </label>
        <label>Start at
          <input name="start" id="opt-start" type="number" min="1" value="1" />
        </label>
      </div>`;
  }
  if (p === "/pdf_add_watermark") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Watermark text
          <input name="text" id="opt-text" type="text" value="CONFIDENTIAL" />
        </label>
        <label>Opacity (0.1–1)
          <input name="opacity" id="opt-opacity" type="number" min="0.1" max="1" step="0.05" value="0.25" />
        </label>
      </div>`;
  }
  if (p === "/protect-pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Password
          <input name="password" id="opt-password" type="password" required placeholder="Set a password" />
        </label>
      </div>`;
  }
  if (p === "/unlock_pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Current password
          <input name="password" id="opt-password" type="password" placeholder="If encrypted" />
        </label>
      </div>`;
  }
  if (p === "/crop-pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Margin (points)
          <input name="margin" id="opt-margin" type="number" min="0" value="36" />
        </label>
      </div>`;
  }
  if (p === "/edit-pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Text to add
          <input name="text" id="opt-text" type="text" value="Edited with iLovePDF" />
        </label>
      </div>`;
  }
  if (p === "/sign-pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Signature name
          <input name="name" id="opt-name" type="text" placeholder="Your name" />
        </label>
      </div>`;
  }
  if (p === "/redact-pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Words to redact (comma-separated)
          <input name="terms" id="opt-terms" type="text" placeholder="secret, confidential" />
        </label>
      </div>`;
  }
  if (p === "/translate-pdf") {
    return `
      <div class="tool-options" id="toolOptions">
        <label>Target language code
          <input name="lang" id="opt-lang" type="text" value="es" placeholder="es, fr, de..." />
        </label>
      </div>`;
  }
  return `<div class="tool-options hidden" id="toolOptions"></div>`;
}

module.exports = { optionsForTool };
