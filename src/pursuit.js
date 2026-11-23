export const THIEF_START = -19;
const START_LEAD = 16;
const POLICE_SLOWDOWN = .2;

export class Pursuit {
  phase = "ready";
  thief = THIEF_START;
  police = THIEF_START - START_LEAD;
  speed = 0;
  elapsed = 0;
  sinceHit = 0;
  holdUntil = 0;
  policeSlowUntil = 0;

  constructor(speeds) {
    this.speeds = speeds;
  }

  get distance() { return this.thief - THIEF_START; }
  get gap() { return this.thief - this.police; }
  get policeSpeed() {
    if (this.phase === "ready" || this.phase === "finished") return 0;
    const { policeStartSpeed, policeAcceleration } = this.speeds;
    const speed = policeStartSpeed + policeAcceleration * this.elapsed;
    return this.elapsed < this.policeSlowUntil ? speed * (1 - POLICE_SLOWDOWN) : speed;
  }

  accelerate(multiplier = 1) {
    const { baseSpeed, maxSpeed, boost } = this.speeds;
    this.phase = "running";
    this.sinceHit = 0;
    this.speed = Math.min(maxSpeed, Math.max(baseSpeed, this.speed) + boost * multiplier);
  }

  holdSpeed(seconds) {
    this.holdUntil = Math.max(this.holdUntil, this.elapsed + seconds);
  }

  step(seconds) {
    if (this.phase === "running" && seconds > 0) this.move(seconds);
  }

  move(seconds) {
    const { baseSpeed, brakeDelay, deceleration, policeStartSpeed, policeAcceleration } = this.speeds;
    const holdLeft = Math.max(0, brakeDelay - this.sinceHit, this.holdUntil - this.elapsed);
    const excess = this.speed - baseSpeed;
    const timeToFloor = deceleration > 0 ? excess / deceleration : Infinity;
    const thiefTravel = (time) => {
      const held = Math.min(time, holdLeft);
      const braking = Math.min(time - held, timeToFloor);
      return baseSpeed * time + excess * (held + braking) - .5 * deceleration * braking ** 2;
    };
    const policeBaseSpeed = policeStartSpeed + policeAcceleration * this.elapsed;
    const policeTravelAtFullSpeed = (time) => policeBaseSpeed * time + .5 * policeAcceleration * time ** 2;
    const slowLeft = Math.max(0, this.policeSlowUntil - this.elapsed);
    const policeTravel = (time) => policeTravelAtFullSpeed(time)
      - POLICE_SLOWDOWN * policeTravelAtFullSpeed(Math.min(time, slowLeft));
    const gap = this.gap;
    const captured = (time) => policeTravel(time) - thiefTravel(time) >= gap;
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
    if (!caught) return;

    this.police = this.thief;
    this.phase = "finished";
    this.speed = 0;
  }
}
