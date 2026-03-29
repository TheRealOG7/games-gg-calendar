export type EventType = "convention" | "showcase" | "awards" | "sale";

export interface GamingEvent {
  id: string;
  name: string;
  type: EventType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  location?: string;
  description: string;
  url?: string;
  color: string;
}

export const GAMING_EVENTS: GamingEvent[] = [
  // 2025
  {
    id: "gdc-2025",
    name: "GDC 2025",
    type: "convention",
    startDate: "2025-03-17",
    endDate: "2025-03-21",
    location: "San Francisco, CA",
    description: "Game Developers Conference, the world's largest professional game industry event, featuring sessions, summits, and the Independent Games Festival.",
    url: "https://gdconf.com",
    color: "#4f9cf9",
  },
  {
    id: "pax-east-2025",
    name: "PAX East 2025",
    type: "convention",
    startDate: "2025-05-22",
    endDate: "2025-05-25",
    location: "Boston, MA",
    description: "One of the largest gaming conventions in the Eastern United States, bringing together gamers, developers, and publishers.",
    url: "https://east.paxsite.com",
    color: "#4f9cf9",
  },
  {
    id: "summer-game-fest-2025",
    name: "Summer Game Fest 2025",
    type: "showcase",
    startDate: "2025-06-06",
    endDate: "2025-06-09",
    location: "Los Angeles, CA",
    description: "Geoff Keighley's multi-day showcase event featuring world premieres, demos, and announcements from major publishers and indie studios.",
    url: "https://www.summergamefest.com",
    color: "#b06ff5",
  },
  {
    id: "xbox-showcase-2025",
    name: "Xbox Games Showcase 2025",
    type: "showcase",
    startDate: "2025-06-08",
    endDate: "2025-06-08",
    description: "Microsoft's annual showcase revealing upcoming Xbox and PC games, Game Pass additions, and hardware announcements.",
    color: "#5dc75d",
  },
  {
    id: "sdcc-2025",
    name: "San Diego Comic-Con 2025",
    type: "convention",
    startDate: "2025-07-24",
    endDate: "2025-07-27",
    location: "San Diego, CA",
    description: "The iconic pop culture convention featuring major gaming announcements, panels, and exclusive reveals alongside comics, film, and TV.",
    url: "https://www.comic-con.org",
    color: "#f5a623",
  },
  {
    id: "gamescom-2025",
    name: "Gamescom 2025",
    type: "convention",
    startDate: "2025-08-20",
    endDate: "2025-08-24",
    location: "Cologne, Germany",
    description: "The world's largest gaming trade fair with Gamescom Opening Night Live, developer showcases, and public expo floors.",
    url: "https://www.gamescom.global",
    color: "#4f9cf9",
  },
  {
    id: "pax-west-2025",
    name: "PAX West 2025",
    type: "convention",
    startDate: "2025-08-29",
    endDate: "2025-09-01",
    location: "Seattle, WA",
    description: "Four days of games, panels, tournaments, and community events on the Pacific Coast.",
    url: "https://west.paxsite.com",
    color: "#4f9cf9",
  },
  {
    id: "tokyo-game-show-2025",
    name: "Tokyo Game Show 2025",
    type: "convention",
    startDate: "2025-09-25",
    endDate: "2025-09-28",
    location: "Chiba, Japan",
    description: "Japan's premier gaming expo where major publishers reveal upcoming titles, with both online and in-person components.",
    url: "https://tgs.cesa.or.jp/english",
    color: "#f5a623",
  },
  {
    id: "pax-aus-2025",
    name: "PAX Aus 2025",
    type: "convention",
    startDate: "2025-10-31",
    endDate: "2025-11-02",
    location: "Melbourne, Australia",
    description: "Australia's biggest gaming convention with three days of gaming, esports, tabletop, and developer panels.",
    url: "https://aus.paxsite.com",
    color: "#4f9cf9",
  },
  {
    id: "the-game-awards-2025",
    name: "The Game Awards 2025",
    type: "awards",
    startDate: "2025-12-11",
    endDate: "2025-12-11",
    location: "Los Angeles, CA",
    description: "The gaming industry's biggest night, celebrating the best games of the year with world premiere announcements and live performances.",
    url: "https://thegameawards.com",
    color: "#f5c842",
  },

  // 2026
  {
    id: "gdc-2026",
    name: "GDC 2026",
    type: "convention",
    startDate: "2026-03-16",
    endDate: "2026-03-20",
    location: "San Francisco, CA",
    description: "Game Developers Conference 2026, the professional game industry event featuring sessions, summits, and the Independent Games Festival.",
    url: "https://gdconf.com",
    color: "#4f9cf9",
  },
  {
    id: "pax-east-2026",
    name: "PAX East 2026",
    type: "convention",
    startDate: "2026-03-26",
    endDate: "2026-03-29",
    location: "Boston, MA",
    description: "One of the largest gaming conventions in the Eastern US, four days of games, panels, tournaments, and developer showcases.",
    url: "https://east.paxsite.com",
    color: "#4f9cf9",
  },
  {
    id: "summer-game-fest-2026",
    name: "Summer Game Fest 2026",
    type: "showcase",
    startDate: "2026-06-05",
    endDate: "2026-06-08",
    location: "Los Angeles, CA",
    description: "Multi-day showcase event featuring world premiere announcements and demos from across the industry.",
    url: "https://www.summergamefest.com",
    color: "#b06ff5",
  },
  {
    id: "sdcc-2026",
    name: "San Diego Comic-Con 2026",
    type: "convention",
    startDate: "2026-07-23",
    endDate: "2026-07-26",
    location: "San Diego, CA",
    description: "Pop culture's biggest annual gathering with major gaming panels and exclusive reveals alongside comics, film, and TV.",
    url: "https://www.comic-con.org",
    color: "#f5a623",
  },
  {
    id: "gamescom-2026",
    name: "Gamescom 2026",
    type: "convention",
    startDate: "2026-08-26",
    endDate: "2026-08-30",
    location: "Cologne, Germany",
    description: "The world's largest gaming trade fair returns to Cologne with Opening Night Live and expo floors spanning major publishers.",
    url: "https://www.gamescom.global",
    color: "#4f9cf9",
  },
  {
    id: "the-game-awards-2026",
    name: "The Game Awards 2026",
    type: "awards",
    startDate: "2026-12-10",
    endDate: "2026-12-10",
    location: "Los Angeles, CA",
    description: "The gaming industry's biggest night, celebrating the best games of the year.",
    url: "https://thegameawards.com",
    color: "#f5c842",
  },
];

export function getEventsForDate(dateStr: string): GamingEvent[] {
  const date = new Date(dateStr + "T12:00:00");
  return GAMING_EVENTS.filter((e) => {
    const start = new Date(e.startDate + "T12:00:00");
    const end = new Date(e.endDate + "T12:00:00");
    return date >= start && date <= end;
  });
}
