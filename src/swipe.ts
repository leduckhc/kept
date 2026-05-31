import { type Thread } from "./gmail";
import { type ActionDeps, doArchive } from "./actions";
import { doSnooze } from "./snooze";
import { state } from "./state";

const SWIPE_THRESHOLD = 80;

export function initSwipeGestures(deps: { getActionDeps: () => ActionDeps }) {
  const container = document.getElementById("inbox");
  if (!container) return;

  let startX = 0;
  let startY = 0;
  let currentRow: HTMLElement | null = null;
  let swiping = false;

  container.addEventListener("touchstart", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".thread-row");
    if (!row) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentRow = row;
    swiping = false;
  }, { passive: true });

  container.addEventListener("touchmove", (e) => {
    if (!currentRow) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!swiping && Math.abs(dy) > Math.abs(dx)) { currentRow = null; return; }
    if (Math.abs(dx) > 10) swiping = true;
    if (!swiping) return;

    e.preventDefault();
    currentRow.classList.add("swiping");
    currentRow.style.transform = `translateX(${dx}px)`;
    currentRow.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 300));

    ensureSwipeBgs(currentRow);

    const bgArchive = currentRow.querySelector<HTMLElement>(".swipe-bg-archive");
    const bgSnooze = currentRow.querySelector<HTMLElement>(".swipe-bg-snooze");
    const pastThreshold = Math.abs(dx) >= SWIPE_THRESHOLD;

    if (dx > 0) {
      if (bgArchive) { bgArchive.style.opacity = "1"; bgArchive.querySelector<HTMLElement>(".swipe-bg-icon")?.classList.toggle("visible", pastThreshold); }
      if (bgSnooze) bgSnooze.style.opacity = "0";
    } else {
      if (bgSnooze) { bgSnooze.style.opacity = "1"; bgSnooze.querySelector<HTMLElement>(".swipe-bg-icon")?.classList.toggle("visible", pastThreshold); }
      if (bgArchive) bgArchive.style.opacity = "0";
    }
  }, { passive: false });

  container.addEventListener("touchend", () => {
    if (!currentRow) return;
    const match = currentRow.style.transform.match(/-?\d+/);
    const dx = match ? parseInt(match[0]) : 0;
    const row = currentRow;
    currentRow = null;
    swiping = false;

    row.querySelector<HTMLElement>(".swipe-bg-archive")?.style.setProperty("opacity", "0");
    row.querySelector<HTMLElement>(".swipe-bg-snooze")?.style.setProperty("opacity", "0");

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      row.classList.remove("swiping");
      row.style.transition = "transform 0.2s ease, opacity 0.2s ease";
      row.style.transform = `translateX(${dx > 0 ? "100%" : "-100%"})`;
      row.style.opacity = "0";

      row.addEventListener("transitionend", () => {
        const threadId = row.dataset.id;
        const thread = state.threads.find((t: Thread) => t.id === threadId);
        if (!thread) return;

        if (dx > 0) {
          doArchive(thread, row, deps.getActionDeps());
        } else {
          doSnooze(thread, row, Date.now() + 3 * 60 * 60 * 1000, deps.getActionDeps().renderInbox);
        }
      }, { once: true });
    } else {
      row.classList.remove("swiping");
      row.style.transition = "transform 0.15s ease, opacity 0.15s ease";
      row.style.transform = "";
      row.style.opacity = "";
      setTimeout(() => { row.style.transition = ""; }, 150);
    }
  });
}

function ensureSwipeBgs(row: HTMLElement): void {
  if (row.querySelector(".swipe-bg")) return;
  const archive = document.createElement("div");
  archive.className = "swipe-bg swipe-bg-archive";
  archive.innerHTML = `<span class="swipe-bg-icon">📥</span>`;
  const snooze = document.createElement("div");
  snooze.className = "swipe-bg swipe-bg-snooze";
  snooze.innerHTML = `<span class="swipe-bg-icon">⏰</span>`;
  row.prepend(snooze);
  row.prepend(archive);
}
