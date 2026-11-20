import { createArticleView } from "./article-view.js";
import { createStreet } from "./street.js";
import { Chase } from "./chase.js";
import { createSound } from "./sound.js";
import { connectTypingInput } from "./typing-input.js";
import "./style.css";

const get = (id) => document.getElementById(id);
const app = get("app");
const view = get("view");
const typing = get("typing");
const input = get("typing-input");
const hint = get("hint");
const overlay = get("overlay");
const result = get("result");
const replay = get("replay");
const resultDistance = get("result-distance");
const typingStatus = get("typing-status");
const gapMetric = get("gap-metric");
const accuracyUnit = get("accuracy-unit");
const metrics = Object.fromEntries(["distance", "gap", "speed", "police-speed", "rate", "accuracy"].map((id) => [id, get(id)]));
const controls = Object.fromEntries(["en", "zh", "reset", "pause", "shuffle", "mute"].map((id) => [id, get(id)]));
const autoRun = import.meta.env.DEV ? get("auto-run") : null;

function text(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const canType = () => !input.disabled && !input.readOnly;
const prompts = {
  ready: "打对第一个字符起跑，空格和标点也要输入。",
  running: "",
  paused: "继续后可接着输入。",
  finished: "",
};
const errorMessage = "输错了，请重试高亮的字符。";

async function main() {
  const street = await createStreet(view);
  const showArticle = createArticleView(get("article-window"), get("article-track"), get("active-character"));
  const sound = createSound();
  const clearInput = connectTypingInput(input, submit, sound.unlock);
  const url = new URL(window.location.href);
  const seedQuery = url.searchParams.get("seed") ?? "";
  let seed = /^[0-9a-f]{1,8}$/i.test(seedQuery) ? Number.parseInt(seedQuery, 16) : randomSeed();
  let language = url.searchParams.get("lang") === "zh" ? "zh" : "en";
  let chase;
  let simulatedAt = performance.now();
  let drawnAt = simulatedAt;
  let dirty = true;
  let errorTimer;
  let muted = false;

  function focusInput() {
    if (canType()) input.focus({ preventScroll: true });
  }

  function clearError() {
    clearTimeout(errorTimer);
    typing.dataset.error = "false";
    text(typingStatus, "");
    text(hint, prompts[chase.phase]);
  }

  function showPhase() {
    const { phase, autoRunning } = chase;
    const paused = phase === "paused";
    const finished = phase === "finished";
    const readOnly = paused || finished || autoRunning;
    if (autoRun && autoRun.getAttribute("aria-pressed") !== String(autoRunning)) {
      autoRun.setAttribute("aria-pressed", String(autoRunning));
    }
    if (input.readOnly !== readOnly) {
      input.readOnly = readOnly;
      input.tabIndex = readOnly ? -1 : 0;
      clearInput();
    }
    if (app.dataset.state === phase) return;
    app.dataset.state = phase;
    controls.pause.disabled = phase !== "running" && !paused;
    text(controls.pause, paused ? "继续" : "暂停");
    overlay.hidden = result.hidden = !paused && !finished;
    replay.hidden = resultDistance.hidden = !finished;
    clearError();
    if (paused) text(get("result-status"), "已暂停");
    if (finished) {
      text(resultDistance, `本局跑了 ${chase.distance.toFixed(1)} 米`);
      text(get("result-status"), "被抓了");
      if (!document.hidden) replay.focus({ preventScroll: true });
    }
  }

  function show() {
    showPhase();
    const { gap } = chase;
    text(metrics.distance, chase.distance.toFixed(1));
    text(metrics.gap, gap > 0 && gap < .1 ? "<0.1" : gap.toFixed(1));
    text(metrics.speed, chase.speed.toFixed(1));
    text(metrics["police-speed"], chase.policeSpeed.toFixed(1));
    text(metrics.rate, String(chase.rate ?? "—"));
    text(metrics.accuracy, String(chase.accuracy ?? "—"));
    accuracyUnit.hidden = chase.accuracy === null;
    gapMetric.dataset.close = String(gap <= 5);
    showArticle(chase.articleIndex, chase.index, language);
  }

  function restart() {
    chase = new Chase(language);
    street.reset(seed);
    simulatedAt = performance.now();
    dirty = true;
    clearInput();
    clearError();
    const code = seed.toString(16).padStart(8, "0");
    text(get("seed"), code);
    url.searchParams.set("seed", code);
    if (language === "zh") url.searchParams.set("lang", "zh");
    else url.searchParams.delete("lang");
    if (url.href !== location.href) history.replaceState(null, "", url);
    input.lang = language === "zh" ? "zh-CN" : "en";
    text(get("rate-unit"), language === "zh" ? "字/分" : "词/分");
    for (const code of ["en", "zh"]) controls[code].setAttribute("aria-pressed", String(code === language));
    show();
    if (!document.hidden) focusInput();
  }

  function advance(now) {
    const delta = (now - simulatedAt) / 1000;
    simulatedAt = now;
    if (chase.phase !== "running" || delta <= 0) return;
    chase.step(delta);
    dirty = true;
    if (chase.phase === "finished") sound.play("caught");
  }

  function pause() {
    advance(performance.now());
    if (chase.phase === "running") chase.phase = "paused";
    else if (chase.phase === "paused") chase.phase = "running";
    dirty = true;
    show();
    if (document.hidden) return;
    if (chase.phase === "paused") controls.pause.focus({ preventScroll: true });
    else focusInput();
  }

  function submit(value) {
    advance(performance.now());
    const { correct, wrong } = chase.submit(value);
    show();
    if (!correct && !wrong) return;
    sound.unlock();
    sound.play(wrong ? "wrong" : "correct");
    clearError();
    if (wrong) {
      typing.dataset.error = "true";
      text(hint, errorMessage);
      text(typingStatus, errorMessage);
      errorTimer = setTimeout(clearError, 700);
    }
  }

  controls.reset.addEventListener("click", restart);
  replay.addEventListener("click", restart);
  controls.pause.addEventListener("click", pause);
  if (autoRun) {
    autoRun.addEventListener("click", () => {
      advance(performance.now());
      if (chase.phase === "finished") restart();
      chase.setAutoRunning(!chase.autoRunning);
      clearError();
      dirty = true;
      show();
      focusInput();
    });
    autoRun.hidden = autoRun.disabled = false;
  }
  controls.shuffle.addEventListener("click", () => {
    let next = randomSeed();
    while (next === seed) next = randomSeed();
    seed = next;
    restart();
  });
  controls.mute.addEventListener("click", () => {
    muted = !muted;
    controls.mute.setAttribute("aria-pressed", String(muted));
    sound.mute(muted);
    focusInput();
  });
  for (const code of ["en", "zh"]) {
    controls[code].addEventListener("click", () => {
      if (language === code) {
        focusInput();
        return;
      }
      language = code;
      restart();
    });
  }

  typing.addEventListener("click", focusInput);
  view.addEventListener("click", focusInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && chase.phase === "running") pause();
  });
  document.addEventListener("keydown", (event) => {
    if (event.isComposing || input.dataset.composing === "true" || event.keyCode === 229) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Escape" && !event.repeat && ["running", "paused"].includes(chase.phase)) {
      event.preventDefault();
      pause();
      return;
    }
    if (!canType() || Array.from(event.key).length !== 1) return;
    if (event.key === " " && event.target.closest?.("button")) return;
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    sound.unlock();
    if (event.target === input) return;
    focusInput();
    if (language === "en") {
      event.preventDefault();
      submit(event.key);
    }
  });

  for (const control of Object.values(controls)) control.disabled = false;
  input.disabled = false;
  get("loading").hidden = true;
  restart();

  new ResizeObserver(() => { dirty = true; }).observe(view);
  function frame() {
    const now = performance.now();
    advance(now);
    if (dirty) {
      street.draw(chase, Math.min(.10, (now - drawnAt) / 1000));
      drawnAt = now;
      dirty = false;
      show();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((reason) => {
  app.dataset.state = "error";
  get("loading").hidden = true;
  const error = get("error");
  error.hidden = false;
  error.textContent = "街区加载失败。请使用支持 WebGL 2 的电脑浏览器刷新重试。";
  console.error(reason);
});
