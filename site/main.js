/* interference — landing interactions
   1) i18n bilingual (EN/IT)  2) typed terminal session  3) scroll reveals  4) copy install command
   Vanilla JS, no deps. Respects prefers-reduced-motion. */

const I18N = {
  en: {
    "meta.title": "interference — the open-source terminal coding agent",
    "meta.desc": "interference is an Italian open-source AI coding agent that lives in your terminal. Plan and Build modes, file & shell tools, permissions, sessions with undo — built on TypeScript + Bun.",
    "og.title": "interference — the open-source terminal coding agent",
    "og.desc": "An Italian open-source AI coding agent that lives in your terminal. TypeScript + Bun.",

    "nav.how": "How it works",
    "nav.features": "Features",
    "nav.start": "Quickstart",
    "nav.github": "GitHub ↗",

    "hero.title": "The Italian<br />Open Source<br /><span class=\"ital\">Coding Agent.</span>",
    "hero.lede": "interference reads your code, edits files and runs commands through an agentic loop — with explicit permissions and a read-only Plan mode. No editor lock-in. Just the terminal.",
    "hero.cta_start": "Get started",
    "hero.cta_source": "GitHub ↗",

    "term.title": "interference — ~/project",

    "how.eyebrow": "/ 01 — the loop",
    "how.title": "An agent loop you can watch and trust.",
    "how.step1_title": "You ask",
    "how.step1_desc": "Describe a task in plain language. interference plans before it touches anything.",
    "how.step2_title": "It calls tools",
    "how.step2_desc": "<code>read · ls · glob · grep · webfetch</code> to explore, <code>write · edit · bash · task · todowrite · question</code> to act — multi-step, streamed live.",
    "how.step3_title": "You stay in control",
    "how.step3_desc": "Every mutating action is gated by <em>allow / ask / deny</em>. Approve with a diff in front of you.",
    "how.step4_title": "Undo anything",
    "how.step4_desc": "Sessions are persisted and snapshotted. Roll back a change the agent made, instantly.",

    "skills.eyebrow": "/ 02 — skills",
    "skills.title": "Teach it once. It remembers every time.",
    "skills.without_eyebrow": "without skills",
    "skills.without_title": "Generic agent",
    "skills.without_desc": "Every session starts from zero. You re-explain your commit style, your test setup, your release process — every time, in every conversation.",
    "skills.without_tick1": "Re-explained every session",
    "skills.without_tick2": "Generic, one-size-fits-all output",
    "skills.without_tick3": "Inconsistent results",
    "skills.with_eyebrow": "with skills",
    "skills.with_title": "Scoped skills",
    "skills.with_desc": "Skills aren't one block of text bolted onto every prompt. interference injects each one exactly where it belongs — into the main conversation, or into a dedicated subagent with its own system prompt built around that one task.",
    "skills.with_tick1": "Auto-detected, or called directly: <code>/commit</code>",
    "skills.with_tick2": "Injected into the exact prompt that needs it",
    "skills.with_tick3": "Subagents get their own tailored prompt too",

    "modes.plan_eyebrow": "mode · read-only",
    "modes.plan_title": "Plan",
    "modes.plan_desc": "The agent explores and reasons — never writes. Perfect for understanding a codebase or scoping a change before committing to it.",
    "modes.plan_tick1": "Filesystem read &amp; search only",
    "modes.plan_tick2": "Cites <code>file:line</code> evidence",
    "modes.plan_tick3": "Zero side effects",
    "modes.build_eyebrow": "mode · full access",
    "modes.build_title": "Build",
    "modes.build_desc": "The agent writes files, applies atomic edits and runs commands — each behind your permission rules, with destructive actions denied by default.",
    "modes.build_tick1": "Atomic <code>edit</code> (unique-match)",
    "modes.build_tick2": "Sandboxed paths, timed <code>bash</code>",
    "modes.build_tick3": "Approve-with-preview",

    "features.eyebrow": "/ 03 — what's inside",
    "features.title": "Small surface. Serious capability.",
    "feat.1_title": "Native tool-calling",
    "feat.1_desc": "A typed tool registry over the Vercel AI SDK — multi-step, with tool errors fed back for self-correction.",
    "feat.2_title": "Permissions by design",
    "feat.2_desc": "allow / ask / deny rules enforced in code, not in the prompt. The model can't talk its way past them.",
    "feat.3_title": "A real TUI",
    "feat.3_desc": "Streaming output, spinners and live tool steps in a flicker-free terminal interface built with Ink.",
    "feat.4_title": "Sessions &amp; undo",
    "feat.4_desc": "Resume where you left off. Snapshots before every mutation mean undo/redo on the agent's edits.",
    "feat.5_title": "Cost transparency",
    "feat.5_desc": "See exactly what you&rsquo;re spending on API calls \u2014 live, per-request, in your terminal. No hidden usage, no surprise bills.",
    "feat.6_title": "Bun-fast",
    "feat.6_desc": "One toolchain: runtime, bundler and test runner. Ships as a single standalone executable.",
    "feat.7_title": "Extensible skill system",
    "feat.7_desc": "Agent Skills format with auto-detection by keyword matching. Invoke via /skill-name. 3 skills bundled, your own are just a SKILL.md away.",
    "feat.8_title": "Subagents",
    "feat.8_desc": "Delegate complex multi-step tasks to isolated agents — Explore (read-only), General (full access), Review (bug/security/simplicity findings), or your own custom agents. Launch several in the same turn to run them in parallel.",
    "feat.9_title": "Slash commands + autocomplete",
    "feat.9_desc": "/help · /clear · /undo · /redo · /init · /model · /plan · /build · /compact · /sessions · /rename · /provider · /thinking. Fuzzy autocomplete on /.",

    "why.eyebrow": "/ 04 — why interference",
    "why.title": "Not just another agent.",
    "why.1_title": "European, by choice",
    "why.1_desc": "Built in Italy. Open-source, MIT licensed, not VC-funded. Your code never leaves your machine unless you explicitly send it to an API. An independent, GDPR-native alternative to Silicon Valley agents.",
    "why.2_title": "Radically transparent",
    "why.2_desc": "Every tool call, every reasoning step, and exactly what you\u2019re spending on API costs \u2014 live, in your terminal. No hidden usage. No surprise bills.",
    "why.3_title": "Privacy by architecture",
    "why.3_desc": "There\u2019s no interference server. Chats and sessions stay local in ~/.interference/, never uploaded. We don\u2019t save your conversations, don\u2019t collect your data, and don\u2019t train on anything \u2014 what you send your LLM provider is between you and them.",

    "hero.requires": "Requires <a href=\"https://bun.sh\" target=\"_blank\" rel=\"noopener\">Bun</a> 1.3+ — the runtime interference runs on.",
    "start.eyebrow": "/ 05 — quickstart",
    "start.title": "In your terminal in a minute.",
    "start.step1": "<strong>1</strong> — Install <a href=\"https://bun.sh\" target=\"_blank\" rel=\"noopener\">Bun</a> 1.3+ (skip if you already have it):",
    "start.step2": "<strong>2</strong> — Install interference:",
    "start.note": "Then run <code>interference</code>. Add your API keys with <code>/provider</code> on first launch. State is stored in <code>~/.interference/</code>.",
    "start.cta": "GitHub ↗",

    "footer.builtin": "Built in Italy \uD83C\uDDEE\uD83C\uDDF9",

    "ui.copy": "copy",
    "ui.copied": "copied",
  },

  it: {
    "meta.title": "interference — l'agente di coding open-source da terminale",
    "meta.desc": "interference è un agente di coding AI open-source italiano che vive nel tuo terminale. Modalità Plan e Build, tool su file e shell, permessi, sessioni con undo — costruito in TypeScript + Bun.",
    "og.title": "interference — l'agente di coding open-source da terminale",
    "og.desc": "Un agente di coding AI open-source italiano che vive nel tuo terminale. TypeScript + Bun.",

    "nav.how": "Come funziona",
    "nav.features": "Caratteristiche",
    "nav.start": "Inizia",
    "nav.github": "GitHub ↗",

    "hero.title": "L'agente di coding<br />open source<br /><span class=\"ital\">italiano.</span>",
    "hero.lede": "interference legge il tuo codice, modifica file ed esegue comandi attraverso un agent loop — con permessi espliciti e una modalità Plan in sola lettura. Nessun vincolo all'editor. Solo il terminale.",
    "hero.cta_start": "Inizia",
    "hero.cta_source": "GitHub ↗",

    "term.title": "interference — ~/progetto",

    "how.eyebrow": "/ 01 — il loop",
    "how.title": "Un agent loop che puoi osservare. Di cui ti puoi fidare.",
    "how.step1_title": "Tu chiedi",
    "how.step1_desc": "Descrivi un task in linguaggio naturale. interference pianifica prima di toccare qualsiasi cosa.",
    "how.step2_title": "Lui usa i tool",
    "how.step2_desc": "<code>read · ls · glob · grep · webfetch</code> per esplorare, <code>write · edit · bash · task · todowrite · question</code> per agire — multi-step, in streaming live.",
    "how.step3_title": "Tu resti al comando",
    "how.step3_desc": "Ogni azione che modifica è filtrata da <em>allow / ask / deny</em>. Approvi con il diff davanti agli occhi.",
    "how.step4_title": "Annulla tutto",
    "how.step4_desc": "Le sessioni sono persistenti e con snapshot. Torna indietro su qualsiasi modifica dell'agente, all'istante.",

    "skills.eyebrow": "/ 02 — skill",
    "skills.title": "Insegnaglielo una volta. Se lo ricorda sempre.",
    "skills.without_eyebrow": "senza skill",
    "skills.without_title": "Agente generico",
    "skills.without_desc": "Ogni sessione riparte da zero. Rispieghi il tuo stile di commit, il tuo setup di test, il tuo processo di rilascio — ogni volta, in ogni conversazione.",
    "skills.without_tick1": "Rispiegato a ogni sessione",
    "skills.without_tick2": "Output generico, uguale per tutti",
    "skills.without_tick3": "Risultati incostanti",
    "skills.with_eyebrow": "con le skill",
    "skills.with_title": "Skill mirate",
    "skills.with_desc": "Le skill non sono un blocco di testo incollato a ogni prompt. interference inietta ognuna esattamente dove serve — nella conversazione principale, o in un subagent dedicato con un proprio system prompt costruito attorno a quel task.",
    "skills.with_tick1": "Rilevate in automatico, o richiamate direttamente: <code>/commit</code>",
    "skills.with_tick2": "Iniettate esattamente nel prompt che ne ha bisogno",
    "skills.with_tick3": "Anche i subagent hanno il loro prompt su misura",

    "modes.plan_eyebrow": "modalità · sola lettura",
    "modes.plan_title": "Plan",
    "modes.plan_desc": "L'agente esplora e ragiona — non scrive mai. Perfetto per capire una codebase o valutare una modifica prima di impegnarsi.",
    "modes.plan_tick1": "Solo lettura e ricerca su filesystem",
    "modes.plan_tick2": "Risposte con prove <code>file:riga</code>",
    "modes.plan_tick3": "Zero effetti collaterali",
    "modes.build_eyebrow": "modalità · accesso completo",
    "modes.build_title": "Build",
    "modes.build_desc": "L'agente scrive file, applica edit atomici ed esegue comandi — ognuno dietro le tue regole di permesso, con le azioni distruttive negate di default.",
    "modes.build_tick1": "Edit <code>edit</code> atomici (match univoco)",
    "modes.build_tick2": "Path confinati, <code>bash</code> con timeout",
    "modes.build_tick3": "Approva con anteprima",

    "features.eyebrow": "/ 03 — cosa c'è dentro",
    "features.title": "Superficie ridotta. Capacità serie.",
    "feat.1_title": "Tool-calling nativo",
    "feat.1_desc": "Un registro tipizzato di tool su Vercel AI SDK — multi-step, con gli errori reiniettati per l'auto-correzione.",
    "feat.2_title": "Permessi by design",
    "feat.2_desc": "Regole allow / ask / deny applicate nel codice, non nel prompt. Il modello non può raggirarle a parole.",
    "feat.3_title": "Una vera TUI",
    "feat.3_desc": "Output in streaming, spinner e passi tool in tempo reale in un'interfaccia da terminale senza flicker, costruita con Ink.",
    "feat.4_title": "Sessioni &amp; undo",
    "feat.4_desc": "Riprendi da dove avevi lasciato. Snapshot prima di ogni modifica: undo/redo sulle modifiche dell'agente.",
    "feat.5_title": "Costi trasparenti",
    "feat.5_desc": "Vedi esattamente quanto stai spendendo in chiamate API \u2014 in tempo reale, per ogni richiesta, nel tuo terminale. Nessun utilizzo nascosto, nessuna sorpresa in fattura.",
    "feat.6_title": "Veloce come Bun",
    "feat.6_desc": "Un'unica toolchain: runtime, bundler e test runner. Distribuito come singolo eseguibile standalone.",
    "feat.7_title": "Sistema di skill estensibile",
    "feat.7_desc": "Formato Agent Skills con rilevamento automatico per parola chiave. Richiamabili via /nome-skill. 3 skill incluse, le tue a un SKILL.md di distanza.",
    "feat.8_title": "Subagent",
    "feat.8_desc": "Delega task complessi e multi-step ad agenti isolati — Explore (sola lettura), General (accesso completo), Review (rilievi su bug/sicurezza/semplicità), o i tuoi agenti personalizzati. Lanciane più di uno nello stesso turno per farli girare in parallelo.",
    "feat.9_title": "Slash command + autocompletamento",
    "feat.9_desc": "/help · /clear · /undo · /redo · /init · /model · /plan · /build · /compact · /sessions · /rename · /provider · /thinking. Autocompletamento fuzzy su /.",

    "why.eyebrow": "/ 04 — perché interference",
    "why.title": "Non il solito agente.",
    "why.1_title": "Europeo, per scelta",
    "why.1_desc": "Fatto in Italia. Open-source, licenza MIT, non finanziato da venture capital. Il tuo codice non lascia mai la tua macchina a meno che tu non lo invii esplicitamente a un\u2019API. Un\u2019alternativa indipendente e GDPR-nativa agli agenti della Silicon Valley.",
    "why.2_title": "Radicalmente trasparente",
    "why.2_desc": "Ogni tool call, ogni passo di ragionamento, ed esattamente quanto stai spendendo in API — in tempo reale, nel tuo terminale. Nessun utilizzo nascosto. Nessuna sorpresa in fattura.",
    "why.3_title": "Privacy per architettura",
    "why.3_desc": "Non esiste un server interference. Chat e sessioni restano locali in ~/.interference/, mai caricate altrove. Non salviamo le tue conversazioni, non raccogliamo i tuoi dati, non facciamo training su nulla — quello che invii al tuo provider LLM riguarda solo te e lui.",

    "hero.requires": "Richiede <a href=\"https://bun.sh\" target=\"_blank\" rel=\"noopener\">Bun</a> 1.3+ — il runtime su cui gira interference.",
    "start.eyebrow": "/ 05 — inizia",
    "start.title": "Nel tuo terminale in un minuto.",
    "start.step1": "<strong>1</strong> — Installa <a href=\"https://bun.sh\" target=\"_blank\" rel=\"noopener\">Bun</a> 1.3+ (salta se ce l'hai già):",
    "start.step2": "<strong>2</strong> — Installa interference:",
    "start.note": "Poi esegui <code>interference</code>. Aggiungi le tue API key con <code>/provider</code> al primo avvio. Lo stato è in <code>~/.interference/</code>.",
    "start.cta": "GitHub ↗",

    "footer.builtin": "Fatto in Italia \uD83C\uDDEE\uD83C\uDDF9",

    "ui.copy": "copia",
    "ui.copied": "copiato",
  },
};

