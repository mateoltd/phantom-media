/**
 * The motion of the stream the welcome tour watches (see WelcomeStream, which draws it): where everything is at each
 * moment of its one timeline. The drawing only has to provide the elements named in tracks().
 */

/** The court is drawn on a sheet 320 wide and 180 tall. A unit is this share of the picture's width. */
const UNIT = 100 / 320;
/** One attempt, from the first bounce to the ball back in hand. The stream is this, over and over. */
export const ATTEMPT = 7200;
/** A sample every fiftieth of a second. Every moment the ball touches something falls on one. */
const STEP = 20;
/** Every attempt misses but the third: one moment worth having seen, with enough before and after it to rewind through. */
export const MADE_ATTEMPT = 2;
const DRIBBLE = 720, GATHER = 3600, CROUCHED = 3860, SPRING = 4080, RELEASE = 4200, LANDED = 4720, RIM = 5300;
const CHEER = 5460, HOP = 440, HOPS = 3, CHEERED = CHEER + HOPS * HOP;

/** The moments of the stream the tour is told around, in the stream's own time. */
export const STREAM = {
  /** The first shot is in the air: where a break would cut in. */
  airborne: RELEASE + 550,
  /** The shot that goes in has just left for the hoop: the last thing seen before looking away. */
  released: MADE_ATTEMPT * ATTEMPT + RELEASE + 250,
  /** Just before the shot that goes in is taken. */
  before: MADE_ATTEMPT * ATTEMPT + GATHER,
  /** It has gone in, the score has changed and the cheering has started. */
  after: MADE_ATTEMPT * ATTEMPT + RIM + 400,
  /** The cheering has been seen. */
  cheered: MADE_ATTEMPT * ATTEMPT + RIM + 900,
} as const;

/** What the tour's script does to the stream: reads its time, and puts it somewhere else. */
export interface Reel {
  now: () => number;
  seek: (ms: number) => void;
}

type Point = readonly [number, number];
/** The shooter stands clear of where the mascot waits with its bubble, at the left of the floor. */
const FEET: Point = [160, 132], SHOULDER: Point = [16.8, 33.1], FACE = 15.5;
const BALL = 6, FLOOR = FEET[1] - BALL;
/** Where a dribble tops out, beside the shooter. */
const HAND: Point = [190, 105];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const share = (time: number, from: number, to: number) => clamp((time - from) / (to - from));
const ease = (progress: number) => progress * progress * (3 - 2 * progress);
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
/** A throw or a bounce: straight across, and up by `lift` on the way. */
const arc = (from: Point, to: Point, progress: number, lift: number): Point =>
  [mix(from[0], to[0], progress), mix(from[1], to[1], progress) - 4 * lift * progress * (1 - progress)];
/** How high a dribbled ball is, from 0 on the floor to 1 in hand: it hangs at the top and is quickest at the floor. */
const bounce = (time: number) => 1 - (1 - Math.abs(2 * (((time % DRIBBLE) + DRIBBLE) % DRIBBLE) / DRIBBLE - 1)) ** 2;
/** A body coming to rest after a landing, from however stretched it came down. */
const settle = (progress: number, from: number, give = 0.15) =>
  1 + Math.exp(-4.5 * progress) * ((from - 1) * Math.cos(10 * progress) - give * Math.sin(10 * progress));

/** How the shooter holds itself: how far off the floor, how tall against its resting height, and how far it leans. */
interface Pose { lift: number; tall: number; lean: number }

/** Dribbling, it gives a little with each bounce, a moment behind the ball. */
const dribbling = (time: number): Pose => ({ lift: 0, tall: 1 - 0.04 * (1 - bounce(time - 70)), lean: 2 });
const between = (from: Pose, to: Pose, progress: number): Pose =>
  ({ lift: mix(from.lift, to.lift, progress), tall: mix(from.tall, to.tall, progress), lean: mix(from.lean, to.lean, progress) });

