const english = [
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

const chinese = [
  [
    "清晨的街道上，面包店刚刚开门。店主把木椅搬到门外，顺手擦掉椅背上的露水。一只花猫趴在窗台上，看着第一个跑过街口的人。",
    "送报的车从路边经过，车铃叮当响了两声。花店门口摆着一排水桶，刚剪下来的枝条还带着水珠。再往前走半条街，就能听见菜市场里此起彼伏的招呼声。",
    "太阳慢慢爬过屋脊，照亮早餐摊上的白汽。有人在等刚出锅的包子，也有人提着空篮子去买菜。巷口的修鞋匠拉开卷帘门，把昨天没修完的鞋摆到了桌上。",
  ],
  [
    "末班车刚驶离站台，小宁便赶到了路口。雨已经停了，她收起伞，沿着屋檐往回走。路边的水洼映着招牌，风一吹，字就散成细细的波纹。",
    "拐角处还有一间书店亮着灯。老板正抱着一箱旧地图往外走，她帮他扶了一会儿门。箱子放稳后，老板挑出一张纸，在街区背面画了一条小路。",
    "她顺着那条小路穿过两排住宅，第一次发现这里有一座低矮的石桥。桥下的水流很轻，过去就是她熟悉的街道。再走几步，楼上的厨房灯也亮了。",
  ],
];

const articles = Object.fromEntries(Object.entries({ en: english, zh: chinese }).map(([language, passages]) => [
  language,
  passages.map((paragraphs) => {
    const lines = paragraphs.map((paragraph) => Array.from(paragraph));
    return { paragraphs: lines, characters: lines.flat() };
  }),
]));

export function articleAt(index, language = "en") {
  const catalog = articles[language];
  return catalog[index % catalog.length];
}
