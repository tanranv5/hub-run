import assert from "node:assert/strict";
import test from "node:test";
import { findPastedImageFile, shouldSubmitOnEnter } from "../web/conversation-composer-helpers";

test("shouldSubmitOnEnter submits only for plain enter without shift or composition", () => {
  assert.equal(shouldSubmitOnEnter({ key: "Enter", shiftKey: false, isComposing: false }), true);
  assert.equal(shouldSubmitOnEnter({ key: "Enter", shiftKey: true, isComposing: false }), false);
  assert.equal(shouldSubmitOnEnter({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(shouldSubmitOnEnter({ key: "a", shiftKey: false, isComposing: false }), false);
});

test("findPastedImageFile returns the first pasted image file item", () => {
  const imageFile = { name: "shot.png", type: "image/png" } as File;
  const items = [
    { kind: "string", type: "text/plain", getAsFile: () => null },
    { kind: "file", type: "image/png", getAsFile: () => imageFile },
  ];

  assert.equal(findPastedImageFile(items), imageFile);
});

test("findPastedImageFile ignores non-image clipboard files", () => {
  const pdfFile = { name: "doc.pdf", type: "application/pdf" } as File;
  const items = [
    { kind: "file", type: "application/pdf", getAsFile: () => pdfFile },
  ];

  assert.equal(findPastedImageFile(items), null);
});

test("findPastedImageFile falls back to file mime type when clipboard item type is empty", () => {
  const imageFile = { name: "photo.jpg", type: "image/jpeg" } as File;
  const items = [
    { kind: "file", type: "", getAsFile: () => imageFile },
  ];

  assert.equal(findPastedImageFile(items), imageFile);
});