function pose(time: number, made: boolean): Pose {
  if (time < GATHER) return dribbling(time);
  // It sinks and leans back before the shot, holds that for a beat, and springs out of it.
  const coiled: Pose = { lift: 0, tall: 0.8, lean: -2.5 };
  if (time < SPRING) return between(dribbling(GATHER), coiled, ease(share(time, GATHER, SPRING - 80)));
  if (time < RELEASE) return between(coiled, { lift: 0, tall: 1.15, lean: 3 }, share(time, SPRING, RELEASE) ** 2);
  if (time < LANDED) {
    const air = share(time, RELEASE, LANDED);
    return { lift: -13 * 4 * air * (1 - air), tall: 1 + 0.15 * (1 - ease(share(air, 0, 0.5))) + 0.05 * ease(share(air, 0.6, 1)), lean: mix(3, 5, ease(air)) };
  }
  const watching: Pose = { lift: 0, tall: settle(share(time, LANDED, LANDED + 480), 1.05), lean: mix(5, 2, ease(share(time, LANDED, LANDED + 480))) };
  const back = ease(share(time, ATTEMPT - 340, ATTEMPT));
  if (!made) {
    // A miss lets the air out of it for a while.
    const down = ease(share(time, RIM + 60, RIM + 420)) * (1 - ease(share(time, 6300, 6800)));
    return between({ ...watching, tall: watching.tall - 0.07 * down, lean: watching.lean - 2 * down }, dribbling(time - ATTEMPT), back);
  }
  if (time < CHEER) return watching;
  if (time >= CHEERED) return between({ lift: 0, tall: settle(share(time, CHEERED, CHEERED + 400), 1.07), lean: 2 }, dribbling(time - ATTEMPT), back);
  // It goes in: three hops, each pressed into the floor first and stretched on the way up and down.
  const hop = (time - CHEER) % HOP, first = time - CHEER < HOP;
  const sway = 2 + 5 * Math.sin((time - CHEER) / (2 * HOP) * 2 * Math.PI) * ease(share(time, CHEER, CHEER + 200)) * (1 - ease(share(time, CHEERED - 200, CHEERED)));
  if (hop < 100) return { lift: 0, tall: mix(first ? 1 : 1.07, 1.07, hop / 100) - 0.2 * Math.sin(hop / 100 * Math.PI), lean: sway };
  const air = (hop - 100) / (HOP - 100);
  return { lift: -10 * 4 * air * (1 - air), tall: 1 + 0.07 * (2 * air - 1) ** 2, lean: sway };
}

/** How much wider a squashed body gets, so that it keeps its bulk. */
const wide = (tall: number) => 1 + (1 - tall) * 0.55;
/** A point on the shooter's body, given from its feet, where the pose has carried it. */
function carried({ lift, tall, lean }: Pose, [across, up]: Point, feet = FEET): Point {
  const x = across * wide(tall), y = -up * tall, turn = lean * Math.PI / 180;
  return [feet[0] + x * Math.cos(turn) - y * Math.sin(turn), feet[1] + lift + x * Math.sin(turn) + y * Math.cos(turn)];
}

const LET_GO = carried(pose(RELEASE, false), SHOULDER);
/** Where each kind of attempt meets the hoop: down through the middle of it, or onto the front of the rim. */
const IN: Point = [255, 80], FRONT: Point = [239, 76];
/** When the ball touches the floor in an attempt, and how hard. */
const touches = (made: boolean): Point[] => [
  ...Array.from({ length: GATHER / DRIBBLE }, (_, index): Point => [index * DRIBBLE + DRIBBLE / 2, 0.16]),
  ...(made ? [[5640, 0.26], [6340, 0.16], [6860, 0.1]] as Point[] : [[6140, 0.26], [6860, 0.14]] as Point[]),
];

