(function () {
  function boot() {
    if (!window.hljs) return;

    // highlight.min.js already registers bash, csharp (aliases cs, c#),
    // xpp (alias x++), json, and cpp. Extra files add powershell (alias ps),
    // tsql, javascript (alias js), and dos (alias cmd).
    if (hljs.getLanguage("xpp")) {
      hljs.registerAliases(["axapta"], { languageName: "xpp" });
    }
    if (hljs.getLanguage("bash")) {
      hljs.registerAliases(["shell"], { languageName: "bash" });
    }
    if (hljs.getLanguage("tsql")) {
      hljs.registerAliases(["sql"], { languageName: "tsql" });
    }

    hljs.configure({
      ignoreUnescapedHTML: true,
      cssSelector: "pre code"
    });
    hljs.highlightAll();
    window.__hljsReady = true;
    document.dispatchEvent(new Event("hljs-ready"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
