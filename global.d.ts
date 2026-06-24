declare global {
  var engineHeartbeatInterval:
    | ReturnType<typeof setInterval>
    | null
    | undefined;
  var printerWarmupInterval: ReturnType<typeof setInterval> | null | undefined;
}

// Crucial: If this is in a component file, ensure it behaves like a module
export {};