/** Where the ball is, `time` into an attempt. */
function ball(time: number, made: boolean): Point {
  if (time < GATHER) return [HAND[0], FLOOR - (FLOOR - HAND[1]) * bounce(time)];
  const held = carried(pose(time, made), SHOULDER);
  if (time < CROUCHED) {
    // Off the last bounce and up onto its shoulder.
    const taken = ease(share(time, GATHER, CROUCHED));
    return [mix(HAND[0], held[0], taken), mix(HAND[1], held[1], taken) - 12 * taken * (1 - taken)];
  }
  if (time < RELEASE) return held;
  if (time < RIM) return arc(LET_GO, made ? IN : FRONT, share(time, RELEASE, RIM), 38);
  const rising = (from: Point, since: number): Point => {
    // The last bounce carries it back up to the hand, where it hangs for the next dribble to start.
    const up = share(time, since, ATTEMPT);
    return [mix(from[0], HAND[0], up), mix(from[1], HAND[1], 1 - (1 - up) ** 2)];
  };
  if (made) {
    // The net takes most of its speed, then it drops and bounces its way back.
    const through = share(time, RIM, 5640);
    if (time < 5640) return [IN[0] + 6 * (1 - (1 - through) ** 2), mix(IN[1], FLOOR, 0.66 * through + 0.34 * through ** 2)];
    if (time < 6340) return arc([261, FLOOR], [229, FLOOR], share(time, 5640, 6340), 23);
    if (time < 6860) return arc([229, FLOOR], [207, FLOOR], share(time, 6340, 6860), 12.5);
    return rising([207, FLOOR], 6860);
  }
  // Off the front of the rim, and back the way it came.
  if (time < 6140) return arc(FRONT, [213, FLOOR], share(time, RIM, 6140), 34);
  if (time < 6860) return arc([213, FLOOR], [197, FLOOR], share(time, 6140, 6860), 24);
  return rising([197, FLOOR], 6860);
}

/** The ball's shape: longer the faster it falls or rises, and flattened for an instant where it meets the floor. */
function shape(time: number, made: boolean): Point {
  const pressed = touches(made).reduce((most, [at, hard]) => Math.max(most, hard * Math.cos(share(Math.abs(time - at), 0, 60) * Math.PI / 2) ** 2), 0);
  const free = time < GATHER || time >= RELEASE ? 1 : 0;
  const speed = Math.abs(ball(time + 5, made)[1] - ball(time - 5, made)[1]) / 10;
  const long = pressed > 0 ? -pressed : 0.08 * free * clamp(speed / 0.22);
  return [1 - 0.7 * long, 1 + long];
}

/** How fast the ball turns, in degrees a millisecond: lazily in a dribble, backwards off a shot and all the way home. */
const spin = (time: number) => time < GATHER ? 0.08 * ease(share(time, 0, 300)) : time < RELEASE ? 0 : -0.44;

/** Where the eyes are looking and how open they are: on the ball, narrowed to aim, let down by a miss. */
function gaze(time: number, made: boolean, [x, y]: Point, stance: Pose): readonly [number, number, number] {
  const [fromX, fromY] = carried(stance, [0, FACE]);
  const far = Math.hypot(x - fromX, y - fromY) || 1, reach = 2 * clamp(far / 40) / far;
  const blink = [1260, 2940, ATTEMPT - 420].reduce((most, at) => Math.max(most, Math.cos(share(Math.abs(time - at), 0, 80) * Math.PI / 2) ** 2), 0);
  const aiming = 0.25 * ease(share(time, GATHER, CROUCHED)) * (1 - share(time, SPRING, RELEASE));
  const down = made ? 0 : 0.55 * ease(share(time, RIM + 60, RIM + 300)) * (1 - ease(share(time, 6300, 6700)));
  return [(x - fromX) * reach, (y - fromY) * reach, (1 - aiming - down) * (1 - 0.9 * blink)];
}

