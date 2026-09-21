(function () {
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var el = document.getElementById(a.getAttribute("href").slice(1));
    if (!el) return;
    e.preventDefault();
    var reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    var io = new IntersectionObserver(
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
      io.observe(s);
    });
  }
  setOn("scope");
})();
