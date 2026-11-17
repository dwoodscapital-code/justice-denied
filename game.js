/* Justice Denied? / Alpha & Omega: one engine, two decks.
   Rules (from Pops): right +5, wrong -3, first to 30 wins, solo or up to 5 opponents. */
"use strict";

const WIN = 30, RIGHT = 5, WRONG = -3;
const LEVELS = [[1, "Easy"], [2, "Medium"], [3, "Advanced"]];
const COLORS = ["#F2C14E", "#E8505B", "#3BB273", "#B07BE6", "#FF8C42", "#FFFFFF"];
const BOT_NAMES = ["Harriet", "Fred", "Ida", "Booker", "Mary"];
const GAMES = {
  jd: { title: "Justice Denied?", board: "img/jd_board.jpg", spaces: 28, ringR: 0.368, ready: true },
  ao: { title: "Alpha & Omega", ready: false },
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

let G = null;          // current game state
let gameId = "jd";
let mode = "solo";
let timer = null;

function show(id) {
  $$(".screen").forEach((s) => s.classList.toggle("on", s.id === id));
  window.scrollTo(0, 0);
}

/* ---------- setup ---------- */
function levelOptions(sel) {
  return LEVELS.map(([v, t]) => `<option value="${v}"${v === sel ? " selected" : ""}>${t}</option>`).join("");
}

function passRow(p, i) {
  return `<div class="prow"><span class="dot" style="background:${COLORS[i]}"></span>
    <input value="${esc(p.name)}" maxlength="14" placeholder="Player ${i + 1}" aria-label="Player ${i + 1} name">
    <select aria-label="Player ${i + 1} level">${levelOptions(p.lvl)}</select>
    ${i > 1 ? `<button class="x" aria-label="Remove player" data-rm="${i}">&times;</button>` : `<span class="x"></span>`}</div>`;
}

function readPass() {
  return $$("#pass-list .prow").map((r, i) => ({
    name: r.querySelector("input").value.trim() || `Player ${i + 1}`,
    lvl: +r.querySelector("select").value,
  }));
}

function drawPass(list) {
  $("#pass-list").innerHTML = list.map(passRow).join("");
  $("#b-add").hidden = list.length >= 6;
}

function openSetup(id) {
  gameId = id;
  $("#setup-title").textContent = GAMES[id].title;
  const saved = store.get("setup", {});
  $("#solo-name").value = saved.soloName || "";
  $("#solo-lvl").innerHTML = levelOptions(saved.soloLvl || 2);
  if (saved.bots) $("#bot-count").value = saved.bots;
  if (saved.skill) $("#bot-skill").value = saved.skill;
  drawPass(saved.pass && saved.pass.length >= 2 ? saved.pass : [{ name: "", lvl: 3 }, { name: "", lvl: 1 }]);
  setMode(saved.mode || "solo");
  show("s-setup");
}

function setMode(m) {
  mode = m;
  $$("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  $("#solo-box").hidden = m !== "solo";
  $("#pass-box").hidden = m !== "pass";
}

/* ---------- game ---------- */
async function loadDeck(id) {
  const d = (window.DECKS || {})[id];
  if (!d) throw new Error("deck missing: " + id);
  return d.cards;
}

async function startGame() {
  const players = [];
  const setup = { mode, soloName: $("#solo-name").value.trim(), soloLvl: +$("#solo-lvl").value,
                  bots: $("#bot-count").value, skill: $("#bot-skill").value, pass: readPass() };
  store.set("setup", setup);
  if (mode === "solo") {
    players.push({ name: setup.soloName || "You", lvl: setup.soloLvl, bot: false });
    for (let i = 0; i < +setup.bots; i++) players.push({ name: BOT_NAMES[i], lvl: 3, bot: true, skill: +setup.skill });
  } else {
    setup.pass.forEach((p) => players.push({ ...p, bot: false }));
  }
  players.forEach((p, i) => { p.score = 0; p.color = COLORS[i]; p.id = i; });
  const cards = await loadDeck(gameId);
  G = { id: gameId, cfg: GAMES[gameId], cards, used: new Set(), players, turn: 0, card: null, answered: false };
  $("#play-title").textContent = G.cfg.title;
  $("#board-img").src = G.cfg.board;
  $("#tokens").innerHTML = "";
  show("s-play");
  render();
  nextTurn(true);
}

function draw(p) {
  // Easy gets easy cards; Medium gets easy+medium; Advanced gets all. Computers skip Talk It Over cards.
  const ok = (c) => c.lvl <= p.lvl && !(p.bot && c.type === "talk");
  let pool = G.cards.filter((c) => ok(c) && !G.used.has(c.n));
  if (!pool.length) {                                 // ran through them all: reshuffle that level
    G.cards.filter(ok).forEach((c) => G.used.delete(c.n));
    pool = G.cards.filter(ok);
  }
  const c = pool[Math.floor(Math.random() * pool.length)];
  G.used.add(c.n);
  return c;
}

function choices(c) {
  if (c.type === "yn") return ["Yes", "No"];
  if (c.type === "tf") return ["True", "False"];
  return c.opts || [];
}
function isRight(c, i) { return c.type === "mc" ? i === c.a : choices(c)[i] === c.a; }
function rightIndex(c) { return c.type === "mc" ? c.a : choices(c).indexOf(c.a); }

function nextTurn(first) {
  clearTimeout(timer);
  if (!first) G.turn = (G.turn + 1) % G.players.length;
  const p = G.players[G.turn];
  G.card = draw(p);
  G.answered = false;
  renderScores();
  // pass-the-phone: hand the phone over before showing the card
  if (mode === "pass" && !first) return handoff(p);
  showCard();
}

function handoff(p) {
  $("#turn").innerHTML = `<div class="handoff"><div>Pass the phone to</div>
    <div class="who" style="color:${p.color}">${esc(p.name)}</div>
    <button class="big" id="b-ready">I'm ready</button></div>`;
  $("#b-ready").onclick = showCard;
}

function showCard() {
  const p = G.players[G.turn], c = G.card;
  const lvl = LEVELS[c.lvl - 1][1];
  const talk = c.type === "talk";
  const ch = choices(c);
  const letters = "ABCDEF";
  const opts = talk
    ? (ch.length ? `<ul class="talklist">${ch.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : "")
    : (c.type === "mc"
      ? ch.map((o, i) => `<button class="opt" data-i="${i}"><b>${letters[i]})</b><span>${esc(o)}</span></button>`).join("")
      : `<div class="two">${ch.map((o, i) => `<button class="opt" data-i="${i}">${o}</button>`).join("")}</div>`);
  $("#turn").innerHTML = `<div class="card${talk ? " talk" : ""}">
    <div class="meta"><span class="who" style="color:${p.bot ? "var(--muted)" : "var(--ink)"}">${p.name === "You" ? "Your" : esc(p.name) + "'s"} turn</span>
    <span>${talk ? "Talk it over &middot; no points" : lvl}</span></div>
    <div class="q">${esc(c.q)}</div>${opts}<div id="after"></div></div>`;
  if (!p.bot) $("#turn").scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (talk) {
    $("#after").innerHTML = `<button class="big" id="b-next">Done talking</button>`;
    $("#b-next").onclick = () => nextTurn();
    return;
  }
  if (p.bot) return botPlay(p);
  $$(".opt").forEach((b) => (b.onclick = () => answer(+b.dataset.i)));
}

function botPlay(p) {
  $$(".opt").forEach((b) => (b.disabled = true));
  $("#after").innerHTML = `<div class="think">${esc(p.name)} is thinking&hellip;</div>`;
  const ch = choices(G.card), r = rightIndex(G.card);
  let pick = r;
  if (Math.random() > p.skill) {
    const wrong = ch.map((_, i) => i).filter((i) => i !== r);
    pick = wrong[Math.floor(Math.random() * wrong.length)];
  }
  timer = setTimeout(() => answer(pick), 1400);
}

function answer(i) {
  if (G.answered) return;
  G.answered = true;
  const p = G.players[G.turn], c = G.card, ok = isRight(c, i);
  p.score = Math.max(0, p.score + (ok ? RIGHT : WRONG));
  $$(".opt").forEach((b) => {
    b.disabled = true;
    const k = +b.dataset.i;
    if (k === rightIndex(c)) b.classList.add("right");
    else if (k === i) b.classList.add("wrong");
  });
  render();
  const msg = ok ? `Right! +${RIGHT}` : `Not quite. ${WRONG}`;
  if (p.score >= WIN) {
    $("#after").innerHTML = `<div class="result good">${msg}</div>`;
    timer = setTimeout(() => win(p), 1500);
    return;
  }
  const humanNext = !G.players[(G.turn + 1) % G.players.length].bot;
  $("#after").innerHTML = `<div class="result ${ok ? "good" : "bad"}">${msg}</div>` +
    (p.bot && !humanNext ? "" : `<button class="big" id="b-next">${p.bot ? "Next" : "Next turn"}</button>`);
  if ($("#b-next")) $("#b-next").onclick = () => nextTurn();
  else timer = setTimeout(() => nextTurn(), 1800);   // computer to computer: keep it moving
}

function win(p) {
  clearTimeout(timer);
  $("#win-name").textContent = p.bot ? `${p.name} wins!` : `${p.name} made it HOME!`;
  $("#win-sub").textContent = `First to ${WIN} points.`;
  const order = [...G.players].sort((a, b) => b.score - a.score);
  $("#final").innerHTML = order.map((q) => `<li><span><span class="dot" style="display:inline-block;vertical-align:-2px;margin-right:6px;background:${q.color}"></span>${esc(q.name)}</span><span>${q.score}</span></li>`).join("");
  show("s-win");
}

/* ---------- board ---------- */
function spaceOf(score) { return score >= WIN ? 0 : Math.floor((score * G.cfg.spaces) / WIN); }

function render() { renderScores(); renderTokens(); }

function renderScores() {
  $("#scores").innerHTML = G.players.map((p, i) =>
    `<li class="${i === G.turn ? "now" : ""}"><span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.name)}</span><span class="pt">${p.score}</span></li>`).join("");
}

function renderTokens() {
  const box = $("#tokens");
  if (!box.children.length) box.innerHTML = G.players.map((p) =>
    `<div class="tok" style="background:${p.color}" title="${esc(p.name)}">${esc(p.name[0].toUpperCase())}</div>`).join("");
  const stack = {};
  G.players.forEach((p, i) => {
    const s = spaceOf(p.score), k = (stack[s] = (stack[s] || 0) + 1) - 1;
    const ang = ((s * 360) / G.cfg.spaces - 90) * (Math.PI / 180);
    const r = G.cfg.ringR + (k % 3 - 1) * 0.045;           // spread tokens on the same space
    const off = Math.floor(k / 3) * 0.035;
    const el = box.children[i];
    el.style.left = 50 + 100 * (r * Math.cos(ang) - off * Math.sin(ang)) + "%";
    el.style.top = 50 + 100 * (r * Math.sin(ang) + off * Math.cos(ang)) + "%";
  });
}

/* ---------- wiring ---------- */
$$(".game-tile").forEach((b) => (b.onclick = () => {
  if (!GAMES[b.dataset.game].ready) { alert("Alpha & Omega is coming soon. Its cards are being finished now."); return; }
  openSetup(b.dataset.game);
}));
$$("[data-go]").forEach((b) => (b.onclick = () => { clearTimeout(timer); show(b.dataset.go); }));
$$("#mode button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("#b-add").onclick = () => { const l = readPass(); if (l.length < 6) { l.push({ name: "", lvl: 2 }); drawPass(l.map((p, i) => ({ ...p, name: p.name.startsWith("Player ") ? "" : p.name }))); } };
$("#pass-list").onclick = (e) => {
  const i = e.target.dataset && e.target.dataset.rm;
  if (i === undefined) return;
  const l = readPass(); l.splice(+i, 1);
  drawPass(l.map((p) => ({ ...p, name: p.name.startsWith("Player ") ? "" : p.name })));
};
$("#b-start").onclick = () => startGame().catch((e) => alert("Could not load the cards. " + e.message));
$("#b-quit").onclick = () => { if (confirm("Quit this game?")) { clearTimeout(timer); $("#tokens").innerHTML = ""; show("s-home"); } };
$("#b-again").onclick = () => { $("#tokens").innerHTML = ""; startGame(); };
const rules = $("#rules");
$("#b-rules").onclick = $("#b-rules2").onclick = () => rules.showModal();
$("#b-rules-ok").onclick = () => rules.close();