/** How the hoop takes the ball, from 1 dying away to nothing: the net pulled and springing back, the rim rung. */
const rung = (time: number) => {
  const since = (time - RIM) / 900;
  return since < 0 || since > 1 ? 0 : Math.exp(-4.5 * since) * Math.sin(since * 5 * Math.PI);
};

const units = (value: number) => `${(value * UNIT).toFixed(3)}cqw`;

/**
 * One attempt as keyframes, sampled finely enough that straight lines between them read as curves. The stream loops
 * these, so however long it runs it costs the browser one attempt's worth, and an attempt ends exactly as it began.
 */
export function tracks(made: boolean) {
  const balls: Keyframe[] = [], players: Keyframe[] = [], eyes: Keyframe[] = [], shadows: Keyframe[] = [], grounds: Keyframe[] = [], nets: Keyframe[] = [], hoops: Keyframe[] = [];
  // The ball has to come round to where it started, so its turning is trimmed to whole turns over the attempt.
  let turned = 0;
  for (let time = 0; time < ATTEMPT; time += STEP) turned += spin(time) * STEP;
  const trim = Math.round(turned / 360) * 360 / turned;
  turned = 0;
  for (let time = 0; time <= ATTEMPT; time += STEP) {
    const [x, y] = ball(time, made), [across, along] = shape(time, made), stance = pose(time, made);
    const [lookX, lookY, open] = gaze(time, made, [x, y], stance);
    // A flattened ball stays on the floor, and its shadow shrinks and fades as it rises.
    const near = 1 - 0.55 * clamp((FLOOR - y) / 100);
    balls.push({ transform: `translate(${units(x)}, ${units(y + BALL * (1 - along))}) scale(${across.toFixed(3)}, ${along.toFixed(3)}) rotate(${(turned * trim).toFixed(1)}deg)` });
    shadows.push({ transform: `translateX(${units(x)}) scale(${(near * across).toFixed(3)}, ${near.toFixed(3)})`, opacity: (0.7 * near).toFixed(3) });
    // The shooter has no limbs to pose: everything it does is told by its body, its eyes and its shadow letting go of it.
    players.push({ transform: `translateY(${units(stance.lift)}) rotate(${stance.lean.toFixed(2)}deg) scale(${wide(stance.tall).toFixed(3)}, ${stance.tall.toFixed(3)})` });
    eyes.push({ transform: `translate(${units(lookX)}, ${units(lookY)}) scaleY(${open.toFixed(3)})` });
    const grounded = (1 + stance.lift / 30) * wide(stance.tall);
    grounds.push({ transform: `scale(${grounded.toFixed(3)})`, opacity: clamp(0.4 + 0.6 * (1 + stance.lift / 30)).toFixed(3) });
    const ring = rung(time);
    nets.push({ transform: made ? `scaleY(${(1 + 0.32 * ring).toFixed(3)}) skewX(${(-4 * ring).toFixed(2)}deg)` : `scaleY(1) skewX(${(8 * ring).toFixed(2)}deg)` });
    hoops.push({ transform: `rotate(${((made ? -1 : -3.5) * ring).toFixed(2)}deg)` });
    turned += spin(time) * STEP;
  }
  return [
    [".still-tour-ball", balls],
    [".still-tour-shadow", shadows],
    [".still-tour-player", players],
    [".still-tour-gaze", eyes],
    [".still-tour-ground", grounds],
    [".still-tour-net", nets],
    [".still-tour-hoop", hoops],
  ] as const;
}

/** The score, which is the one thing that does not come round again: it rolls over as the ball drops through. */
export const SCORED = MADE_ATTEMPT * ATTEMPT + RIM + 60;
/** How long the score takes to roll over. */
export const ROLL = 320;
export function score() {
  const roll = (from: string, to: string, shown: number): Keyframe[] => [
    { transform: `translateY(${from})`, opacity: shown, easing: "cubic-bezier(0.3, 0, 0.1, 1)" },
    { transform: `translateY(${to})`, opacity: 1 - shown },
  ];
  return [
    [".still-tour-board > :first-child", roll("0%", "-70%", 1)],
    [".still-tour-board > :last-child", roll("70%", "0%", 0)],
  ] as const;
}