// ── i18n engine ──
function setLang(lang) {
  const t = I18N[lang];
  if (!t) return;

  document.documentElement.lang = lang;
  localStorage.setItem("interference-lang", lang);

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (t[key] != null) el.textContent = t[key];
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml;
    if (t[key] != null) el.innerHTML = t[key];
  });

  document.querySelectorAll("[data-i18n-content]").forEach((el) => {
    const key = el.dataset.i18nContent;
    if (t[key] != null) el.setAttribute("content", t[key]);
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    const active = btn.dataset.lang === lang;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function detectLang() {
  var stored = localStorage.getItem("interference-lang");
  if (stored === "en" || stored === "it") return stored;
  if (navigator.language && navigator.language.startsWith("it")) return "it";
  return "en";
}

function lang() {
  return document.documentElement.lang || "en";
}

document.addEventListener("DOMContentLoaded", function () {
  var initial = detectLang();
  setLang(initial);

  document.querySelectorAll(".lang-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setLang(btn.dataset.lang);
    });
  });
});

// ── 1. Typed terminal ─────────────────────────────────
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var typed = document.getElementById("typed");
  var caret = document.getElementById("caret");

  var script = [
    ["m", "  interference  the open-source coding agent"],
    ["m", "  ⬡ Plan · DeepSeek · deepseek-v4-pro"],
    ["m", ""],
    ["u", "› refactor the auth module to use async/await"],
    ["m", ""],
    ["c", "· grep(\".then(\")            → 7 matches in 3 files"],
    ["c", "· read(src/auth/login.ts)    → 142 lines"],
    ["m", ""],
    ["m", "  Plan: convert 7 promise chains, keep error handling."],
    ["m", "  Switch to Build mode to apply? [y]"],
    ["u", "› y"],
    ["m", ""],
    ["c", "· edit(src/auth/login.ts)    ✎ apply diff?  ›  y"],
    ["ok", "  + 12  - 8  src/auth/login.ts   2 hunks applied"],
    ["c", "· edit(src/auth/session.ts)  ✎ apply diff?  ›  y"],
    ["ok", "  + 4  - 3  src/auth/session.ts   1 hunk applied"],
    ["c", "· bash(bun test)             → 12 passed"],
    ["m", ""],
    ["ok", "  done · 3 files · undo with /undo"],
    ["m", ""],
    ["u", "› fetch https://example.com and summarize"],
    ["m", ""],
    ["c", "· webfetch(https://example.com)  → 2.1K text extracted"],
    ["m", "  The page describes a web service with REST API,"],
    ["m", "  OAuth2 authentication, and WebSocket streaming."],
    ["m", "  Rate limit: 100 req/min. Docs at /api/v2."],
    ["m", ""],
    ["c", "· task(explore, \"find usage of old pattern\")"],
    ["ok", "  <task state=\"completed\">12 files, 3 refs</task>"],
    ["m", ""],
    ["ok", "  done · webfetch · task · undo with /undo"],
  ];

  function renderInstant() {
    typed.innerHTML = script
      .map(function (p) { return "<span class=\"" + p[0] + "\">" + escapeHtml(p[1]) + "</span>"; })
      .join("\n");
    if (caret) caret.style.display = "none";
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; });
  }

  function typeOut() {
    var line = 0;
    function nextLine() {
      if (line >= script.length) { if (caret) caret.style.display = "none"; return; }
      var cls = script[line][0], text = script[line][1];
      var span = document.createElement("span");
      span.className = cls;
      typed.appendChild(span);
      var i = 0;
      var fast = cls === "m" || text.length === 0;
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
      var term = typed.closest(".term");
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { typeOut(); obs.disconnect(); }
        });
      }, { threshold: 0.35 });
      term ? io.observe(term) : typeOut();
    }
  }
})();

