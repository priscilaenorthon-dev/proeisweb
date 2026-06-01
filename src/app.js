import {
  buildProeisLoginBookmarklet,
  normalizeFunctionalId
} from "./proeis-login.js";

const input = document.querySelector("#functional-id");
const bookmarklet = document.querySelector("#bookmarklet");
const errorMessage = document.querySelector("#error-message");

function setBookmarkletState() {
  const normalized = normalizeFunctionalId(input.value);

  if (!input.value) {
    bookmarklet.href = "#";
    bookmarklet.classList.add("disabled");
    errorMessage.hidden = true;
    errorMessage.textContent = "";
    return;
  }

  if (!normalized.ok) {
    bookmarklet.href = "#";
    bookmarklet.classList.add("disabled");
    errorMessage.hidden = false;
    errorMessage.textContent = normalized.error;
    return;
  }

  bookmarklet.href = buildProeisLoginBookmarklet(normalized.value);
  bookmarklet.classList.remove("disabled");
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}

bookmarklet.addEventListener("click", (event) => {
  if (bookmarklet.classList.contains("disabled")) {
    event.preventDefault();
  }
});

input.addEventListener("input", setBookmarkletState);
setBookmarkletState();
