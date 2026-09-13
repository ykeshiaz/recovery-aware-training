import { prisma } from "../../lib/prisma";

export interface SubmitCheckInInput {
  userId: string;
  date: Date;
  mood: number;
  motivation: number;
  stress: number;
  soreness: number;
  note?: string;
}

// Upserts on (userId, date): resubmitting a check-in for a day you've
// already answered edits that day's answers instead of creating a
// duplicate row -- matches the check-in flow being a single daily prompt.
export async function submitCheckIn(input: SubmitCheckInInput) {
  return prisma.dailyCheckIn.upsert({
    where: { userId_date: { userId: input.userId, date: input.date } },
    create: {
      userId: input.userId,
      date: input.date,
      mood: input.mood,
      motivation: input.motivation,
      stress: input.stress,
      soreness: input.soreness,
      note: input.note,
    },
    update: {
      mood: input.mood,
      motivation: input.motivation,
      stress: input.stress,
      soreness: input.soreness,
      note: input.note,
    },
  });
}
