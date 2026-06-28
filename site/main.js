/* interference — landing interactions
   1) typed terminal session  2) scroll reveals  3) copy install command
   Vanilla JS, no deps. Respects prefers-reduced-motion. */

(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── 1. Typed terminal ───────────────────────────────── */
  const typed = document.getElementById("typed");
  const caret = document.getElementById("caret");

  // Each line: [cssClass, text]. Rendered with a typing cadence.
  const script = [
    ["u", "› refactor the auth module to use async/await"],
    ["m", ""],
    ["c", "· grep(\"\\.then(\")            → 7 matches in 3 files"],
    ["c", "· read(src/auth/login.ts)    → 142 lines"],
    ["m", ""],
    ["m", "  Plan: convert 7 promise chains, keep error handling."],
    ["m", "  Switch to Build mode to apply? [y]"],
    ["u", "› y"],
    ["m", ""],
    ["c", "· edit(src/auth/login.ts)    ✎ apply diff?  ›  y"],
    ["ok", "  ✓ src/auth/login.ts       2 hunks applied"],
    ["c", "· edit(src/auth/session.ts)  ✎ apply diff?  ›  y"],
    ["ok", "  ✓ src/auth/session.ts     1 hunk applied"],
    ["c", "· bash(bun test auth)        → 12 passed"],
    ["m", ""],
    ["ok", "  done · 3 files · undo with /undo"],
  ];

  function renderInstant() {
    typed.innerHTML = script
      .map(([cls, t]) => `<span class="${cls}">${escapeHtml(t)}</span>`)
      .join("\n");
    if (caret) caret.style.display = "none";
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function typeOut() {
    let line = 0;
    function nextLine() {
      if (line >= script.length) { if (caret) caret.style.display = "none"; return; }
      const [cls, text] = script[line];
      const span = document.createElement("span");
      span.className = cls;
      typed.appendChild(span);
      let i = 0;
      // instant for blank/meta lines, char-by-char for active ones
      const fast = cls === "m" || text.length === 0;
      function tick() {
        span.textContent = text.slice(0, i);
        i++;
        if (i <= text.length) {
          setTimeout(tick, fast ? 0 : 12 + Math.random() * 22);
        } else {
          typed.appendChild(document.createTextNode("\n"));
          line++;
          setTimeout(nextLine, text.length === 0 ? 90 : 260);
        }
      }
      tick();
    }
    nextLine();
  }

  if (typed) {
    if (reduce) {
      renderInstant();
    } else {
      // start typing when the terminal scrolls into view (once)
      const term = typed.closest(".term");
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { typeOut(); obs.disconnect(); }
        });
      }, { threshold: 0.35 });
      term ? io.observe(term) : typeOut();
    }
  }

  /* ── 2. Scroll reveals ───────────────────────────────── */
  const ups = document.querySelectorAll(".reveal-up");
  if (reduce) {
    ups.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    ups.forEach((el) => io.observe(el));
  }

  /* ── 3. Copy install command ─────────────────────────── */
  const btn = document.getElementById("copybtn");
  const cmd = document.getElementById("installcmd");
  if (btn && cmd) {
    btn.addEventListener("click", async () => {
      const text = cmd.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const r = document.createRange(); r.selectNode(cmd);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand("copy"); } catch {}
        sel.removeAllRanges();
      }
      const prev = btn.textContent;
      btn.textContent = "copied"; btn.classList.add("done");
      setTimeout(() => { btn.textContent = prev; btn.classList.remove("done"); }, 1600);
    });
  }
})();
