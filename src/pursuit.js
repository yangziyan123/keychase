export const THIEF_START = -19;
const START_LEAD = 16;

export class Pursuit {
  phase = "ready";
  thief = THIEF_START;
  police = THIEF_START - START_LEAD;
  speed = 0;
  policeSpeed = 0;
  elapsed = 0;
  sinceHit = 0;

  constructor(speeds) {
    this.speeds = speeds;
  }

  get distance() { return this.thief - THIEF_START; }
  get gap() { return this.thief - this.police; }

  accelerate() {
    const { baseSpeed, maxSpeed, boost, policeStartSpeed } = this.speeds;
    if (this.phase === "ready") this.policeSpeed = policeStartSpeed;
    this.phase = "running";
    this.sinceHit = 0;
    this.speed = Math.min(maxSpeed, Math.max(baseSpeed, this.speed) + boost);
  }

  step(seconds) {
    if (this.phase === "running" && seconds > 0) this.move(seconds);
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
    this.policeSpeed = Math.min(policeMaxSpeed, policeStartSpeed + policeAcceleration * this.elapsed);
    if (!caught) return;

    this.police = this.thief;
    this.phase = "finished";
    this.speed = 0;
    this.policeSpeed = 0;
  }
}
