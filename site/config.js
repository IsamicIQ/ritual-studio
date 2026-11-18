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

  // How clients can choose to pay when booking. Online payment isn't connected yet:
  // M-Pesa and card bookings show as "Awaiting payment" until staff record the payment.
  pagamentos: [
    { id: "mpesa", rotulo: "M-Pesa" },
    { id: "card", rotulo: "Card" },
    { id: "studio", rotulo: "Pay at the studio" },
  ],

  // The timetable lives in the database now: staff edit it on admin.html.

  // Leave price empty until confirmed; the site then shows "Pricing coming soon".
  pacotes: [
    { name: "Drop-in class", detail: "One reformer or mat class, booked whenever suits you.", price: "" },
    { name: "Class pack", detail: "A set of classes to use across the timetable.", price: "" },
    { name: "Monthly membership", detail: "Regular classes every week, for clients who come often.", price: "" },
    { name: "Private session", detail: "One-to-one time on the reformer with an instructor.", price: "" },
  ],

};
