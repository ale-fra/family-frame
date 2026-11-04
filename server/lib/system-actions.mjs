// Device operations are injected by the deployment entry point.
// The portable server never starts host processes.
export function createSystemActions() {
  const unsupported = async () => {
    const error = new Error("Device controls are unavailable in this runtime");
    error.status = 501;
    throw error;
  };
  return {
    capabilities: { displayPower: false, nightDisplay: false, refresh: false },
    applyNightDisplaySettings: unsupported,
    setDisplayPower: unsupported,
    triggerRefresh: unsupported
  };
}
