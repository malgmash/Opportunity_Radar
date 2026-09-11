import type { DraftOpportunity, OpportunitySource } from "./types";

interface CuratedEntry {
  title: string;
  url: string;
  location: string;
  focus: string;
  tags: string[];
  /** Extra page the travel-funding check should read, e.g. a scholarship page. */
  fundingUrl?: string;
}

/**
 * Recurring events the open datasets miss. Dates are deliberately absent: the
 * enrichment pass reads each site and only promotes an entry once it can read a
 * date off the page, so a stale entry degrades into a watchlist item instead of
 * a wrong date.
 */
const REGIONAL_SERIES: CuratedEntry[] = [
  {
    title: "All Things Open",
    url: "https://allthingsopen.org/",
    location: "Raleigh, NC",
    focus: "Open source, software engineering, data and AI tracks",
    tags: ["open source", "software engineering", "data", "student tickets"],
  },
  {
    title: "All Things Open AI",
    url: "https://allthingsopen.ai/",
    location: "Durham, NC",
    focus: "Applied AI and data tooling",
    tags: ["ai", "data", "software engineering"],
  },
  {
    title: "Carolina Code Conference",
    url: "https://carolina.codes/",
    location: "Greenville, SC",
    focus: "Polyglot software engineering",
    tags: ["software engineering", "community"],
  },
  {
    title: "Southeast Linux Fest",
    url: "https://southeastlinuxfest.org/",
    location: "Charlotte, NC",
    focus: "Linux, open source and infrastructure",
    tags: ["open source", "infrastructure"],
  },
  {
    title: "Blue Ridge Ruby",
    url: "https://blueridgeruby.com/",
    location: "Asheville, NC",
    focus: "Ruby and web engineering",
    tags: ["software engineering", "web"],
  },
  {
    title: "DevNexus",
    url: "https://devnexus.com/",
    location: "Atlanta, GA",
    focus: "Java, cloud and platform engineering",
    tags: ["software engineering", "cloud", "java"],
  },
  {
    title: "Render ATL",
    url: "https://www.renderatl.com/",
    location: "Atlanta, GA",
    focus: "Frontend engineering, product and design",
    tags: ["software engineering", "product", "design"],
  },
  {
    title: "DevFest Atlanta",
    url: "https://gdg.community.dev/gdg-atlanta/",
    location: "Atlanta, GA",
    focus: "Google Developer Group conference across web, mobile, cloud and AI",
    tags: ["software engineering", "ai", "community"],
  },
  {
    title: "CackalackyCon",
    url: "https://cackalackycon.org/",
    location: "Raleigh, NC",
    focus: "Security engineering and hardware hacking",
    tags: ["security", "software engineering"],
  },
  {
    title: "BSides Charlotte",
    url: "https://www.bsidescharlotte.org/",
    location: "Charlotte, NC",
    focus: "Community security conference",
    tags: ["security"],
  },
  {
    title: "BSides Augusta",
    url: "https://bsidesaugusta.org/",
    location: "Augusta, GA",
    focus: "Community security conference with a strong student track",
    tags: ["security", "student track"],
  },
  {
    title: "RevolutionConf",
    url: "https://revolutionconf.com/",
    location: "Virginia Beach, VA",
    focus: "Multi-stack software development",
    tags: ["software engineering"],
  },
  {
    title: "RVAJS Conf",
    url: "https://www.rvajs.com/",
    location: "Richmond, VA",
    focus: "JavaScript and web platform",
    tags: ["software engineering", "web"],
  },
  {
    title: "ProductCamp Atlanta",
    url: "https://productcampatlanta.org/",
    location: "Atlanta, GA",
    focus: "Free unconference for product managers",
    tags: ["product management", "free"],
  },
];

/**
 * National events that publish student travel funding. The agent still has to
 * find the evidence on the page before the out-of-region rule lets them through.
 */
