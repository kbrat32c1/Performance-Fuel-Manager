/** Only new accounts get the tour on their own. Anyone can replay it from Settings. */
export const TOUR_NEW_ACCOUNT_MAX_LOGS = 3;

export function shouldAutoStartTour(alreadySeen: boolean, weighInCount: number): boolean {
  return !alreadySeen && weighInCount < TOUR_NEW_ACCOUNT_MAX_LOGS;
}
