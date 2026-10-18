(() => {
  "use strict";

  const STORAGE_KEY = "deliveryMemoApp.records.v2";
  const $ = (id) => document.getElementById(id);

  const searchScreen = $("searchScreen");
  const detailScreen = $("detailScreen");
  const importScreen = $("importScreen");
  const searchInput = $("searchInput");
  const suggestions = $("suggestions");
  const resultCount = $("resultCount");
  const totalCount = $("totalCount");
  const importText = $("importText");
  const analysisPanel = $("analysisPanel");
  const reviewPanel = $("reviewPanel");
  const errorMessages = $("errorMessages");
  const importStatus = $("importStatus");

  let records = loadRecords();
  let parsedRecords = [];
  let parsedErrors = [];
  let reviewPlan = [];

  function loadRecords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const data = JSON.parse(saved);
      if (!Array.isArray(data)) return [];
      return data.filter((item) =>
        item && typeof item.name === "string" &&
        typeof item.address === "string" &&
        typeof item.memo === "string"
      );
    } catch (error) {
      return [];
    }
  }

  function saveRecords(nextRecords) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
      records = nextRecords;
      updateTotalCount();
      return true;
    } catch (error) {
      setStatus("保存できませんでした。ブラウザの空き容量や設定を確認してください。", true);
      return false;
    }
  }

  function updateTotalCount() {
    totalCount.textContent = String(records.length);
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[ 　\t\r\n]/g, "")
      .toLocaleLowerCase("ja");
  }

  function showScreen(name) {
    searchScreen.hidden = name !== "search";
    detailScreen.hidden = name !== "detail";
    importScreen.hidden = name !== "import";
    $("openImportButton").hidden = name !== "search";
    if (name === "search") renderSearch();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderSearch() {
    updateTotalCount();
    const query = normalize(searchInput.value);
    $("clearSearch").hidden = !searchInput.value;
    suggestions.replaceChildren();

    // 検索欄が空のときは、検索結果・件数ともに表示しない。
    if (!query) {
      resultCount.textContent = "";
      return;
    }

    const found = records
      .filter((item) =>
        normalize(item.name).includes(query) ||
        normalize(item.address).includes(query) ||
        normalize(item.memo).includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));

    const shown = found.slice(0, 7);
    resultCount.textContent = found.length > 7
      ? `${found.length}件（先頭7件を表示）`
      : `${found.length}件`;

    if (!records.length) {
      suggestions.append(makeEmpty("まだ配送先データがありません。「データ取り込み」から登録してください。"));
      return;
    }
    if (!shown.length) {
      suggestions.append(makeEmpty("一致する配送先がありません。別の名前や住所で検索してください。"));
      return;
    }

    shown.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion";
      const name = document.createElement("span");
      name.className = "suggestion-name";
      name.textContent = item.name;
      const address = document.createElement("span");
      address.className = "suggestion-address";
      address.textContent = item.address;
      button.append(name, address);
      button.addEventListener("click", () => showDetail(item));
      suggestions.append(button);
    });
  }

  function makeEmpty(message) {
    const node = document.createElement("div");
    node.className = "empty-state";
    node.textContent = message;
    return node;
  }

  function showDetail(item) {
    $("detailName").textContent = item.name;
    $("detailAddress").textContent = item.address;
    $("detailMemo").textContent = item.memo || "メモなし";
    showScreen("detail");
  }

  /*
   * 取り込みデータ形式（保守時もこのルールを維持すること）:
   * 1. 1配送先につき「名前：」「住所：」「メモ：」の3項目をこの順番で記述する。
   * 2. 配送先レコードの区切りは、レコード間の空行（空白だけの行も可）。
   * 3. 「名前：」という文字列を検索してレコードを分割してはいけない。
   *    メモ本文に「名前：」が含まれていても、空行がなければ同じレコードの一部。
   * 4. 各レコード内のフィールドは1行ずつ。メモの複数行は許可し、次の空行までをメモとして保持する。
   * 5. 名前欄は空欄でもよい（「名前：」の見出し自体は必須）。住所・メモの欠落、順番違い、重複フィールドはエラー。
   * 6. 取り込み解析だけでは保存しない。利用者が確認して確定した後に保存する。
   */
  function parseImportText(text) {
    const errors = [];
    const parsed = [];
    const blocks = String(text || "").trim()
      .split(/\n[ \t　]*\n+/)
      .map((block) => block.trim())
      .filter(Boolean);

    if (!blocks.length) {
      return { parsed, errors: ["取り込むデータが入力されていません。"] };
    }

    blocks.forEach((block, index) => {
      const lines = block.replace(/\r/g, "").split("\n");
      const item = { name: "", address: "", memo: "" };
      let currentField = "";
      let invalid = false;
      const seen = new Set();

      lines.forEach((rawLine) => {
        const line = rawLine.trim();
        const match = line.match(/^(名前|住所|メモ)[：:]\s*(.*)$/);
        if (match) {
          const key = match[1];
          const value = match[2].trim();
          if (seen.has(key)) {
            errors.push(`${index + 1}件目：${key}フィールドが重複しています。`);
            invalid = true;
            return;
          }
          const order = { 名前: 1, 住所: 2, メモ: 3 };
          const expectedNext = seen.size + 1;
          if (order[key] !== expectedNext) {
            errors.push(`${index + 1}件目：名前 → 住所 → メモの順番で記述してください。`);
            invalid = true;
          }
          seen.add(key);
          currentField = key;
          if (key === "名前") item.name = value;
          if (key === "住所") item.address = value;
          if (key === "メモ") item.memo = value;
        } else if (currentField === "メモ") {
          item.memo += (item.memo ? "\n" : "") + rawLine;
        } else if (line) {
          errors.push(`${index + 1}件目：項目名のない行があります。`);
          invalid = true;
        }
      });

      if (!seen.has("名前")) {
        errors.push(`${index + 1}件目：「名前：」の項目がありません。名前が不明な場合も「名前：」の行は残してください。`);
        invalid = true;
      }
      if (!seen.has("住所") || !item.address) {
        errors.push(`${index + 1}件目：住所がありません。`);
        invalid = true;
      }
      if (!seen.has("メモ")) {
        errors.push(`${index + 1}件目：メモ欄がありません。「メモ：メモなし」などを指定してください。`);
        invalid = true;
      }
      if (!invalid) parsed.push({
        name: item.name.trim(),
        address: item.address.trim(),
        memo: item.memo.trim() || "メモなし"
      });
    });

    return { parsed, errors };
  }

  function clearPanels() {
    analysisPanel.hidden = true;
    reviewPanel.hidden = true;
    errorMessages.hidden = true;
    errorMessages.textContent = "";
    $("duplicateNotice").hidden = true;
    $("duplicateNotice").textContent = "";
    setStatus("");
  }

  function setStatus(message, isError = false) {
    importStatus.textContent = message;
    importStatus.classList.toggle("error", isError);
  }

  function analyzeImport() {
    clearPanels();
    const result = parseImportText(importText.value);
    parsedRecords = result.parsed;
    parsedErrors = result.errors;

    $("targetCount").textContent = String(parsedRecords.length);
    $("errorCount").textContent = String(parsedErrors.length);
    analysisPanel.hidden = false;

    if (parsedErrors.length) {
      errorMessages.hidden = false;
      errorMessages.textContent = parsedErrors.join("\n");
    }
    if (!parsedRecords.length) {
      $("continueImportButton").disabled = true;
      $("continueImportButton").textContent = "取り込めるデータがありません";
      return;
    }
    $("continueImportButton").disabled = false;
    $("continueImportButton").textContent = "この内容で次へ";
  }

  function getMatches(item) {
    const nameKey = normalize(item.name);
    const addressKey = normalize(item.address);
    return records
      .map((existing, index) => ({ existing, index }))
      .filter(({ existing }) =>
        normalize(existing.name) === nameKey ||
        normalize(existing.address) === addressKey
      );
  }

  function makeReviewItem(item, index) {
    const matches = getMatches(item);
    const wrapper = document.createElement("div");
    wrapper.className = "review-item";
    const heading = document.createElement("h4");
    heading.textContent = `${index + 1}. ${item.name}`;
    const address = document.createElement("p");
    address.textContent = `住所：${item.address}`;
    const memo = document.createElement("p");
    memo.textContent = `メモ：${item.memo}`;
    wrapper.append(heading, address, memo);

    const selectName = `action-${index}`;
    const choices = [];
    if (!matches.length) {
      choices.push({ value: "add", label: "新しい配送先として追加" });
    } else {
      matches.forEach(({ existing, index: existingIndex }, matchIndex) => {
        const existingBox = document.createElement("div");
        existingBox.className = "existing";
        existingBox.textContent = `一致候補${matchIndex + 1}\n名前：${existing.name}\n住所：${existing.address}\nメモ：${existing.memo}`;
        wrapper.append(existingBox);
        choices.push({ value: `update:${existingIndex}`, label: `この既存データを更新（候補${matchIndex + 1}）` });
      });
      choices.push({ value: "add", label: "別の配送先として追加" });
      choices.push({ value: "skip", label: "取り込まない" });
    }

    const group = document.createElement("div");
    choices.forEach((choice, choiceIndex) => {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = selectName;
      radio.value = choice.value;
      radio.checked = choiceIndex === 0;
      label.append(radio, document.createTextNode(choice.label));
      group.append(label);
    });
    wrapper.append(group);
    return { wrapper, getChoice: () => {
      const selected = group.querySelector(`input[name="${selectName}"]:checked`);
      return selected ? selected.value : "";
    }, item, matches };
  }

  function buildReview() {
    reviewPanel.hidden = false;
    analysisPanel.hidden = true;
    $("reviewItems").replaceChildren();
    reviewPlan = parsedRecords.map((item, index) => {
      const review = makeReviewItem(item, index);
      $("reviewItems").append(review.wrapper);
      return review;
    });
    setStatus("");
    reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function commitImport() {
    const next = records.slice();
    const updates = [];
    const additions = [];
    let skipped = 0;

    reviewPlan.forEach((review) => {
      const choice = review.getChoice();
      if (choice === "skip") {
        skipped += 1;
      } else if (choice === "add") {
        additions.push(review.item);
      } else if (choice.startsWith("update:")) {
        updates.push({ index: Number(choice.split(":")[1]), item: review.item });
      } else {
        skipped += 1;
      }
    });

    // 同じ既存レコードを複数の取り込み項目が更新しないよう、後続の重複更新は確認エラーにする。
    const updateIndexes = updates.map((entry) => entry.index);
    if (new Set(updateIndexes).size !== updateIndexes.length) {
      setStatus("同じ既存データを複数回更新しようとしています。各項目の更新先を選び直してください。", true);
      return;
    }

    updates.forEach(({ index, item }) => { next[index] = item; });
    additions.forEach((item) => next.push(item));

    if (!saveRecords(next)) return;
    const summary = `保存しました。\n新規追加：${additions.length}件\n更新：${updates.length}件\n取り込まない：${skipped}件\n登録合計：${records.length}件`;
    clearPanels();
    importText.value = "";
    setStatus(summary);
    searchInput.value = "";
    renderSearch();
    // 保存結果を読めるよう取り込み画面に残す。検索画面へ戻るボタンで戻れる。
  }

  $("clearSearch").addEventListener("click", () => {
    searchInput.value = "";
    renderSearch();
    searchInput.focus();
  });
  searchInput.addEventListener("input", renderSearch);
  $("backButton").addEventListener("click", () => showScreen("search"));
  $("openImportButton").addEventListener("click", () => {
    clearPanels();
    importText.value = "";
    setStatus("");
    showScreen("import");
  });
  $("importBackButton").addEventListener("click", () => showScreen("search"));
  $("analyzeButton").addEventListener("click", analyzeImport);
  $("clearImportButton").addEventListener("click", () => {
    importText.value = "";
    clearPanels();
    importText.focus();
  });
  $("continueImportButton").addEventListener("click", buildReview);
  $("commitImportButton").addEventListener("click", commitImport);

  updateTotalCount();
  renderSearch();
})(); 
