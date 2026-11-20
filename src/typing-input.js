export function connectTypingInput(input, submit, unlockSound) {
  let composing = false;
  let lastCommit;
  let commitTimer;

  function clearCommit() {
    clearTimeout(commitTimer);
    lastCommit = undefined;
  }

  function clear() {
    composing = false;
    input.dataset.composing = "false";
    input.value = "";
    clearCommit();
  }

  input.addEventListener("compositionstart", () => {
    if (input.readOnly) return;
    unlockSound();
    clearCommit();
    composing = true;
    input.dataset.composing = "true";
  });

  input.addEventListener("compositionend", (event) => {
    const commit = composing && !input.readOnly ? event.data : "";
    clear();
    if (!commit) return;
    // Some engines send a final insertText after compositionend for the same commit.
    lastCommit = commit;
    commitTimer = setTimeout(clearCommit, 0);
    submit(commit);
  });

  input.addEventListener("input", (event) => {
    if (composing || event.isComposing) return;
    const value = event.data ?? input.value;
    input.value = "";
    const duplicate = lastCommit === value;
    clearCommit();
    if (input.readOnly || duplicate || event.inputType !== "insertText" || !value) return;
    submit(value);
  });

  input.addEventListener("keydown", () => {
    if (!composing) clearCommit();
  });
  input.addEventListener("paste", (event) => event.preventDefault());
  input.addEventListener("drop", (event) => event.preventDefault());

  return clear;
}
