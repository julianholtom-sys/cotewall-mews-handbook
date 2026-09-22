(function () {
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var el = document.getElementById(a.getAttribute("href").slice(1));
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

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

  if ("IntersectionObserver" in window) {
    var visible = {};
    var navIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          visible[e.target.id] = e.isIntersecting;
        });
        for (var i = 0; i < sections.length; i++) {
          if (visible[sections[i].id]) {
            setOn(sections[i].id);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    sections.forEach(function (s) {
      navIo.observe(s);
    });

    if (!reduce) {
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
  } else {
    sections.forEach(function (s) {
      s.classList.add("in");
    });
  }

  setOn("scope");

  var libraryForm = document.getElementById("library-gate");
  if (libraryForm) {
    var libraryMsg = document.getElementById("library-gate-msg");
    libraryForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("library-password");
      var password = input ? input.value : "";
      if (libraryMsg) {
        libraryMsg.hidden = true;
        libraryMsg.textContent = "";
      }
      fetch("/api/library-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password }),
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var data = null;
            try {
              data = text ? JSON.parse(text) : null;
            } catch (_) {
              data = null;
            }
            return { ok: res.ok, status: res.status, data: data, raw: text };
          });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.url) {
            window.open(result.data.url, "_blank", "noopener,noreferrer");
            return;
          }
          if (libraryMsg) {
            libraryMsg.hidden = false;
            if (result.status === 404) {
              libraryMsg.textContent =
                "Library access is not available on this server yet. Ask a Director to deploy the latest site update.";
            } else {
              libraryMsg.textContent =
                (result.data && result.data.error) ||
                "Could not open the library. Please try again.";
            }
          }
        })
        .catch(function () {
          if (libraryMsg) {
            libraryMsg.hidden = false;
            libraryMsg.textContent =
              "Could not reach the server. Please try again.";
          }
        });
    });
  }
})();
