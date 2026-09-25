(function () {
  var button = document.getElementById("sign-out");
  if (!button) return;
  button.addEventListener("click", function () {
    fetch("/api/library/logout", { method: "POST", credentials: "same-origin" }).finally(
      function () {
        location.href = "/";
      }
    );
  });
})();
