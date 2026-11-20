import { articleAt } from "./articles.js";

const AUTO_DELAYS = [.21, .19, .24, .26, 4.5, .23, .22, .34, 6.2];
export const THIEF_START = -19;
const START_LEAD = 16;
const COP_START = THIEF_START - START_LEAD;
const CAPTURE_DISTANCE = 1;

export const DEFAULT_SPEEDS = Object.freeze({
  baseSpeed: 3,
  maxSpeed: 13,
  boost: .5,
  brakeDelay: .5,
  deceleration: 1.5,
  policeStartSpeed: 4.5,
  policeMaxSpeed: 12,
  policeAcceleration: .125,
});

export class Chase {
  phase = "ready";
  mode = "type";
  thief = THIEF_START;
  police = COP_START;
  speed = 0;
  policeSpeed = 0;
  elapsed = 0;
  sinceHit = 0;
  index = 0;
  articleIndex = 0;
  autoIndex = 0;
  autoRemaining = AUTO_DELAYS[0];

  constructor(speeds = DEFAULT_SPEEDS) {
    this.speeds = speeds;
  }

  get article() { return articleAt(this.articleIndex); }

  hit(character) {
    if (this.mode !== "type" || (this.phase !== "ready" && this.phase !== "running")) return false;
    if (this.article.characters[this.index] !== character) return false;
    this.acceptCharacter();
    return true;
  }

  acceptCharacter() {
    const { baseSpeed, maxSpeed, boost, policeStartSpeed } = this.speeds;
    if (this.phase === "ready") this.policeSpeed = policeStartSpeed;
    this.phase = "running";
    this.index++;
    if (this.index === this.article.characters.length) {
      this.index = 0;
      this.articleIndex++;
    }
    this.sinceHit = 0;
    this.speed = Math.min(maxSpeed, Math.max(baseSpeed, this.speed) + boost);
  }

  watch() {
    this.mode = "auto";
    this.acceptCharacter();
  }

  step(seconds) {
    if (this.phase !== "running" || seconds <= 0) return;
    if (this.mode === "type") {
      this.move(seconds);
      return;
    }
    while (seconds >= this.autoRemaining) {
      this.move(this.autoRemaining);
      if (this.phase === "finished") return;
      seconds -= this.autoRemaining;
      this.acceptCharacter();
      this.autoIndex = (this.autoIndex + 1) % AUTO_DELAYS.length;
      this.autoRemaining = AUTO_DELAYS[this.autoIndex];
    }
    this.move(seconds);
    this.autoRemaining -= seconds;
  }

  move(seconds) {
    const { baseSpeed, brakeDelay, deceleration, policeStartSpeed, policeMaxSpeed, policeAcceleration } = this.speeds;
    const holdLeft = Math.max(0, brakeDelay - this.sinceHit);
    const excess = this.speed - baseSpeed;
    const timeToFloor = deceleration > 0 ? excess / deceleration : Infinity;
    const thiefTravel = (time) => {
      const held = Math.min(time, holdLeft);
      const braking = Math.min(time - held, timeToFloor);
      return baseSpeed * time + excess * (held + braking) - .5 * deceleration * braking ** 2;
    };
    const timeToPoliceCap = policeAcceleration > 0 ? (policeMaxSpeed - this.policeSpeed) / policeAcceleration : Infinity;
    const policeTravel = (time) => {
      const accelerating = Math.min(time, timeToPoliceCap);
      return this.policeSpeed * accelerating + .5 * policeAcceleration * accelerating ** 2
        + policeMaxSpeed * (time - accelerating);
    };
    const gap = this.thief - this.police;
    const captured = (time) => gap + thiefTravel(time) - policeTravel(time) <= CAPTURE_DISTANCE;
    const caught = captured(seconds);
    let duration = seconds;
    if (caught) {
      // Resolve the first capture within the frame so the displayed gap is exact.
      let lower = 0;
      for (let iteration = 0; iteration < 30; iteration++) {
        const middle = (lower + duration) / 2;
        if (captured(middle)) duration = middle;
        else lower = middle;
      }
    }

    this.elapsed += duration;
    this.sinceHit += duration;
    this.thief += thiefTravel(duration);
    this.police += policeTravel(duration);
    this.speed = Math.max(baseSpeed, this.speed - deceleration * Math.max(0, duration - holdLeft));
    this.policeSpeed = Math.min(policeMaxSpeed, policeStartSpeed + policeAcceleration * this.elapsed);
    if (!caught) return;

    this.police = this.thief - CAPTURE_DISTANCE;
    this.phase = "finished";
    this.speed = 0;
    this.policeSpeed = 0;
  }
}
