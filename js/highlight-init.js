(function () {
  function boot() {
    if (!window.hljs) return;

    // highlight.min.js registers bash, csharp (aliases cs, c#), a small X++
    // stub, json, and cpp. xpp.min.js replaces that stub and keeps axapta / x++
    // as aliases. Extra files add powershell (alias ps), tsql, javascript
    // (alias js), and dos (alias cmd).
    if (hljs.getLanguage("xpp")) {
      hljs.registerAliases(["axapta", "x++"], { languageName: "xpp" });
    }
    if (hljs.getLanguage("bash")) {
      hljs.registerAliases(["shell"], { languageName: "bash" });
    }
    if (hljs.getLanguage("tsql")) {
      hljs.registerAliases(["sql"], { languageName: "tsql" });
    }

    hljs.configure({
      ignoreUnescapedHTML: true,
      cssSelector: "pre code",
      // Keep "+" and "#" in fence names such as x++ / c# / c++.
      languageDetectRe: /\blang(?:uage)?-([a-z0-9_+#-]+)/i
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
