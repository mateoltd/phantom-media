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

export function scheduleSourceAutostartOnce(
  started,
  key,
  callback,
  timers = globalThis,
) {
  if (started.current === key) return undefined;
  return scheduleSourceAutostart(() => {
    if (started.current === key) return;
    started.current = key;
    callback();
  }, timers);
}
