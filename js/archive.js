(function () {
  var ALIASES = {
    "xpp": "xpp",
    "x++": "xpp",
    "axapta": "xpp",
    "csharp": "csharp",
    "cs": "csharp",
    "c#": "csharp",
    "ps": "powershell",
    "powershell": "powershell",
    "dynamics365": "dynamics-365",
    "dynamics-365": "dynamics-365",
    "visualstudio": "visual-studio",
    "visual-studio": "visual-studio",
    "powerplatform": "power-platform",
    "power-platform": "power-platform",
    "datamigration": "data-migration",
    "data-migration": "data-migration",
    "traceparser": "traceparser",
    "debugging": "debugging",
    "performance": "performance",
    "environment": "environment"
  };

  function tagSlug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\+\+/g, "pp")
      .replace(/\+/g, "")
      .replace(/#/g, "sharp")
      .replace(/\s+/g, "-")
      .replace(/\//g, "");
  }

  function slugFromHash() {
    var raw = "";
    try {
      raw = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    } catch (error) {
      raw = (location.hash || "").replace(/^#/, "");
    }
    if (!raw || raw === "all") return "";
    if (raw.indexOf("tag=") === 0) return tagSlug(raw.slice(4));
    if (raw.indexOf("tag-") === 0) {
      var rest = raw.slice(4).toLowerCase();
      return ALIASES[rest] || rest;
    }
    var key = raw.toLowerCase();
    return ALIASES[key] || tagSlug(raw);
  }

  function searchUrl() {
    var title = document.querySelector(".site-title");
    var href = (title && title.getAttribute("href")) || "/";
    return href.replace(/\/?$/, "/") + "search.json";
  }

  var input = document.getElementById("archive-search");
  var pills = document.getElementById("tag-pills");
  var status = document.getElementById("archive-status");
  if (!input || !pills) return;

  var posts = Array.prototype.slice.call(document.querySelectorAll(".archive-post"));
  var years = Array.prototype.slice.call(document.querySelectorAll(".archive-year"));
  var activeTag = "";
  var index = {};

  posts.forEach(function (post) {
    index[post.getAttribute("data-url")] = (post.textContent || "").toLowerCase();
  });

  fetch(searchUrl(), { credentials: "same-origin" })
    .then(function (response) { return response.ok ? response.json() : []; })
    .then(function (data) {
      (data || []).forEach(function (item) {
        var tags = Array.isArray(item.tags) ? item.tags.join(" ") : (item.tags || "");
        var blob = [item.title, tags, item.description, item.content].join(" ").toLowerCase();
        index[item.url] = blob;
        if (item.url && item.url.charAt(0) !== "/") index["/" + item.url] = blob;
      });
      apply();
    })
    .catch(function () { apply(); });

  function setActivePill(slug) {
    Array.prototype.forEach.call(pills.querySelectorAll(".tag-pill"), function (pill) {
      var on = (pill.getAttribute("data-tag") || "") === slug;
      pill.classList.toggle("is-active", on);
      pill.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function apply() {
    var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var visible = 0;
    posts.forEach(function (post) {
      var tags = (post.getAttribute("data-tags") || "").split(/\s+/).filter(Boolean);
      var tagOk = !activeTag || tags.indexOf(activeTag) !== -1;
      var haystack = index[post.getAttribute("data-url")] || (post.textContent || "").toLowerCase();
      var textOk = terms.every(function (term) { return haystack.indexOf(term) !== -1; });
      var show = tagOk && textOk;
      post.hidden = !show;
      if (show) visible += 1;
    });
    years.forEach(function (year) {
      var any = year.querySelector(".archive-post:not([hidden])");
      year.hidden = !any;
    });
    if (status) {
      status.textContent = visible === 1 ? "1 post" : visible + " posts";
    }
  }

  pills.addEventListener("click", function (event) {
    var pill = event.target.closest(".tag-pill");
    if (!pill) return;
    activeTag = pill.getAttribute("data-tag") || "";
    setActivePill(activeTag);
    var next = activeTag ? "#tag-" + activeTag : location.pathname;
    if (history.replaceState) history.replaceState(null, "", next);
    apply();
  });

  input.addEventListener("input", apply);

  window.addEventListener("hashchange", function () {
    activeTag = slugFromHash();
    setActivePill(activeTag);
    apply();
  });

  activeTag = slugFromHash();
  setActivePill(activeTag);
  apply();
})();
