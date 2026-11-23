import { REWARDS, REWARD_WINDOW } from "./bend-rewards.js";
import { createRewardIcon } from "./reward-icons.js";

function renderCard(reward) {
  const card = document.createElement("div");
  card.className = "reward-card";
  card.dataset.kind = reward.kind;
  const icon = document.createElement("div");
  icon.className = "reward-icon-tile";
  icon.append(createRewardIcon(reward.id));
  const name = document.createElement("strong");
  name.textContent = reward.name;
  const key = document.createElement("kbd");
  const typed = document.createElement("span");
  const pending = document.createElement("span");
  pending.textContent = reward.command;
  key.append(typed, pending);
  const detail = document.createElement("p");
  detail.textContent = reward.detail;
  card.append(icon, name, key, detail);
  return { card, typed, pending, command: reward.command };
}

export function createRewardGuide(button, dialog) {
  button.append(createRewardIcon("guide"));
  const body = dialog.querySelector(".reward-guide-body");
  const hint = document.createElement("p");
  hint.className = "reward-guide-hint";
  hint.textContent = `入弯后 ${REWARD_WINDOW} 秒内，键入卡片上的 @ 指令领取奖励。`;
  body.append(hint);

  for (const [kind, label] of [
    ["speed", "速度"], ["control", "保速与连击"], ["item", "道具"], ["risk", "条件强化"],
  ]) {
    const section = document.createElement("section");
    const title = document.createElement("h3");
    title.textContent = label;
    const grid = document.createElement("div");
    grid.className = "reward-guide-grid";
    for (const reward of Object.values(REWARDS)) {
      if (reward.kind !== kind) continue;
      const { card } = renderCard(reward);
      if (Number.isFinite(reward.limit) && reward.limit > 1) {
        card.querySelector("p").append(` · 最多 ${reward.limit} 层`);
      }
      grid.append(card);
    }
    section.append(title, grid);
    body.append(section);
  }

  function position() {
    const bounds = button.getBoundingClientRect();
    const top = Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - 230));
    const right = Math.max(12, document.documentElement.clientWidth - bounds.right);
    dialog.style.setProperty("--guide-top", `${top}px`);
    dialog.style.setProperty("--guide-right", `${right}px`);
  }
  function reposition() {
    if (dialog.open) position();
  }
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, { passive: true });

  return function openGuide() {
    position();
    dialog.showModal();
  };
}

export function createRewardView(panel, feedback, announcement) {
  const cards = panel.querySelector(".reward-cards");
  const timer = panel.querySelector(".reward-timer");
  const timeBar = panel.querySelector(".reward-time-bar");
  const prompt = panel.querySelector(".reward-prompt");
  let shownOffer;
  let shownNotice;
  let shownCommand;
  let options;

  return function showRewards(chase) {
    const { rewardOffer, rewardCommand, rewardNotice, elapsed } = chase;
    const active = chase.phase === "running";
    const hidePanel = !active || !rewardOffer;
    const hideFeedback = !active || !!rewardOffer || !rewardNotice || elapsed >= rewardNotice.until;
    if (panel.hidden !== hidePanel) panel.hidden = hidePanel;
    if (feedback.hidden !== hideFeedback) feedback.hidden = hideFeedback;
    if (!hidePanel && shownOffer !== rewardOffer) {
      shownOffer = rewardOffer;
      shownCommand = null;
      options = rewardOffer.options.map(renderCard);
      cards.replaceChildren(...options.map(({ card }) => card));
      announcement.textContent = "弯道奖励。"
        + rewardOffer.options.map(({ name, command }) => `${name}，${command}`).join("。");
    }
    if (active && rewardNotice && shownNotice !== rewardNotice) {
      shownNotice = rewardNotice;
      const { reward, message } = rewardNotice;
      feedback.replaceChildren(createRewardIcon(reward.id), `${message} · ${reward.name}`);
      announcement.textContent = `${message}${reward.name}`;
    }
    if (panel.hidden) return;
    const remaining = Math.max(0, rewardOffer.until - elapsed);
    const time = `${remaining.toFixed(1)} 秒`;
    if (timer.textContent !== time) timer.textContent = time;
    timeBar.style.transform = `scaleX(${remaining / REWARD_WINDOW})`;

    if (shownCommand === rewardCommand) return;
    shownCommand = rewardCommand;
    const valid = options.some(({ command }) => command.startsWith(rewardCommand));
    let message = "输入 @ 指令领取其中一项";
    if (rewardCommand) message = valid ? `正在输入 ${rewardCommand}` : `${rewardCommand} 未匹配 · 退格修改`;
    prompt.textContent = message;
    prompt.dataset.invalid = String(!valid);
    for (const { card, command, typed, pending } of options) {
      const matches = command.startsWith(rewardCommand);
      const length = matches ? rewardCommand.length : 0;
      card.dataset.match = String(matches && !!rewardCommand);
      typed.textContent = command.slice(0, length);
      pending.textContent = command.slice(length);
    }
  };
}
