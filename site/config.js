window.SITE = {
  nome: "Ritual Studio",

  // Floating WhatsApp button (number in international format, digits only).
  whatsapp: {
    numero: "254758097553",
    mensagem: "Hi Ritual Studio! I'd like to ask about classes.",
  },

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

  // Studio contact details (shown in "Find us", the footer and booking messages).
  contato: {
    telefone: "0758 097 553",
    telefoneLink: "+254758097553",
    email: "ritualstudio8@gmail.com",
  },

  // Price list (KES), from the studio's price list. `credits` = class credits a payment adds
  // to the client's account in the admin (leave out for memberships and single services).
  precos: [
    {
      grupo: "Reformer",
      itens: [
        { name: "Intro", detail: "2 classes", price: 5000, credits: 2 },
        { name: "Single class", price: 3000, credits: 1 },
        { name: "5 class pack", price: 12000, credits: 5 },
        { name: "8 class pack", price: 19500, credits: 8 },
        { name: "10 class pack", price: 23000, credits: 10 },
        { name: "12 class pack", price: 27000, credits: 12 },
      ],
    },
    {
      grupo: "Hot Pilates",
      itens: [
        { name: "Intro", detail: "3 sessions within a week", price: 5000, credits: 3 },
        { name: "1 class", price: 2000, credits: 1 },
        { name: "1 month package", price: 18000 },
        { name: "3 month package", price: 50000 },
      ],
    },
    {
      grupo: "Cold Plunge",
      itens: [
        { name: "Cold plunge, members", price: 700 },
        { name: "Cold plunge, non-members", price: 1000 },
        { name: "Fire and Ice bundle", detail: "Hot Pilates class and cold plunge", price: 2500 },
        { name: "Pilates and Plunge bundle", detail: "Reformer class and cold plunge", price: 3500 },
      ],
    },
  ],

};
