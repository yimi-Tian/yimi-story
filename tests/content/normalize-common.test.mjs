import test from "node:test";
import assert from "node:assert/strict";
import { detectDuplicateParagraphs, normalizeList, normalizeSdgs, normalizeText } from "../../tools/content/normalize-common.mjs";

test("SDG 格式正規化並限制 1–17", () => {
  const result = normalizeSdgs(["SDG4", "sdg 4", "18", "SDG 1"]);
  assert.deepEqual(result.values, ["SDG 4", "SDG 1"]);
  assert.deepEqual(result.invalid, ["18"]);
  assert.equal(result.correctionCount, 2);
});

test("tag 與 districts 去空白、去空值、去重並保留首次順序", () => {
  assert.deepEqual(normalizeList(["  木作 ", "", "木作", " 永續 "]), ["木作", "永續"]);
  assert.deepEqual(normalizeList("朴子市、 朴子市、水上鄉", { splitPattern: /[、,，]+/ }), ["朴子市", "水上鄉"]);
});

test("保留正常換行並清除尾端多餘換行", () => {
  assert.equal(normalizeText(" 第一行  \r\n第二行\r\n\r\n"), "第一行\n第二行");
});

test("偵測完整重複段落", () => {
  assert.deepEqual(detectDuplicateParagraphs("第一段。\n\n第二段。\n\n第一段。"), ["第一段。"]);
});
