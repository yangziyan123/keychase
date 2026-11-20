import { articleAt } from "./articles.js";
import { Pursuit } from "./pursuit.js";

const AUTO_INPUT_INTERVAL = .1;
const SPEEDS = Object.freeze({
  baseSpeed: 3,
  maxSpeed: 13,
  boost: .5,
  brakeDelay: .25,
  deceleration: 2.5,
  policeStartSpeed: 4.5,
  policeMaxSpeed: 13,
  policeAcceleration: .3,
});

export class Chase extends Pursuit {
  articleIndex = 0;
  index = 0;
  correct = 0;
  attempts = 0;
  autoRunning = false;
  #nextAutoInput = 0;

  constructor(language) {
    super(SPEEDS);
    this.language = language;
  }

  get accuracy() {
    return this.attempts ? Math.round(100 * this.correct / this.attempts) : null;
  }

  get rate() {
    if (this.elapsed < 1) return null;
    const charactersPerUnit = this.language === "zh" ? 1 : 5;
    return Math.round(60 * this.correct / (this.elapsed * charactersPerUnit));
  }

  setAutoRunning(enabled) {
    this.autoRunning = enabled;
    if (!enabled) return;
    this.#nextAutoInput = this.elapsed;
    if (this.phase === "ready") this.#typeAutomatically();
  }

  step(seconds) {
    if (!this.autoRunning || this.phase !== "running" || seconds <= 0) {
      super.step(seconds);
      return;
    }
    const end = this.elapsed + seconds;
    while (this.phase === "running" && this.#nextAutoInput <= end) {
      super.step(this.#nextAutoInput - this.elapsed);
      if (this.phase === "running") this.#typeAutomatically();
    }
    super.step(end - this.elapsed);
    if (this.phase === "finished") this.autoRunning = false;
  }

  #typeAutomatically() {
    const { characters } = articleAt(this.articleIndex, this.language);
    this.submit(characters[this.index]);
    this.#nextAutoInput = this.elapsed + AUTO_INPUT_INTERVAL;
  }

  submit(value) {
    let correct = 0;
    let wrong = 0;
    if (this.phase !== "ready" && this.phase !== "running") return { correct, wrong };

    for (const character of value) {
      const { characters } = articleAt(this.articleIndex, this.language);
      if (character !== characters[this.index]) {
        wrong++;
        continue;
      }
      correct++;
      this.accelerate();
      this.index++;
      if (this.index !== characters.length) continue;
      this.index = 0;
      this.articleIndex++;
    }
    this.correct += correct;
    this.attempts += correct + wrong;
    return { correct, wrong };
  }
}
