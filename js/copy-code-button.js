(function () {
  var LABELS = {
    "xpp": "X++",
    "axapta": "X++",
    "x++": "X++",
    "csharp": "C#",
    "cs": "C#",
    "c#": "C#",
    "powershell": "PowerShell",
    "ps": "PowerShell",
    "ps1": "PowerShell",
    "tsql": "T-SQL",
    "sql": "T-SQL",
    "javascript": "JavaScript",
    "js": "JavaScript",
    "shell": "Shell",
    "bash": "Shell",
    "sh": "Shell",
    "cmd": "CMD",
    "dos": "CMD",
    "bat": "CMD",
    "plaintext": "",
    "text": "",
    "txt": ""
  };

  function languageOf(code, pre) {
    var sources = [code.className, pre.className];
    var parent = pre.parentNode;
    if (parent && parent.className) sources.push(parent.className);
    if (parent && parent.parentNode && parent.parentNode.className) sources.push(parent.parentNode.className);
    var classes = sources.join(" ").split(/\s+/);
    for (var i = 0; i < classes.length; i++) {
      if (classes[i].indexOf("language-") === 0) return classes[i].slice("language-".length).toLowerCase();
      if (classes[i].indexOf("lang-") === 0) return classes[i].slice("lang-".length).toLowerCase();
    }
    return "";
  }

  function labelFor(language) {
    if (!language) return "Code";
    if (Object.prototype.hasOwnProperty.call(LABELS, language)) return LABELS[language];
    return language;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand("copy")) resolve();
        else reject(new Error("copy failed"));
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(area);
      }
    });
  }

  function enhance() {
    document.querySelectorAll("pre").forEach(function (pre) {
      if (pre.closest(".code-block-wrapper")) return;
      var code = pre.querySelector("code") || pre;
      var language = languageOf(code, pre);
      var label = labelFor(language);

      var wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";

      var header = document.createElement("div");
      header.className = "code-block-header";

      if (label) {
        var name = document.createElement("span");
        name.className = "code-block-lang";
        name.textContent = label;
        header.appendChild(name);
      } else {
        header.appendChild(document.createElement("span"));
      }

      var button = document.createElement("button");
      button.type = "button";
      button.className = "copy-code-button";
      button.textContent = "Copy";
      button.addEventListener("click", function () {
        var source = code.innerText || code.textContent || "";
        copyText(source).then(function () {
          button.blur();
          button.classList.add("is-copied");
          button.textContent = "\u2713 Copied!";
          window.setTimeout(function () {
            button.classList.remove("is-copied");
            button.textContent = "Copy";
          }, 2000);
        }, function () {
          button.textContent = "Error";
          window.setTimeout(function () { button.textContent = "Copy"; }, 2000);
        });
      });
      header.appendChild(button);

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });
  }

  function start() {
    if (window.hljs && !window.__hljsReady) {
      document.addEventListener("hljs-ready", enhance, { once: true });
      return;
    }
    enhance();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
