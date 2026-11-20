const passages = [
  [
    "At dawn, the street smelled of fresh bread and rain. The shopkeeper swept the steps, the bus driver checked his mirror, and a striped cat watched the first runners from a warm windowsill.",
    "A delivery cyclist rang her bell. 'Take the next left,' she called, pointing past the flower shop. The runner smiled and kept going. He had never noticed how many different shades of green the city could fit into one block.",
    "By the time the sun reached the rooftops, the market was awake. A radio played behind the bakery counter, and someone set two chairs outside the cafe. The runner turned the corner and wondered: what would the next street look like?",
  ],
  [
    "The last bus pulled away just as Nora reached the stop. She glanced at the timetable, folded her umbrella, and decided to walk. There was no hurry; the rain had finally stopped.",
    "In the next street, light spilled out of a tiny bookshop. Its owner was carrying a cardboard box to the door. 'Would you mind holding this for a second?' he asked. Nora put down her umbrella and held the door open.",
    "Inside the box was a stack of old maps. The owner handed her one, marked a shortcut with a pencil, and wished her a good evening. Nora followed the blue line home. She arrived a little late, with a new route and a story to tell.",
  ],
];

const articles = passages.map((paragraphs) => {
  const lines = paragraphs.map((paragraph) => Array.from(paragraph));
  return { paragraphs: lines, characters: lines.flat() };
});

export const articleAt = (index) => articles[index % articles.length];