/**
 * The other thing the tour watches: the video Twitch keeps for subscribers, which is Still staring at a toaster. The
 * toast pops, lands on its head, and is sent back for another go. One round of that, looped.
 *
 * Both videos are framed alike, close on what is happening, and the figure is the same size in each.
 */
export const TOASTING = 6400;
const POP = 2600, HAT = 3700, COIL = 4700, TOSS = 5000, THROWN = TOSS + 80, HOME = 5900, SUNK = 6000;
const SEAT: Point = [176, 132], CROWN: Point = [0, 37], SLOT: Point = [234, 103], MOUTH: Point = [234, 90], PRESSED = 11;

function sitting(time: number): Pose {
  // It leans in on the toaster by degrees, as if that would hurry it.
  const staring: Pose = { lift: 0, tall: 1, lean: 2.5 * ease(share(time, 300, 2200)) };
  if (time < POP) return staring;
  if (time < POP + 340) {
    // The pop makes it jump.
    const air = share(time, POP, POP + 340);
    return { lift: -6 * 4 * air * (1 - air), tall: 1 + 0.12 * Math.sin(air * Math.PI), lean: mix(2.5, -3, ease(share(air, 0, 0.6))) };
  }
  if (time < HAT) return { lift: 0, tall: settle(share(time, POP + 340, POP + 760), 1, 0.07), lean: mix(-3, 0, ease(share(time, POP + 340, HAT))) };
  // The toast comes down on it, and it sits under it for a while, working that out.
  const hatted: Pose = { lift: 0, tall: settle(share(time, HAT, HAT + 450), 1, 0.1), lean: 0 };
  const coiled: Pose = { lift: 0, tall: 0.82, lean: -3 };
  if (time < TOSS) return between(hatted, coiled, ease(share(time, COIL, TOSS - 60)));
  if (time < THROWN) return between(coiled, { lift: 0, tall: 1.14, lean: 4 }, share(time, TOSS, THROWN) ** 2);
  if (time < THROWN + 400) {
    const air = share(time, THROWN, THROWN + 400);
    return { lift: -9 * 4 * air * (1 - air), tall: 1 + 0.14 * (1 - ease(share(air, 0, 0.5))) + 0.04 * ease(share(air, 0.6, 1)), lean: mix(4, 2, ease(air)) };
  }
  return { lift: 0, tall: settle(share(time, THROWN + 400, THROWN + 880), 1.04, 0.08), lean: mix(2, 0, ease(share(time, THROWN + 400, TOASTING))) };
}

const WORN = carried(sitting(HAT), CROWN, SEAT), FLUNG = carried(sitting(THROWN), CROWN, SEAT);

/** Where the toast is and how far round it has turned. It leaves the slot and comes back to it straight up and down. */
function toast(time: number): readonly [number, number, number] {
  if (time < POP) return [...SLOT, 0];
  if (time < HAT) {
    const flown = share(time, POP, HAT);
    return [mix(SLOT[0], WORN[0], flown ** 1.8), arc(SLOT, WORN, flown, 52)[1], -372 * (1 - (1 - share(flown, 0.14, 1)) ** 1.5)];
  }
  const stance = sitting(time);
  if (time < THROWN) return [...carried(stance, CROWN, SEAT), -372 + stance.lean];
  if (time < HOME) {
    const flown = share(time, THROWN, HOME);
    return [mix(FLUNG[0], MOUTH[0], 1 - (1 - flown) ** 1.8), arc(FLUNG, MOUTH, flown, 40)[1], mix(-368, -720, ease(share(flown, 0, 0.9)))];
  }
  return [SLOT[0], mix(MOUTH[1], SLOT[1], 1 - (1 - share(time, HOME, SUNK)) ** 2), -720];
}

