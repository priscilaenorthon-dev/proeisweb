import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProeisLoginBookmarklet,
  normalizeFunctionalId,
  PROEIS_LOGIN_URL
} from "../src/proeis-login.js";

describe("normalizeFunctionalId", () => {
  it("keeps only digits and requires 8 numeric characters", () => {
    assert.deepEqual(normalizeFunctionalId(" 12345678 "), {
      ok: true,
      value: "12345678"
    });

    assert.deepEqual(normalizeFunctionalId("abc12345678"), {
      ok: true,
      value: "12345678"
    });

    assert.deepEqual(normalizeFunctionalId("123"), {
      ok: false,
      error: "Informe um ID funcional com 8 digitos."
    });
  });
});

describe("buildProeisLoginBookmarklet", () => {
  it("selects ID Funcional, fills txtLogin when present, and posts back when needed", () => {
    const bookmarklet = buildProeisLoginBookmarklet("12345678");
    const decoded = decodeURIComponent(bookmarklet);

    assert.equal(bookmarklet.startsWith("javascript:"), true);
    assert.match(decoded, /ddlTipoAcesso/);
    assert.match(decoded, /txtLogin/);
    assert.match(decoded, /12345678/);
    assert.match(decoded, /__doPostBack\('ddlTipoAcesso',''\)/);
  });

  it("rejects invalid functional IDs", () => {
    assert.throws(
      () => buildProeisLoginBookmarklet("123"),
      /Informe um ID funcional com 8 digitos./
    );
  });
});

describe("PROEIS_LOGIN_URL", () => {
  it("points to the official login page", () => {
    assert.equal(PROEIS_LOGIN_URL, "https://www.proeis.rj.gov.br/Default.aspx");
  });
});
