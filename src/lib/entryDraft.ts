/** Date edits may update the original day, but must not replace a different saved day. */
export function assertEntryDestination(date: string, originalDate: string | undefined, existingDates: readonly string[]) {
  if (date !== originalDate && existingDates.includes(date)) {
    throw new Error("There’s already an entry for this date. Open that day from the calendar to edit it.");
  }
}
