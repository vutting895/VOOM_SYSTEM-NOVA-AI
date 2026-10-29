import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHAT_HISTORY_CHARACTERS,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_MESSAGE_LENGTH,
  buildBoundedChatHistory,
} from "../frontend/lib/chat-history.mjs";

test("long assistant responses are bounded before reuse as chat context", () => {
  const longAnswer = "A".repeat(10000);
  const previous = [
    { role: "user", content: "first question" },
    { role: "assistant", content: longAnswer },
  ];
  const nextUserMessage = { role: "user", content: "follow-up question" };

  const history = buildBoundedChatHistory(previous, nextUserMessage);

  assert.equal(history.length, 3);
  assert.equal(history[1].content.length, MAX_CHAT_MESSAGE_LENGTH);
  assert.equal(history[1].role, "assistant");
  assert.deepEqual(history[2], nextUserMessage);
  assert.equal(previous[1].content.length, 10000, "visible chat history is not mutated");
});

test("history excludes local-only messages and keeps only the latest eight messages", () => {
  const previous = [
    { role: "assistant", content: "welcome", localOnly: true },
    ...Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message-${i}`,
    })),
  ];
  const history = buildBoundedChatHistory(previous, { role: "user", content: "latest" });

  assert.equal(history.length, MAX_CHAT_HISTORY_MESSAGES);
  assert.equal(history[history.length - 1].content, "latest");
  assert.equal(history.some((item) => item.content === "welcome"), false);
  assert.equal(history.some((item) => item.content === "message-0"), false);
});

test("aggregate history never exceeds the API's 8,000-character cap", () => {
  const previous = Array.from({ length: 7 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: String(i).repeat(MAX_CHAT_MESSAGE_LENGTH),
  }));
  const history = buildBoundedChatHistory(previous, {
    role: "user",
    content: "Z".repeat(MAX_CHAT_MESSAGE_LENGTH),
  });

  assert.ok(history.length <= MAX_CHAT_HISTORY_MESSAGES);
  assert.ok(history.every((item) => item.content.length <= MAX_CHAT_MESSAGE_LENGTH));
  assert.ok(history.reduce((total, item) => total + item.content.length, 0) <= MAX_CHAT_HISTORY_CHARACTERS);
  assert.equal(history[history.length - 1].content, "Z".repeat(MAX_CHAT_MESSAGE_LENGTH));
});

test("invalid or blank messages fail before a chat payload is sent", () => {
  assert.throws(
    () => buildBoundedChatHistory([], { role: "assistant", content: "not a user turn" }),
    /next_user_message_invalid/,
  );
  assert.throws(
    () => buildBoundedChatHistory([{ role: "system", content: "hidden instructions" }], { role: "user", content: "go" }),
    /chat_history_message_invalid/,
  );
});
