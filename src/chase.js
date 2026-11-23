import { articleAt } from "./articles.js";
import { Pursuit } from "./pursuit.js";
import { drawBendRewards, REWARDS, REWARD_WINDOW } from "./bend-rewards.js";
import { createRoute, randomFor } from "./route.js";

const AUTO_INPUT_INTERVAL = .1;
const AUTO_REWARD_DELAY = .6;
const SPEEDS = Object.freeze({
  baseSpeed: 3,
  maxSpeed: 13,
  boost: .5,
  brakeDelay: .25,
  deceleration: 2.5,
  policeStartSpeed: 4.5,
  policeAcceleration: .3,
});

export class Chase extends Pursuit {
  articleIndex = 0;
  index = 0;
  correct = 0;
  attempts = 0;
  autoRunning = false;
  rewardOffer = null;
  rewardCommand = "";
  rewardNotice = null;
  bendChallenge = null;
  #nextAutoInput = 0;
  #autoReward = null;
  #lastBend = null;
  #levels = Object.fromEntries(Object.keys(REWARDS).map((id) => [id, 0]));
  #streak = 0;
  #heatUntil = 0;
  #heatReadyAt = 0;
  #sipBend = null;
  #sipUntil = 0;
  #recovery = null;
  #recovered = false;

  constructor(language, seed = 0) {
    super({ ...SPEEDS });
    this.language = language;
    this.seed = seed;
    this.route = createRoute(seed);
  }

  get accuracy() {
    return this.attempts ? Math.round(100 * this.correct / this.attempts) : null;
  }

  get rate() {
    if (this.elapsed < 1) return null;
    const charactersPerUnit = this.language === "zh" ? 1 : 5;
    return Math.round(60 * this.correct / (this.elapsed * charactersPerUnit));
  }

  get expectedCharacter() {
    return articleAt(this.articleIndex, this.language).characters[this.index];
  }

  get canStartRewardCommand() {
    return this.phase === "running" && !!this.rewardOffer && this.expectedCharacter !== "@";
  }

  get challengeTarget() {
    const challenge = this.bendChallenge;
    return challenge && !challenge.completed && !challenge.failed ? challenge : null;
  }

  setAutoRunning(enabled) {
    this.autoRunning = enabled;
    this.#autoReward = null;
    this.rewardCommand = "";
    if (!enabled) return;
    this.#nextAutoInput = this.elapsed;
    if (this.phase === "ready") this.#typeAutomatically();
  }

