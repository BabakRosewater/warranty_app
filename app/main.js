import { loadLibraryData } from "./data-loader.js";
import { renderApp, setMode, syncWorkspaceTabs } from "./router.js";

async function init() {
  await loadLibraryData();

  document.querySelectorAll("[data-workspace-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setMode(btn.dataset.workspaceMode);
    });
  });

  syncWorkspaceTabs();
  renderApp();
}

init().catch((err) => {
  console.error(err);
  const center = document.getElementById("centerPanel");
  if (center) {
    center.innerHTML = `
      <div class="p-6">
        <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to initialize app: ${err.message}
        </div>
      </div>
    `;
  }
});
