export function scheduleSourceAutostart(callback, timers = globalThis) {
  let active = true;
  const timer = timers.setTimeout(() => {
    if (active) callback();
  }, 0);
  return () => {
    active = false;
    timers.clearTimeout(timer);
  };
}