  step(seconds) {
    if (this.phase !== "running" || seconds <= 0) return;
    const end = this.elapsed + seconds;
    while (this.phase === "running" && this.elapsed < end) {
      const untilAutoInput = this.autoRunning ? this.#nextAutoInput - this.elapsed : Infinity;
      if (untilAutoInput <= 0) {
        this.#typeAutomatically();
        continue;
      }
      // Keep bend and proximity triggers responsive during long frames.
      const duration = Math.min(.05, end - this.elapsed, untilAutoInput);
      const speedBefore = this.speed;
      super.step(duration);
      if (this.phase === "finished") break;
      if (this.#recovery) this.#recovery.lost += Math.max(0, speedBefore - this.speed);
      this.#updateBend();
      this.#checkItems();
    }
    if (this.phase === "finished") {
      this.autoRunning = false;
      this.#closeOffer();
      this.bendChallenge = null;
    }
  }

  #typeAutomatically() {
    this.#nextAutoInput = this.elapsed + AUTO_INPUT_INTERVAL;
    const offer = this.rewardOffer;
    if (offer && !this.#autoReward) {
      const random = randomFor(this.seed ^ 0xa6e85423, offer.bend);
      const { command } = offer.options[Math.floor(random() * offer.options.length)];
      this.#autoReward = {
        command,
        startsAt: Math.min(this.elapsed + AUTO_REWARD_DELAY, offer.until - command.length * AUTO_INPUT_INTERVAL),
      };
    }
    const choice = this.#autoReward;
    if (choice && this.elapsed >= choice.startsAt && (this.rewardCommand || this.canStartRewardCommand)) {
      this.submit(choice.command[this.rewardCommand.length]);
      return;
    }
    this.#typeCharacter(this.expectedCharacter);
  }

  #closeOffer() {
    this.rewardOffer = null;
    this.rewardCommand = "";
    this.#autoReward = null;
  }

  #updateBend() {
    if (this.rewardOffer && this.elapsed >= this.rewardOffer.until) this.#closeOffer();
    const piece = this.route.pieceAt(this.thief);
    const challenge = this.challengeTarget;
    if (challenge && challenge.bend !== piece.index) challenge.failed = true;
    if (!piece.turn || this.#lastBend === piece.index) return;

    this.#closeOffer();
    const firstBend = this.#lastBend === null;
    this.#lastBend = piece.index;
    this.#recovery = null;
    this.#recovered = false;
    this.bendChallenge = null;
    if (this.#levels.turn || this.#levels.bet) {
      const length = this.language === "zh" ? 4 : 8;
      const article = articleAt(this.articleIndex, this.language);
      this.bendChallenge = {
        bend: piece.index, articleIndex: this.articleIndex, start: this.index,
        end: Math.min(this.index + length, article.characters.length),
        inertia: !!this.#levels.turn, bet: !!this.#levels.bet,
        completed: false, failed: false, reward: null,
      };
      this.#levels.bet = 0;
    }
    this.rewardOffer = {
      bend: piece.index,
      options: drawBendRewards(this.seed, piece.index, firstBend,
        ({ id, limit }) => this.#levels[id] < limit),
      until: this.elapsed + REWARD_WINDOW,
    };
  }

  #notify(reward, message) {
    this.rewardNotice = { reward, message, until: this.elapsed + 2 };
  }

  #grant(reward, extra = false) {
    const { id, limit } = reward;
    if (this.#levels[id] >= limit) return;
    this.#levels[id]++;
    const levels = this.#levels;
    Object.assign(this.speeds, {
      maxSpeed: SPEEDS.maxSpeed + 1.2 * levels.top + 3 * levels.over,
      baseSpeed: SPEEDS.baseSpeed + .5 * levels.base,
      boost: SPEEDS.boost + .1 * levels.kick,
      brakeDelay: SPEEDS.brakeDelay + .1 * levels.hold,
      deceleration: SPEEDS.deceleration * (.88 ** levels.pace) * (1.35 ** levels.over),
    });
    this.speed = Math.max(this.speed, this.speeds.baseSpeed);
    if (id === "sip") this.#sipBend = this.#lastBend;
    if (id === "heat") this.#streak = 0;
    this.#notify(reward, extra ? "押注成功" : "已获得");
  }

  #resolveBet() {
    const challenge = this.bendChallenge;
    if (!challenge?.completed || !challenge.bet || !challenge.reward) return;
    challenge.bet = false;
    if (challenge.reward.limit > 1) this.#grant(challenge.reward, true);
  }

  #checkItems() {
    if (this.#levels.box && this.gap <= 6 && this.elapsed >= this.policeSlowUntil) {
      this.#levels.box--;
      this.policeSlowUntil = this.elapsed + 2;
      this.#notify(REWARDS.box, "已触发");
    }
    if (this.#levels.sip && this.elapsed >= this.#sipUntil && this.speed >= .8 * this.speeds.maxSpeed
        && this.route.pieceAt(this.thief).index !== this.#sipBend) {
      this.#levels.sip--;
      this.#sipUntil = this.elapsed + 3;
      this.holdSpeed(3);
      this.#notify(REWARDS.sip, "已触发");
    }
  }

  editRewardCommand(key) {
    if (!this.rewardCommand) return;
    this.rewardCommand = key === "Backspace" ? this.rewardCommand.slice(0, -1) : "";
  }

  #typeReward(character) {
    const longest = Math.max(...this.rewardOffer.options.map(({ command }) => command.length));
    if (this.rewardCommand.length >= longest) return;
    this.rewardCommand += character.toLowerCase();
    const reward = this.rewardOffer.options.find(({ command }) => command === this.rewardCommand);
    if (!reward) return;
    if (this.bendChallenge?.bend === this.rewardOffer.bend) this.bendChallenge.reward = reward;
    this.#closeOffer();
    this.#grant(reward);
    this.#resolveBet();
    this.#checkItems();
  }

  #typeCharacter(character) {
    this.attempts++;
    if (character !== this.expectedCharacter) {
      if (this.challengeTarget) this.bendChallenge.failed = true;
      this.#streak = 0;
      if (this.#levels.back && !this.#recovered) this.#recovery = { hits: 0, lost: 0 };
      if (this.phase === "running" && this.#levels.cap) {
        this.#levels.cap--;
        this.holdSpeed(.5);
        this.#notify(REWARDS.cap, "已触发");
      }
      return false;
    }

    this.correct++;
    const heat = this.elapsed < this.#heatUntil ? 1.25 : 1;
    const edge = this.#levels.edge && this.gap <= 5 ? 1.4 : 1;
    this.accelerate(heat * edge);
    if (++this.#streak >= 20 && this.#levels.heat && this.elapsed >= this.#heatReadyAt) {
      this.#streak = 0;
      this.#heatUntil = this.elapsed + 3;
      this.#heatReadyAt = this.elapsed + 8;
    }
    if (this.#recovery && ++this.#recovery.hits === 5) {
      const { lost } = this.#recovery;
      this.#recovery = null;
      if (lost > 0) {
        this.speed = Math.min(this.speeds.maxSpeed, this.speed + lost / 2);
        this.#recovered = true;
      }
    }
    this.index++;
    if (this.challengeTarget && this.index === this.challengeTarget.end) {
      this.bendChallenge.completed = true;
      if (this.bendChallenge.inertia) this.holdSpeed(2);
      this.#resolveBet();
    }
    if (this.index === articleAt(this.articleIndex, this.language).characters.length) {
      this.index = 0;
      this.articleIndex++;
    }
    this.#checkItems();
    return true;
  }

  submit(value) {
    let correct = 0;
    let wrong = 0;
    if (this.phase !== "ready" && this.phase !== "running") return { correct, wrong };
    for (const character of value) {
      if (this.rewardCommand) this.#typeReward(character);
      else if (character === "@" && this.canStartRewardCommand) this.rewardCommand = "@";
      else if (this.#typeCharacter(character)) correct++;
      else wrong++;
    }
    return { correct, wrong };
  }
}
