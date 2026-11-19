/* Ritual Studio's weekly schedule (from the studio's schedule graphics, November 2026).
   day: 1 = Monday … 6 = Saturday. Every class is 50 minutes.
   price = the single-class price in KES (Reformer 3,000, Hot Pilates 2,000), charged for one booking.
   Staff change the live timetable on admin.html; this file only seeds a new database. */

const SIG = "Ritual Signature", INTRO = "Ritual 101", POWER = "Ritual Power", HOT = "Hot Pilates";
const MON_FRI = [1, 2, 3, 4, 5], MON_SAT = [1, 2, 3, 4, 5, 6];

const reformer = [
  ["07:00", SIG, MON_FRI],
  ["08:00", INTRO, MON_SAT],
  ["09:00", SIG, MON_SAT],
  ["10:00", SIG, MON_SAT],
  ["11:00", SIG, MON_SAT],
  ["12:00", INTRO, MON_SAT],
  ["13:00", SIG, [6]],
  ["16:00", INTRO, MON_FRI],
  ["17:00", POWER, [1, 4]],
  ["17:00", SIG, [2, 3, 5]],
  ["18:00", SIG, MON_FRI],
];

const hot = [[1, "18:00"], [3, "09:00"], [3, "18:00"], [4, "07:00"], [5, "09:00"], [6, "09:00"]];

const LEVEL = { [INTRO]: "Beginners", [POWER]: "Not for beginners" };

export const TIMETABLE = [
  ...reformer.flatMap(([time, name, days]) => days.map((day) => ({ day, time, name, type: "reformer", level: LEVEL[name] || "All levels" }))),
  ...hot.map(([day, time]) => ({ day, time, name: HOT, type: "mat", level: "All levels" })),
].map((c) => ({ duration: 50, capacity: 8, price: c.type === "mat" ? 2000 : 3000, ...c })) // single-class prices (KES)
  .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
