(function () {
  var desktop =
    window.matchMedia && window.matchMedia("(min-width: 861px)");
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var button = document.createElement("button");
  button.type = "button";
  button.className = "to-top";
  button.textContent = "Top";
  button.setAttribute("aria-label", "Back to top of page");
  button.hidden = true;
  document.body.appendChild(button);

  function sync() {
    var scrolled = window.pageYOffset > 480;
    button.hidden = !(desktop && desktop.matches && scrolled);
  }

  button.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });

  window.addEventListener("scroll", sync, { passive: true });
  if (desktop && desktop.addEventListener) desktop.addEventListener("change", sync);
  sync();
})();
