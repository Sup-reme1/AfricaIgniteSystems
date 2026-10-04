// Dashboard: expand/collapse the key results under each objective.
document.querySelectorAll("[data-toggle-krs]").forEach((trigger) => {
  trigger.addEventListener("click", () => toggleObjective(trigger.dataset.toggleKrs));
});

function toggleObjective(krsId) {
  const container = document.getElementById(krsId);
  const icon = document.getElementById(krsId.replace("-krs", "-icon"));
  if (!container) return;

  const isHidden = container.classList.toggle("hidden");
  if (icon) icon.style.transform = isHidden ? "rotate(-90deg)" : "rotate(0deg)";
}
