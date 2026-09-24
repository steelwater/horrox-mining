// Stable identifiers: persisted history must keep its meaning across releases.
export const operationCodes: Record<number, string> = {
  101: 'Mining operation started', 112: 'Mining operation complete', 120: 'Returning to facility',
  125: 'Approaching facility', 130: 'Awaiting docking clearance', 135: 'Docking in progress',
  140: 'Docking complete', 151: 'Departing facility', 160: 'Ore cargo loaded',
  165: 'Ore cargo unloaded', 170: 'New mining site located', 180: 'Mining operation paused',
  201: 'Diagnostics requested', 205: 'Equipment fault detected', 210: 'Maintenance required',
  215: 'Repair requested', 220: 'Repair drone assigned', 225: 'Repair drone dispatched',
  230: 'Repair in progress', 235: 'Dock repair required', 240: 'Vessel recalled for service',
  245: 'Repair complete', 250: 'Repair incomplete; further service required', 290: 'Maintenance event resolved',
  301: 'General emergency', 302: 'Collision or impact', 303: 'Hull breach', 304: 'Fire',
  305: 'Electrical fire', 306: 'Fuel or volatile-material leak', 310: 'Crew evacuation',
  315: 'Vessel disabled', 320: 'Vessel stranded', 325: 'Emergency docking requested',
  330: 'Emergency landing', 340: 'Life-support problem', 350: 'External hazard', 390: 'Emergency resolved',
}

export function codeReport(code: number, text: string): string {
  return `${String(code).split('').join(' ')}. ${operationCodes[code]}. ${text}`
}
