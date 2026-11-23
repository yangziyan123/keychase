import { randomFor } from "./route.js";

export const REWARD_WINDOW = 5;

const rewards = [
  ["top", "轻跑鞋", "极速 +1.2 m/s", "speed", Infinity],
  ["kick", "弹簧鞋垫", "每字提速 +0.10 m/s", "speed", 4],
  ["base", "巡航步伐", "基础速度 +0.5 m/s", "speed", 4],
  ["hold", "长呼吸", "减速前多保速 0.10 秒", "control", 4],
  ["pace", "稳速步", "自然减速率降低 12%", "control", 4],
  ["turn", "弯道惯性", "完成弯道挑战，保速 2 秒", "control", 1],
  ["heat", "热手", "连对 20 字，3 秒内每字提速 +25%", "control", 1],
  ["back", "找回节奏", "错后连对 5 字，追回一半掉速", "control", 1],
  ["sip", "能量饮料", "出弯达到八成极速时，保速 3 秒", "item", Infinity],
  ["cap", "备用键帽", "下次输错时保速 0.5 秒", "item", Infinity],
  ["box", "空纸箱", "警察进入 6 米内时，降速 20% · 2 秒", "item", Infinity],
  ["over", "超载", "极速 +3 m/s · 自然减速 +35%", "risk", 2],
  ["edge", "压线反跑", "警察进入 5 米内时，每字提速 +40%", "risk", 1],
  ["bet", "押注下一弯", "完成下一弯挑战，为选中的奖励加码", "risk", 1],
].map(([id, name, detail, kind, limit]) => ({ id, name, detail, kind, limit, command: `@${id}` }));

export const REWARDS = Object.fromEntries(rewards.map((reward) => [reward.id, reward]));

export function drawBendRewards(seed, bend, firstBend, available) {
  const random = randomFor(seed ^ 0x6c8e9cf5, bend);
  const pick = (options) => options[Math.floor(random() * options.length)];
  const pool = rewards.filter(available);
  const growth = pick(pool.filter(({ id, kind }) => kind !== "item" && id !== "bet"));
  const other = pick(pool.filter((reward) => reward !== growth && (!firstBend || reward.kind === "item")));
  return [growth, other];
}
