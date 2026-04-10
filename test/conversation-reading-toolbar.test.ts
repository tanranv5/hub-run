import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConversationReadingToolbar from "../web/components/conversation-reading-toolbar";

test("reading toolbar disables message mode actions while mode switching is in progress", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationReadingToolbar, {
      busy: true,
      fontScale: 3,
      messageViewMode: "compact",
      onDecreaseFontScale: () => {},
      onIncreaseFontScale: () => {},
      onCycleMessageViewMode: () => {},
    }),
  );

  const disabledCount = (markup.match(/disabled=""/g) ?? []).length;
  assert.equal(disabledCount, 3);
});