/** One round of the toaster video as keyframes. */
export function kitchen() {
  const toasts: Keyframe[] = [], sitters: Keyframe[] = [], eyes: Keyframe[] = [], grounds: Keyframe[] = [], toasters: Keyframe[] = [], levers: Keyframe[] = [];
  const blinks = [900, HAT + 450, HAT + 720];
  for (let time = 0; time <= TOASTING; time += STEP) {
    const stance = sitting(time), [x, y, turn] = toast(time);
    toasts.push({ transform: `translate(${units(x)}, ${units(y)}) rotate(${turn.toFixed(1)}deg)` });
    sitters.push({ transform: `translateY(${units(stance.lift)}) rotate(${stance.lean.toFixed(2)}deg) scale(${wide(stance.tall).toFixed(3)}, ${stance.tall.toFixed(3)})` });
    // Its eyes stay on the toaster until there is toast to follow: narrowing as it waits, wide when it goes off.
    const out = ease(share(time, POP, POP + 120)) * (1 - ease(share(time, SUNK, SUNK + 200)));
    const [fromX, fromY] = carried(stance, [0, FACE], SEAT), toX = mix(SLOT[0], x, out) - fromX, toY = mix(100, y, out) - fromY;
    const far = Math.hypot(toX, toY) || 1, reach = 2.5 * clamp(far / 22) / far;
    const blink = blinks.reduce((most, at) => Math.max(most, Math.cos(share(Math.abs(time - at), 0, 80) * Math.PI / 2) ** 2), 0);
    const open = 1 - 0.2 * ease(share(time, 1500, 2400)) * (1 - share(time, POP, POP + 60)) + 0.25 * ease(share(time, POP, POP + 60)) * (1 - ease(share(time, POP + 500, POP + 900)));
    eyes.push({ transform: `translate(${units(toX * reach)}, ${units(toY * reach)}) scaleY(${(open * (1 - 0.84 * blink)).toFixed(3)})` });
    const grounded = (1 + stance.lift / 30) * wide(stance.tall);
    grounds.push({ transform: `scale(${grounded.toFixed(3)})`, opacity: clamp(0.4 + 0.6 * (1 + stance.lift / 30)).toFixed(3) });
    // The toaster shivers before it goes off, kicks when it does, and gives when the toast comes back.
    const shiver = 0.7 * Math.sin((time - 2200) / 120 * 2 * Math.PI) * share(time, 2200, POP) * (time < POP ? 1 : 0);
    const kick = time < POP ? 0 : 0.09 * Math.exp(-4 * share(time, POP, POP + 500)) * Math.sin(11 * share(time, POP, POP + 500)) * (1 - share(time, POP + 400, POP + 500));
    const give = time < HOME ? 0 : 0.07 * Math.exp(-4 * share(time, HOME, TOASTING)) * Math.sin(11 * share(time, HOME, TOASTING)) * (1 - share(time, TOASTING - 100, TOASTING));
    toasters.push({ transform: `rotate(${shiver.toFixed(2)}deg) scale(${wide(1 + kick - give).toFixed(3)}, ${(1 + kick - give).toFixed(3)})` });
    // The lever is down while it toasts, and the toast coming home pushes it down again.
    const up = share(time, POP, POP + 100);
    const down = time < POP ? PRESSED : time < HOME ? PRESSED * (1 - up) - 1.5 * Math.sin(up * Math.PI) * (1 - up) : PRESSED * (1 - (1 - share(time, HOME, SUNK)) ** 2);
    levers.push({ transform: `translateY(${units(down)})` });
  }
  return [
    [".still-tour-toast", toasts],
    [".still-tour-sitter", sitters],
    [".still-tour-gaze", eyes],
    [".still-tour-ground", grounds],
    [".still-tour-toaster", toasters],
    [".still-tour-lever", levers],
  ] as const;
}
