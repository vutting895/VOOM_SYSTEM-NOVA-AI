export const MAX_CHAT_HISTORY_MESSAGES = 8;
export const MAX_CHAT_MESSAGE_LENGTH = 1200;
export const MAX_CHAT_HISTORY_CHARACTERS = 8000;

/**
 * Build a bounded payload for the existing chat endpoint.
 * Long assistant replies remain visible in the UI but are truncated in the
 * next request's context so they cannot poison subsequent turns.
 */
export function buildBoundedChatHistory(previousMessages, nextUserMessage) {
  if (!Array.isArray(previousMessages)) {
    throw new TypeError("chat_history_must_be_an_array");
  }
  if (
    !nextUserMessage ||
    nextUserMessage.role !== "user" ||
    typeof nextUserMessage.content !== "string" ||
    !nextUserMessage.content.trim()
  ) {
    throw new TypeError("next_user_message_invalid");
  }

  const entries = [
    ...previousMessages.filter((message) => message && message.localOnly !== true),
    nextUserMessage,
  ].slice(-MAX_CHAT_HISTORY_MESSAGES);

  const normalized = entries.map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim()
    ) {
      throw new TypeError("chat_history_message_invalid");
    }
    return {
      role: message.role,
      content: message.content.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH),
    };
  });

  // Preserve the newest context first, especially the current user query.
  // If the aggregate cap is reached mid-message, keep that bounded prefix and
  // drop older context rather than sending a payload that the API will reject.
  const selectedNewestFirst = [];
  let totalCharacters = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const remaining = MAX_CHAT_HISTORY_CHARACTERS - totalCharacters;
    if (remaining <= 0) break;

    const message = normalized[index];
    const boundedContent = message.content.slice(
      0,
      Math.min(MAX_CHAT_MESSAGE_LENGTH, remaining),
    );
    selectedNewestFirst.push({ role: message.role, content: boundedContent });
    totalCharacters += boundedContent.length;

    if (boundedContent.length < message.content.length) break;
  }

  return selectedNewestFirst.reverse();
}
