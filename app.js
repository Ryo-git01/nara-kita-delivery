/*
検索・候補表示・詳細画面の処理
配送先の追加やメモの修正は delivery-data.js 側で行ってください。
*/
const searchInput = document.getElementById("addressSearch");
const clearButton = document.getElementById("clearSearch");
const suggestions = document.getElementById("suggestions");
const resultCount = document.getElementById("resultCount");
const searchScreen = document.getElementById("searchScreen");
const detailScreen = document.getElementById("detailScreen");
const detailAddress = document.getElementById("detailAddress");
const detailName = document.getElementById("detailName");
const detailMemo = document.getElementById("detailMemo");
const backButton = document.getElementById("backButton");
const totalCount = document.getElementById("totalCount");

const normalize = (value) => String(value || "")
  .normalize("NFKC")
  .replace(/[\s　]/g, "")
  .toLocaleLowerCase("ja");

function renderSuggestions() {
  const query = normalize(searchInput.value);
  clearButton.hidden = !searchInput.value;
  suggestions.replaceChildren();

  if (!query) {
    resultCount.textContent = "住所を入力してください";
    suggestions.append(createMessage("住所の一部を入力すると、該当する候補が最大5件表示されます。"));
    return;
  }

  const matches = deliveryData
    .filter((item) => normalize(item.address).includes(query))
    .sort((a, b) => a.address.localeCompare(b.address, "ja"))
    .slice(0, 5);

  const totalMatches = deliveryData.filter((item) => normalize(item.address).includes(query)).length;
  resultCount.textContent = `${totalMatches}件中 ${matches.length}件を表示`;

  if (matches.length === 0) {
    suggestions.append(createMessage("一致する住所が見つかりませんでした。入力内容を確認してください。"));
    return;
  }

  matches.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";

    const pin = document.createElement("span");
    pin.className = "pin";
    pin.setAttribute("aria-hidden", "true");
    pin.textContent = "⌖";

    const address = document.createElement("span");
    address.className = "suggestion-address";
    address.textContent = item.address;

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";

    button.append(pin, address, chevron);
    button.addEventListener("click", () => showDetails(item));
    suggestions.append(button);
  });
}

function createMessage(message) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

function showDetails(item) {
  detailAddress.textContent = item.address;
  detailName.textContent = item.name || "";
  detailMemo.textContent = item.memo || "";
  searchScreen.hidden = true;
  detailScreen.hidden = false;
  window.scrollTo({ top: 0, behavior: "instant" });
}

function returnToSearch() {
  detailScreen.hidden = true;
  searchScreen.hidden = false;
  searchInput.focus();
}

searchInput.addEventListener("input", renderSuggestions);
clearButton.addEventListener("click", () => {
  searchInput.value = "";
  renderSuggestions();
  searchInput.focus();
});
backButton.addEventListener("click", returnToSearch);
totalCount.textContent = deliveryData.length;
renderSuggestions();
