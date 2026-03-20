/**
 * Global application configuration flags.
 *
 * These can be toggled to enable/disable features across the app.
 */

// Set to true if YouTube blocks server-side downloads and bridge isn't working
export const DOWNLOADS_RESTRICTED = false;

// Use WebSocket bridge for downloads (browser fetches, server muxes)
export const USE_WS_BRIDGE = true;
