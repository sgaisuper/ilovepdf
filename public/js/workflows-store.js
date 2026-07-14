(function (global) {
  "use strict";

  var STORAGE_KEY = "ilovepdf_workflows_v1";

  function uid() {
    return "wf_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function readAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
  }

  function list() {
    return readAll().sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function get(id) {
    return readAll().find(function (w) {
      return w.id === id;
    }) || null;
  }

  function save(workflow) {
    var all = readAll();
    var now = Date.now();
    if (!workflow.id) {
      workflow.id = uid();
      workflow.createdAt = now;
    }
    workflow.updatedAt = now;
    if (!workflow.name) workflow.name = "My workflow";
    if (!Array.isArray(workflow.steps)) workflow.steps = [];
    var idx = all.findIndex(function (w) {
      return w.id === workflow.id;
    });
    if (idx >= 0) all[idx] = workflow;
    else all.unshift(workflow);
    writeAll(all);
    return workflow;
  }

  function remove(id) {
    writeAll(
      readAll().filter(function (w) {
        return w.id !== id;
      })
    );
  }

  global.WorkflowStore = {
    list: list,
    get: get,
    save: save,
    remove: remove,
  };
})(window);
