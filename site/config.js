window.SITE = {
  nome: "Ritual Studio",

  // Skipped for now. Fill in to show the floating WhatsApp button (digits only, e.g. 254700000000).
  whatsapp: null,

  social: {
    instagram: "https://www.instagram.com/ritualstudio.ke/",
    tiktok: "https://www.tiktok.com/@ritualstudio.ke",
  },

  frames: {
    total: 130,
    desktop: "assets/frames/desktop/f_{n}.webp",
    mobile: "assets/frames/mobile/f_{n}.webp",
  },

  // How clients can pay. Online payment is not connected yet (phase 2).
  pagamentos: [
    { id: "mpesa", rotulo: "M-Pesa" },
    { id: "card", rotulo: "Card" },
    { id: "studio", rotulo: "Pay at the studio" },
  ],

  // SAMPLE timetable: replace with the real one, or edit it on admin.html.
  // day: 1 = Monday … 7 = Sunday
  horarioExemplo: [
    { day: 1, time: "07:00", name: "Reformer Foundations", duration: 50, capacity: 8 },
    { day: 1, time: "18:00", name: "Reformer Flow", duration: 50, capacity: 8 },
    { day: 2, time: "07:00", name: "Mat Pilates", duration: 45, capacity: 12 },
    { day: 2, time: "17:30", name: "Reformer Flow", duration: 50, capacity: 8 },
    { day: 3, time: "07:00", name: "Reformer Foundations", duration: 50, capacity: 8 },
    { day: 3, time: "12:30", name: "Lunchtime Mat", duration: 40, capacity: 12 },
    { day: 4, time: "07:00", name: "Reformer Flow", duration: 50, capacity: 8 },
    { day: 4, time: "18:00", name: "Reformer Foundations", duration: 50, capacity: 8 },
    { day: 5, time: "07:00", name: "Mat Pilates", duration: 45, capacity: 12 },
    { day: 5, time: "17:30", name: "Reformer Flow", duration: 50, capacity: 8 },
    { day: 6, time: "09:00", name: "Saturday Reformer", duration: 50, capacity: 8 },
    { day: 6, time: "10:30", name: "Mat Pilates", duration: 45, capacity: 12 },
  ],

  // Leave price empty until confirmed; the site then shows "Pricing coming soon".
  pacotes: [
    { name: "Drop-in class", detail: "One reformer or mat class, booked whenever suits you.", price: "" },
    { name: "Class pack", detail: "A set of classes to use across the timetable.", price: "" },
    { name: "Monthly membership", detail: "Regular classes every week, for clients who come often.", price: "" },
    { name: "Private session", detail: "One-to-one time on the reformer with an instructor.", price: "" },
  ],

  // Preview lock for admin.html only. This is NOT real security: the real staff login comes with the backend.
  adminCodigoPreview: "ritual",
};
