import { hostname, networkInterfaces } from "node:os";

// Next matches Origin/Referer hostnames, without schemes or ports.
export function allowedDevOrigins() {
  const machineName = hostname().toLowerCase();
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? []).map(({ address, family }) =>
      family === "IPv6" ? `[${address}]` : address,
    ),
  );

  return [...new Set([
    machineName,
    machineName.split(".")[0],
    "*.local",
    "**.ts.net",
    ...addresses,
    ...(process.env.PHANTOM_DEV_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ])];
}
