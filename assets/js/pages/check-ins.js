// Weekly check-ins: confidence score pill selection.
const confidencePills = document.querySelectorAll("#confidence-pills-kr1 button");

confidencePills.forEach((btn) => {
  btn.addEventListener("click", function () {
    confidencePills.forEach((b) => {
      b.className =
        "h-8 rounded font-label-sm text-label-sm bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors";
    });
    this.className =
      "h-8 rounded font-label-sm text-label-sm bg-primary-container text-on-primary font-semibold shadow-sm";
  });
});
