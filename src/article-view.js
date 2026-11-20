import { articleAt } from "./articles.js";

function makePassage(article) {
  const node = document.createElement("div");
  const letters = [];
  for (const paragraph of article.paragraphs) {
    const line = document.createElement("div");
    const spans = paragraph.map((character) => {
      const span = document.createElement("span");
      span.textContent = character;
      if (character === " ") span.className = "space";
      return span;
    });
    letters.push(...spans);
    line.append(...spans);
    node.append(line);
  }
  return { node, letters };
}

export function createArticleView(viewport, track, instruction) {
  let language;
  let articleIndex = -1;
  let characterIndex = 0;
  let letters;
  let current;

  function align() {
    if (current) viewport.scrollTop = current.offsetTop - letters[0].offsetTop;
  }
  new ResizeObserver(align).observe(viewport);

  return function show(nextArticleIndex, nextCharacterIndex, nextLanguage = "en") {
    if (language !== nextLanguage || articleIndex !== nextArticleIndex) {
      language = nextLanguage;
      articleIndex = nextArticleIndex;
      characterIndex = 0;
      viewport.lang = language === "zh" ? "zh-CN" : "en";
      const passage = makePassage(articleAt(articleIndex, language));
      const preview = makePassage(articleAt(articleIndex + 1, language));
      letters = passage.letters;
      current = undefined;
      track.replaceChildren(passage.node, preview.node);
    }
    if (current && characterIndex === nextCharacterIndex) return;

    current?.classList.remove("current");
    const start = Math.min(characterIndex, nextCharacterIndex);
    const end = Math.max(characterIndex, nextCharacterIndex);
    for (let index = start; index < end; index++) {
      letters[index].classList.toggle("done", index < nextCharacterIndex);
    }
    characterIndex = nextCharacterIndex;
    current = letters[characterIndex];
    current.classList.add("current");
    const character = current.textContent;
    instruction.textContent = `下一个字符是${character === " " ? "空格" : `「${character}」`}。`;
    align();
  };
}
