// Mock data for StayKit prototype.
// Dates are computed relative to "today" so the tape chart always shows live-feeling data.

const _today = new Date();
_today.setHours(0, 0, 0, 0);

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function shortDate(d) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function longDate(d) {
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Indian-number formatter (₹ 1,23,456)
function inr(n, withSymbol = true) {
  const v = Math.round(Math.abs(n));
  const s = v.toLocaleString("en-IN");
  const sign = n < 0 ? "-" : "";
  return (withSymbol ? "₹" + (sign ? " " + sign : "") + " " : sign + "") + s;
}

const PROPERTIES = [
  { id: "p1", name: "Coorg Coffee Cottage", location: "Madikeri, Karnataka", rooms: 7 },
  { id: "p2", name: "Backwaters Verandah",  location: "Alleppey, Kerala",    rooms: 5 },
];

const ROOM_TYPES = [
  { id: "rt-deluxe",   name: "Deluxe Cottage", color: "#1B5E5A" },
  { id: "rt-standard", name: "Standard Room",  color: "#3D5A80" },
  { id: "rt-suite",    name: "Family Suite",   color: "#E07A5F" },
];

const ROOMS = [
  { id: "r-101", num: "101", name: "Plantation View",  type: "rt-deluxe",   clean: "clean"   },
  { id: "r-102", num: "102", name: "Cardamom",         type: "rt-deluxe",   clean: "dirty"   },
  { id: "r-103", num: "103", name: "Hibiscus",         type: "rt-deluxe",   clean: "clean"   },
  { id: "r-201", num: "201", name: "Garden Room",      type: "rt-standard", clean: "clean"   },
  { id: "r-202", num: "202", name: "Bamboo",           type: "rt-standard", clean: "progress"},
  { id: "r-301", num: "301", name: "Coffee Suite",     type: "rt-suite",    clean: "clean"   },
  { id: "r-302", num: "302", name: "Western Ghats",    type: "rt-suite",    clean: "clean"   },
];

const GUESTS = [
  { id: "g1", name: "Sameer Khan",      phone: "+91 98xxx 14782", email: "sameer.k@gmail.com",      city: "Bengaluru",  stays: 3, avatar: "SK" },
  { id: "g2", name: "Anika Mehta",      phone: "+91 98xxx 88301", email: "anika.mehta@outlook.com", city: "Mumbai",     stays: 1, avatar: "AM" },
  { id: "g3", name: "Rohan Iyer",       phone: "+91 99xxx 30217", email: "rohan@iyer.in",            city: "Chennai",    stays: 5, avatar: "RI" },
  { id: "g4", name: "Priyanka Joshi",   phone: "+91 98xxx 71109", email: "p.joshi@gmail.com",        city: "Pune",       stays: 2, avatar: "PJ" },
  { id: "g5", name: "Daniel Müller",    phone: "+49 152 4567xxx", email: "d.mueller@web.de",         city: "Berlin",     stays: 1, avatar: "DM", foreign: true },
  { id: "g6", name: "Vikram Singh",     phone: "+91 98xxx 41023", email: "vik.singh@yahoo.in",       city: "Delhi",      stays: 4, avatar: "VS" },
  { id: "g7", name: "Meera Krishnan",   phone: "+91 99xxx 80921", email: "meera.k@gmail.com",        city: "Kochi",      stays: 1, avatar: "MK" },
  { id: "g8", name: "Arjun Reddy",      phone: "+91 98xxx 55619", email: "arjun.r@hotmail.com",      city: "Hyderabad",  stays: 2, avatar: "AR" },
  { id: "g9", name: "Catherine Wong",   phone: "+65 9123 xxxx",   email: "cwong@gmail.com",          city: "Singapore",  stays: 1, avatar: "CW", foreign: true },
];

// Bookings — placed relative to "today" so the tape chart is always populated.
// start/end are offsets in days from today. paid statuses drive bar colors.
const BOOKINGS_RAW = [
  // Past / checked out
  { id: "BK-2401", roomId: "r-101", guestId: "g3", start: -4, end: -1, source: "direct",   total: 18900, paid: 18900, status: "checkedout", adults: 2, children: 0 },
  { id: "BK-2402", roomId: "r-201", guestId: "g4", start: -3, end: 0,  source: "phone",    total: 11400, paid: 11400, status: "checkedin",  adults: 2, children: 1 },

  // Today's arrivals
  { id: "BK-2403", roomId: "r-103", guestId: "g1", start: 0,  end: 3,  source: "direct",   total: 18900, paid: 9450,  status: "confirmed", adults: 2, children: 0, arriving: true },
  { id: "BK-2404", roomId: "r-202", guestId: "g2", start: 0,  end: 2,  source: "airbnb",   total: 8400,  paid: 8400,  status: "confirmed", adults: 2, children: 0, arriving: true },
  { id: "BK-2405", roomId: "r-302", guestId: "g5", start: 0,  end: 5,  source: "booking",  total: 39750, paid: 0,     status: "confirmed", adults: 2, children: 0, arriving: true, foreign: true },

  // Mid-stay
  { id: "BK-2406", roomId: "r-301", guestId: "g6", start: -1, end: 2,  source: "direct",   total: 24300, paid: 24300, status: "checkedin", adults: 2, children: 2 },

  // Tentative
  { id: "BK-2407", roomId: "r-102", guestId: "g7", start: 1,  end: 4,  source: "phone",    total: 16800, paid: 0,     status: "tentative", adults: 2, children: 0 },

  // Future confirmed
  { id: "BK-2408", roomId: "r-101", guestId: "g8", start: 2,  end: 6,  source: "mmt",      total: 22400, paid: 11200, status: "confirmed", adults: 2, children: 0 },
  { id: "BK-2409", roomId: "r-201", guestId: "g9", start: 3,  end: 7,  source: "booking",  total: 14000, paid: 14000, status: "confirmed", adults: 1, children: 0, foreign: true },
  { id: "BK-2410", roomId: "r-202", guestId: "g4", start: 4,  end: 8,  source: "whatsapp", total: 16800, paid: 0,     status: "confirmed", adults: 2, children: 0 },
  { id: "BK-2411", roomId: "r-103", guestId: "g6", start: 4,  end: 6,  source: "direct",   total: 12600, paid: 6300,  status: "confirmed", adults: 2, children: 1 },
  { id: "BK-2412", roomId: "r-302", guestId: "g1", start: 6,  end: 10, source: "instagram",total: 31800, paid: 31800, status: "confirmed", adults: 2, children: 0 },
  { id: "BK-2413", roomId: "r-301", guestId: "g3", start: 3,  end: 5,  source: "direct",   total: 16200, paid: 0,     status: "confirmed", adults: 2, children: 0 },

  // Owner block
  { id: "BK-BLK01", roomId: "r-102", guestId: null, start: -1, end: 0, source: "block",   total: 0, paid: 0, status: "block", note: "Deep clean — A/C service" },
];

// Today's departures
const DEPARTURES_TODAY_IDS = ["BK-2402"];

// Materialise bookings with dates
const BOOKINGS = BOOKINGS_RAW.map(b => ({
  ...b,
  startDate: addDays(_today, b.start),
  endDate: addDays(_today, b.end),
  nights: b.end - b.start,
}));

// Activity feed
const ACTIVITY = [
  { actor: "Rakesh",  text: "checked in", subject: "Anika Mehta", booking: "BK-2404", room: "Bamboo (202)", when: "11:42 AM", icon: "log-in", tone: "brand" },
  { actor: "Claude",  text: "sent payment link to", subject: "Daniel Müller", booking: "BK-2405", room: "", when: "11:08 AM", icon: "send", tone: "accent", bot: true },
  { actor: "Priya",   text: "created booking", subject: "Sameer Khan", booking: "BK-2403", room: "Hibiscus (103)", when: "10:31 AM", icon: "plus", tone: "" },
  { actor: "System",  text: "received payment from", subject: "Arjun Reddy", booking: "BK-2408", room: "", when: "9:50 AM", icon: "indian-rupee", tone: "brand", amount: 11200 },
  { actor: "Anjali",  text: "marked Cardamom (102) as", subject: "dirty", booking: "", room: "", when: "9:14 AM", icon: "broom", tone: "" },
  { actor: "Rakesh",  text: "extended stay for", subject: "Rohan Iyer", booking: "BK-2413", room: "Coffee Suite", when: "Yesterday", icon: "clock", tone: "" },
];

// Notification templates
const TEMPLATES = [
  { id: "t1", name: "Booking confirmation", channels: ["sms", "email", "whatsapp"], trigger: "On booking" },
  { id: "t2", name: "Payment link",         channels: ["sms", "whatsapp"],          trigger: "Manual or after booking" },
  { id: "t3", name: "Payment received",     channels: ["sms", "email"],             trigger: "On payment" },
  { id: "t4", name: "Check-in reminder",    channels: ["whatsapp"],                 trigger: "1 day before arrival" },
  { id: "t5", name: "Post-stay thank you",  channels: ["email", "whatsapp"],        trigger: "1 day after checkout" },
  { id: "t6", name: "Cancellation notice",  channels: ["sms", "email"],             trigger: "On cancel" },
];

// 7-day occupancy strip (synthetic)
const OCC_STRIP = [
  { d: 0, occ: 0.78 },
  { d: 1, occ: 0.71 },
  { d: 2, occ: 0.86 },
  { d: 3, occ: 0.86 },
  { d: 4, occ: 0.71 },
  { d: 5, occ: 0.43 },
  { d: 6, occ: 0.57 },
];

Object.assign(window, {
  PROPERTIES, ROOM_TYPES, ROOMS, GUESTS, BOOKINGS, ACTIVITY, TEMPLATES, OCC_STRIP,
  DEPARTURES_TODAY_IDS,
  addDays, ymd, shortDate, longDate, inr,
  _today,
});
