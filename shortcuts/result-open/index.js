export default {
  name: "Open highlighted result",
  description: "Open the currently focused result link.",
  defaultBinding: { key: "Enter" },
  run({ document }) {
    const active = document.activeElement;
    if (active instanceof HTMLAnchorElement && active.classList.contains("result-title")) {
      active.click();
    }
  },
};
