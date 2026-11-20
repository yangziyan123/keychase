import { Chase, THIEF_START } from "./chase.js";
import { createArticleView } from "./article-view.js";
import { createStreet } from "./street.js";
import { connectSpeedPanel } from "./speed-panel.js";
import "./style.css";

const $ = (id) => document.getElementById(id);
const app = $("app");
const view = $("view");
const input = $("typing-input");
const typing = $("typing");
const hint = $("hint");
const speed = $("speed");
const distance = $("distance");
const gap = $("gap");
const policeSpeed = $("police-speed");
const seedDisplay = $("seed");
const speedPanel = $("speed-panel");
const controls = Object.fromEntries(["auto", "reset", "pause", "shuffle"].map((name) => [name, $(name)]));

const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const isCharacter = (value) => typeof value === "string" && Array.from(value).length === 1;

async function main() {
  const street = await createStreet(view);
  const showArticle = createArticleView($("article-window"), $("article-track"), $("active-character"));
  const url = new URL(window.location.href);
  const seedQuery = url.searchParams.get("seed") ?? "";
  let seed = /^[0-9a-f]{1,8}$/i.test(seedQuery) ? Number.parseInt(seedQuery, 16) : randomSeed();
  url.searchParams.delete("map");
  url.searchParams.delete("difficulty");
  let chase;
  let lastFrame;
  let errorTimer;
  let speeds = connectSpeedPanel(speedPanel, (next) => {
    speeds = next;
    restart(false);
  });

  function show() {
    app.dataset.state = chase.phase;
    text(speed, chase.speed.toFixed(1));
    text(policeSpeed, `${chase.policeSpeed.toFixed(1)} m/s`);
    text(gap, `${(chase.thief - chase.police).toFixed(1)} 米`);
    text(controls.pause, chase.phase === "paused" ? "继续" : "暂停");
    controls.pause.disabled = chase.phase !== "running" && chase.phase !== "paused";
    input.readOnly = chase.mode === "auto" || chase.phase === "finished" || chase.phase === "paused";
    input.tabIndex = input.readOnly ? -1 : 0;
    const { brakeDelay, deceleration, baseSpeed } = chase.speeds;
    const prompts = {
      ready: "打对第一个字符起跑，空格和标点也要输入。",
      running: `停打 ${brakeDelay} 秒后每秒减 ${deceleration} m/s，最低 ${baseSpeed} m/s。`,
      paused: "继续后可接着输入。",
      finished: "",
    };
    text(hint, chase.mode === "auto" && chase.phase === "running" ? "小偷会自动输入，警察会随着追逐逐渐加速。" : prompts[chase.phase]);
    hint.hidden = chase.phase === "finished";
    showArticle(chase.articleIndex, chase.index);
    text(distance, `${Math.floor(chase.thief - THIEF_START)} 米`);
  }

  function restart(auto, focus = true) {
    chase = new Chase(speeds);
    street.reset(seed);
    const code = seed.toString(16).padStart(8, "0");
    text(seedDisplay, code);
    url.searchParams.set("seed", code);
    if (url.href !== window.location.href) history.replaceState(null, "", url);
    input.value = "";
    clearTimeout(errorTimer);
    typing.dataset.error = "false";
    if (auto) chase.watch();
    else if (focus) input.focus({ preventScroll: true });
    show();
  }

  function pause() {
    if (chase.phase === "running") chase.phase = "paused";
    else if (chase.phase === "paused") {
      chase.phase = "running";
      if (chase.mode === "type") input.focus({ preventScroll: true });
    }
    show();
  }

  function type(key) {
    const correct = chase.hit(key);
    clearTimeout(errorTimer);
    typing.dataset.error = String(!correct);
    if (!correct) errorTimer = window.setTimeout(() => { typing.dataset.error = "false"; }, 260);
    show();
  }

  controls.auto.addEventListener("click", () => restart(true));
  controls.reset.addEventListener("click", () => restart(false));
  controls.pause.addEventListener("click", pause);
  controls.shuffle.addEventListener("click", () => {
    seed = randomSeed();
    restart(false, false);
  });
  input.addEventListener("paste", (event) => event.preventDefault());
  input.addEventListener("drop", (event) => event.preventDefault());
  input.addEventListener("compositionend", () => { input.value = ""; });
  input.addEventListener("input", (event) => {
    if (event.isComposing) return;
    const character = event.data ?? input.value;
    input.value = "";
    if (!input.readOnly && event.inputType === "insertText" && isCharacter(character)) type(character);
  });
  document.addEventListener("keydown", (event) => {
    if (speedPanel.contains(event.target)) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (event.key === "Escape" && (chase.phase === "running" || chase.phase === "paused") && !event.repeat) {
      event.preventDefault();
      pause();
    }
    if (input.readOnly || !isCharacter(event.key)) return;
    if (event.key === " " && event.target.closest?.("button, summary")) return;
    if (event.repeat) { event.preventDefault(); return; }
    if (event.target !== input) {
      event.preventDefault();
      input.focus({ preventScroll: true });
      type(event.key);
    }
  });

  for (const control of Object.values(controls)) control.disabled = false;
  input.disabled = false;
  restart(false, false);
  street.draw(chase, 0);
  function frame(timestamp) {
    const delta = lastFrame === undefined ? 0 : Math.min(.10, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    chase.step(delta);
    street.draw(chase, delta);
    show();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((reason) => {
  app.dataset.state = "error";
  const error = $("error");
  error.hidden = false;
  error.textContent = "无法打开 3D 街区。请确认使用支持 WebGL 2 的电脑浏览器，然后刷新重试。";
  console.error(reason);
});
