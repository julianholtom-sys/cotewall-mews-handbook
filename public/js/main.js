(function () {
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileMq =
    window.matchMedia && window.matchMedia("(max-width: 860px)");
  var rail = document.querySelector("nav.rail");

  function railOffset() {
    if (!rail) return 24;
    if (mobileMq && mobileMq.matches) {
      return Math.ceil(rail.getBoundingClientRect().height);
    }
    return 24;
  }

  function syncRailOffset() {
    document.documentElement.style.setProperty(
      "--rail-offset",
      railOffset() + "px"
    );
  }

  syncRailOffset();
  window.addEventListener("resize", syncRailOffset);

  function fitKickerSub() {
    var brand = document.querySelector(".mast .kicker-brand");
    var sub = document.querySelector(".mast .kicker-sub");
    if (!brand || !sub) return;
    sub.style.fontSize = "";
    var target = brand.getBoundingClientRect().width * 0.8;
    if (target < 40) return;
    var size = parseFloat(window.getComputedStyle(sub).fontSize) || 24;
    var width = sub.getBoundingClientRect().width;
    if (width < 1) return;
    size = Math.max(14, size * (target / width));
    sub.style.fontSize = size.toFixed(2) + "px";
  }
  function scheduleFitKickerSub() {
    fitKickerSub();
    window.setTimeout(fitKickerSub, 50);
    window.setTimeout(fitKickerSub, 300);
  }
  scheduleFitKickerSub();
  window.addEventListener("resize", fitKickerSub);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleFitKickerSub).catch(function () {});
  }

  var links = Array.prototype.slice.call(
    document.querySelectorAll("nav.rail a")
  );
  var map = {};
  links.forEach(function (a) {
    map[a.getAttribute("href").slice(1)] = a;
  });
  var current = null;
  function setOn(id) {
    if (current === id) return;
    current = id;
    links.forEach(function (a) {
      a.classList.remove("on");
      a.removeAttribute("aria-current");
    });
    if (map[id]) {
      map[id].classList.add("on");
      map[id].setAttribute("aria-current", "true");
    }
  }

  var sections = Array.prototype.slice.call(
    document.querySelectorAll("main section")
  );

  function updateActiveFromScroll() {
    var mobile = mobileMq && mobileMq.matches;
    var line = mobile
      ? railOffset() + 12
      : Math.max(80, Math.round(window.innerHeight * 0.28));
    var active = sections.length ? sections[0].id : null;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= line) {
        active = sections[i].id;
      }
    }
    if (active) setOn(active);
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    var el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    syncRailOffset();
    if (map[id]) setOn(id);
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      updateActiveFromScroll();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  updateActiveFromScroll();

  if ("IntersectionObserver" in window && !reduce) {
    var revealIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            revealIo.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    sections.forEach(function (s) {
      revealIo.observe(s);
    });
  } else {
    sections.forEach(function (s) {
      s.classList.add("in");
    });
  }

  var libraryForm = document.getElementById("library-gate");
  var libraryBrowser = document.getElementById("library-browser");
  var libraryList = document.getElementById("library-list");
  var libraryCrumbs = document.getElementById("library-crumbs");
  var libraryStatus = document.getElementById("library-browser-status");
  var libraryBack = document.getElementById("library-back");
  var libraryClose = document.getElementById("library-close");
  var libraryMsg = document.getElementById("library-gate-msg");
  var libraryTrail = [];

  function showLibraryMsg(text) {
    if (!libraryMsg) return;
    libraryMsg.hidden = !text;
    libraryMsg.textContent = text || "";
  }

  function setBrowserStatus(text) {
    if (!libraryStatus) return;
    libraryStatus.textContent = text || "";
  }

  function updateBackButton() {
    if (!libraryBack) return;
    libraryBack.disabled = libraryTrail.length < 2;
  }

  function goBack() {
    if (libraryTrail.length < 2) return;
    var parent = libraryTrail[libraryTrail.length - 2];
    openFolder(parent.id, parent.name, libraryTrail.length - 2);
  }

  function parseJsonResponse(res) {
    return res.text().then(function (text) {
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_) {
        data = null;
      }
      return { ok: res.ok, status: res.status, data: data };
    });
  }

  function renderCrumbs() {
    if (!libraryCrumbs) return;
    libraryCrumbs.innerHTML = "";
    libraryTrail.forEach(function (crumb, index) {
      if (index > 0) {
        var sep = document.createElement("span");
        sep.className = "library-crumb-sep";
        sep.textContent = "/";
        libraryCrumbs.appendChild(sep);
      }
      if (index === libraryTrail.length - 1) {
        var currentCrumb = document.createElement("span");
        currentCrumb.className = "library-crumb-current";
        currentCrumb.textContent = crumb.name;
        libraryCrumbs.appendChild(currentCrumb);
      } else {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "library-crumb";
        btn.textContent = crumb.name;
        btn.addEventListener("click", function () {
          openFolder(crumb.id, crumb.name, index);
        });
        libraryCrumbs.appendChild(btn);
      }
    });
    updateBackButton();
  }

  function renderItems(items) {
    if (!libraryList) return;
    libraryList.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "library-empty";
      empty.textContent = "This folder is empty.";
      libraryList.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className =
        "library-item library-item--" + (item.type === "dir" ? "dir" : "file");

      var main = document.createElement("div");
      main.className = "library-item-main";

      var kind = document.createElement("span");
      kind.className = "library-item-kind";
      kind.textContent = item.type === "dir" ? "Folder" : "File";
      main.appendChild(kind);

      if (item.type === "dir") {
        var openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "library-item-name";
        openBtn.textContent = item.name;
        openBtn.addEventListener("click", function () {
          openFolder(item.id, item.name, libraryTrail.length);
        });
        main.appendChild(openBtn);
      } else {
        var name = document.createElement("span");
        name.className = "library-item-name";
        name.textContent = item.name;
        main.appendChild(name);
      }

      li.appendChild(main);

      var actions = document.createElement("div");
      actions.className = "library-item-actions";

      if (item.type === "dir") {
        var browse = document.createElement("button");
        browse.type = "button";
        browse.textContent = "Open";
        browse.addEventListener("click", function () {
          openFolder(item.id, item.name, libraryTrail.length);
        });
        actions.appendChild(browse);
      } else {
        var view = document.createElement("a");
        view.href = "/api/library/download/" + item.id;
        view.target = "_blank";
        view.rel = "noopener noreferrer";
        view.textContent = "View / save";
        actions.appendChild(view);
      }

      li.appendChild(actions);
      libraryList.appendChild(li);
    });
  }

  function showBrowser() {
    if (libraryForm) libraryForm.hidden = true;
    if (libraryBrowser) libraryBrowser.hidden = false;
  }

  function hideBrowser() {
    if (libraryBrowser) libraryBrowser.hidden = true;
    if (libraryForm) libraryForm.hidden = false;
    libraryTrail = [];
    if (libraryList) libraryList.innerHTML = "";
    setBrowserStatus("");
    updateBackButton();
  }

  function openFolder(id, name, trailIndex) {
    setBrowserStatus("Loading…");
    if (typeof trailIndex === "number") {
      libraryTrail = libraryTrail.slice(0, trailIndex);
    }
    if (!libraryTrail.length || libraryTrail[libraryTrail.length - 1].id !== id) {
      libraryTrail.push({ id: id, name: name });
    }
    renderCrumbs();

    fetch("/api/library/browse?id=" + encodeURIComponent(id), {
      credentials: "same-origin",
    })
      .then(parseJsonResponse)
      .then(function (result) {
        if (!result.ok) {
          setBrowserStatus(
            (result.data && result.data.error) ||
              "Could not open that folder."
          );
          if (result.status === 401) hideBrowser();
          return;
        }
        if (result.data && result.data.name) {
          libraryTrail[libraryTrail.length - 1].name = result.data.name;
          renderCrumbs();
        }
        setBrowserStatus("");
        renderItems((result.data && result.data.items) || []);
      })
      .catch(function () {
        setBrowserStatus("Could not reach the library. Please try again.");
      });
  }

  function unlockLibrary(rootId, rootName) {
    showLibraryMsg("");
    showBrowser();
    libraryTrail = [];
    openFolder(rootId, rootName || "Society documents", 0);
  }

  if (libraryForm) {
    libraryForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("library-password");
      var password = input ? input.value : "";
      showLibraryMsg("");
      fetch("/api/library-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: password }),
      })
        .then(parseJsonResponse)
        .then(function (result) {
          if (result.ok && result.data && result.data.ok) {
            if (input) input.value = "";
            unlockLibrary(result.data.rootId, result.data.rootName);
            return;
          }
          showLibraryMsg(
            (result.data && result.data.error) ||
              "Could not open the library. Please try again."
          );
        })
        .catch(function () {
          showLibraryMsg("Could not reach the server. Please try again.");
        });
    });
  }

  if (libraryBack) {
    libraryBack.addEventListener("click", goBack);
  }

  if (libraryClose) {
    libraryClose.addEventListener("click", function () {
      fetch("/api/library/logout", {
        method: "POST",
        credentials: "same-origin",
      }).finally(hideBrowser);
    });
  }

  fetch("/api/library/session", { credentials: "same-origin" })
    .then(parseJsonResponse)
    .then(function (result) {
      if (result.ok && result.data && result.data.ok) {
        unlockLibrary(result.data.rootId, result.data.rootName);
      }
    })
    .catch(function () {});
})();