// ── 2. Scroll reveals ─────────────────────────────────
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ups = document.querySelectorAll(".reveal-up");
  if (reduce) {
    ups.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    ups.forEach(function (el) { io.observe(el); });
  }
})();

// ── 3. Copy install command ───────────────────────────
// Multiple .install-row blocks can exist (hero + quickstart) — each button
// copies the <code> in its own row, not a page-wide singleton id.
(function () {
  document.querySelectorAll(".install-row").forEach(function (row) {
    var btn = row.querySelector(".copy");
    var cmd = row.querySelector("code");
    if (!btn || !cmd) return;

    btn.addEventListener("click", function () {
      var text = cmd.textContent.trim();
      try {
        navigator.clipboard.writeText(text);
      } catch (_) {
        var r = document.createRange(); r.selectNode(cmd);
        var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand("copy"); } catch (_) {}
        sel.removeAllRanges();
      }
      var prev = btn.textContent;
      var copiedText = I18N[lang()]["ui.copied"];
      btn.textContent = copiedText; btn.classList.add("done");
      setTimeout(function () { btn.textContent = prev; btn.classList.remove("done"); }, 1600);
    });
  });

  // GitHub star count
  fetch("https://api.github.com/repos/ricciviero/interference")
    .then(r => r.json())
    .then(d => {
      var s = document.getElementById("ghstars");
      if (s && d.stargazers_count) s.textContent = d.stargazers_count;
    })
    .catch(function(){});
})();