const TRAVEL_FUNDED_NATIONAL: CuratedEntry[] = [
  {
    title: "ACM Richard Tapia Celebration of Diversity in Computing",
    url: "https://tapiaconference.cmd-it.org/",
    location: "Rotating, United States",
    focus: "Computing careers conference with a funded student scholarship program",
    tags: ["career fair", "software engineering", "data", "scholarship"],
    fundingUrl: "https://tapiaconference.cmd-it.org/attend/scholarships/",
  },
  {
    title: "Grace Hopper Celebration",
    url: "https://ghc.anitab.org/",
    location: "Rotating, United States",
    focus: "Largest gathering of women in computing, with student scholarships",
    tags: ["career fair", "software engineering", "product", "scholarship"],
    fundingUrl: "https://ghc.anitab.org/attend/scholarships/",
  },
  {
    title: "NSBE Annual Convention",
    url: "https://convention.nsbe.org/",
    location: "Rotating, United States",
    focus: "National Society of Black Engineers career fair and technical sessions",
    tags: ["career fair", "engineering", "scholarship"],
  },
  {
    title: "SHPE National Convention",
    url: "https://shpe.org/engage/convention/",
    location: "Rotating, United States",
    focus: "Society of Hispanic Professional Engineers convention and career fair",
    tags: ["career fair", "engineering", "scholarship"],
  },
  {
    title: "PyCon US",
    url: "https://us.pycon.org/",
    location: "Rotating, United States",
    focus: "Python, data tooling and open source, with need-based financial aid",
    tags: ["python", "data", "open source", "financial aid"],
    fundingUrl: "https://us.pycon.org/2026/attend/financial-aid/",
  },
  {
    title: "SIGCSE Technical Symposium",
    url: "https://sigcse.org/",
    location: "Rotating, United States",
    focus: "Computing education research with travel grants for students",
    tags: ["research", "computer science", "travel grant"],
  },
  {
    title: "KubeCon + CloudNativeCon North America",
    url: "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/",
    location: "Rotating, United States",
    focus: "Cloud native and platform engineering, with diversity scholarships",
    tags: ["cloud", "infrastructure", "scholarship"],
    fundingUrl:
      "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/attend/scholarships/",
  },
  {
    title: "AfroTech Conference",
    url: "https://experience.afrotech.com/",
    location: "Rotating, United States",
    focus: "Tech careers, product and engineering recruiting",
    tags: ["career fair", "product", "software engineering"],
  },
];

const SOURCE = {
  id: "curated",
  name: "Curated regional and travel-funded series",
  url: "https://github.com/tech-conferences/conference-data",
};

function toDraft(entry: CuratedEntry, group: string): DraftOpportunity {
  return {
    kind: "conference",
    title: entry.title,
    url: entry.url,
    locations: [entry.location],
    datesConfirmed: false,
    dateLabel: "Dates not yet confirmed",
    description: entry.focus,
    tags: ["conference", group, ...entry.tags],
    source: {
      ...SOURCE,
      url: entry.fundingUrl ?? entry.url,
    },
  };
}

export function curatedFundingPages(): Record<string, string> {
  const pages: Record<string, string> = {};
  for (const entry of [...REGIONAL_SERIES, ...TRAVEL_FUNDED_NATIONAL]) {
    if (entry.fundingUrl) pages[entry.url] = entry.fundingUrl;
  }
  return pages;
}

export const curatedSource: OpportunitySource = {
  ...SOURCE,
  kinds: ["conference"],
  async collect({ log }) {
    log(
      `${REGIONAL_SERIES.length} in-region series, ${TRAVEL_FUNDED_NATIONAL.length} national series with student funding programs`,
    );
    return [
      ...REGIONAL_SERIES.map((entry) => toDraft(entry, "regional series")),
      ...TRAVEL_FUNDED_NATIONAL.map((entry) => toDraft(entry, "national series")),
    ];
  },
};
