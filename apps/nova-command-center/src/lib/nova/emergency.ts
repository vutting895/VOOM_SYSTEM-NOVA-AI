/**
 * Emergency stop. No trusted backend stop endpoint exists yet, so this never sends
 * anything and never reports success. Wire a confirmed Worker POST before changing.
 */
export interface StopAvailability {
  connected: false;
  message: string;
}
export function emergencyStopAvailability(): StopAvailability {
  return {
    connected: false,
    message:
      "Request not connected — no backend endpoint has confirmed an emergency stop. Nothing was sent.",
  };
}