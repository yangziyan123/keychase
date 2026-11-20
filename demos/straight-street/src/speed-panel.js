import { DEFAULT_SPEEDS } from "./chase.js";

const STORAGE_KEY = "keychase.speed-settings.v1";
const fields = Object.keys(DEFAULT_SPEEDS);
const format = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 });

function validate(speeds) {
  if (!fields.every((name) => Number.isFinite(speeds[name]) && speeds[name] >= 0)) {
    return "请把每项参数填写为非负数字。";
  }
  if (speeds.maxSpeed < speeds.baseSpeed) return "小偷最高跑速须大于或等于基础跑速。";
  if (speeds.policeMaxSpeed < speeds.policeStartSpeed) return "警察最高跑速须大于或等于起跑速度。";
  return "";
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && !validate(saved)) return saved;
  } catch {
    // The demo can also run without browser storage.
  }
  return DEFAULT_SPEEDS;
}

export function connectSpeedPanel(panel, onApply) {
  const form = panel.querySelector("form");
  const notice = form.querySelector("[data-speed-notice]");
  const firstStep = form.querySelector("[data-first-step]");
  const capTime = form.querySelector("[data-cap-time]");
  const inputs = Object.fromEntries(fields.map((name) => [name, form.elements.namedItem(name)]));
  const read = () => Object.fromEntries(fields.map((name) => [name, inputs[name].valueAsNumber]));

  function showEstimates(speeds) {
    const { baseSpeed, maxSpeed, boost, policeStartSpeed, policeMaxSpeed, policeAcceleration } = speeds;
    firstStep.textContent = `首字起步 ${format.format(Math.min(maxSpeed, baseSpeed + boost))} 米/秒`;
    if (policeMaxSpeed === policeStartSpeed) capTime.textContent = "起跑即达到上限";
    else if (policeAcceleration === 0) capTime.textContent = "全程保持起跑速度";
    else capTime.textContent = `约 ${format.format((policeMaxSpeed - policeStartSpeed) / policeAcceleration)} 秒达到上限`;
  }

  function write(speeds) {
    for (const name of fields) inputs[name].value = speeds[name];
    showEstimates(speeds);
  }

  function apply(speeds, message) {
    const error = validate(speeds);
    notice.dataset.error = String(Boolean(error));
    if (error) {
      notice.textContent = error;
      return;
    }
    onApply(speeds);
    notice.textContent = message;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(speeds));
    } catch {
      notice.textContent = `${message}当前浏览器无法保存参数。`;
    }
  }

  const initial = load();
  write(initial);
  for (const control of form.querySelectorAll("[disabled]")) control.disabled = false;
  form.addEventListener("input", () => {
    const speeds = read();
    const error = validate(speeds);
    notice.dataset.error = String(Boolean(error));
    notice.textContent = error || "参数有改动，应用后开始新一局。";
    if (!error) showEstimates(speeds);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply(read(), "已应用。打字起跑或点击自动演示。");
  });
  form.querySelector("[data-speed-defaults]").addEventListener("click", () => {
    write(DEFAULT_SPEEDS);
    apply(DEFAULT_SPEEDS, "已恢复默认参数。");
  });
  return initial;
}
