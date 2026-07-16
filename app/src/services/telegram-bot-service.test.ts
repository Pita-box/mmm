import { describe, expect, it } from "vitest";
import {
  buildTelegramHelpMessage,
  buildTelegramRequestAck,
  buildTelegramSuggestionAck,
  buildTelegramWelcomeMessage,
  resolveTelegramWebhookReply,
} from "./telegram-bot-service";

describe("telegram bot service", () => {
  it("builds welcome message with first name and group link", () => {
    const text = buildTelegramWelcomeMessage({
      firstName: "Mai",
      groupUrl: "https://t.me/+mmmred",
    });
    expect(text).toContain("Hi Mai");
    expect(text).toContain("Join our private group");
    expect(text).toContain("https://t.me/+mmmred");
  });

  it("builds help message", () => {
    const text = buildTelegramHelpMessage({});
    expect(text).toContain("MMMRED bot help");
    expect(text).toContain("Gallery");
  });

  it("builds suggestion ack", () => {
    const text = buildTelegramSuggestionAck({ firstName: "Mai" });
    expect(text).toContain("Thanks Mai");
    expect(text).toContain("what you want changed");
  });

  it("builds request ack", () => {
    const text = buildTelegramRequestAck({});
    expect(text).toContain("your request was received");
    expect(text).toContain("which model / content");
  });

  it("returns reply for /start in a thread", () => {
    const reply = resolveTelegramWebhookReply(
      {
        message: {
          message_id: 42,
          message_thread_id: 77,
          text: "/start",
          chat: { id: -100123 },
          from: { first_name: "Mai" },
        },
      },
      { groupUrl: "https://t.me/+mmmred" },
    );

    expect(reply).toEqual(
      expect.objectContaining({
        chatId: "-100123",
        threadId: 77,
        replyToMessageId: 42,
      }),
    );
    expect(reply?.text).toContain("Hi Mai");
  });

  it("returns null for unsupported text", () => {
    const reply = resolveTelegramWebhookReply(
      {
        message: {
          message_id: 1,
          text: "hello there",
          chat: { id: 123 },
        },
      },
      {},
    );
    expect(reply).toBeNull();
  });

  it("returns the welcome message for any private-chat text", () => {
    const reply = resolveTelegramWebhookReply(
      {
        message: {
          message_id: 2,
          text: "something else",
          chat: { id: 123, type: "private" },
          from: { first_name: "Mai" },
        },
      },
      { groupUrl: "https://t.me/+mmmred" },
    );

    expect(reply).toEqual(
      expect.objectContaining({
        chatId: "123",
        replyToMessageId: 2,
      }),
    );
    expect(reply?.text).toContain("Hi Mai");
  });

  it("returns suggestion ack for message in suggestions thread", () => {
    const reply = resolveTelegramWebhookReply(
      {
        message: {
          message_id: 9,
          message_thread_id: 333,
          text: "please add stronger search filters",
          chat: { id: -100123 },
          from: { first_name: "Mai" },
        },
      },
      { suggestionsThreadId: "333" },
    );

    expect(reply).toEqual(
      expect.objectContaining({
        chatId: "-100123",
        threadId: 333,
        replyToMessageId: 9,
      }),
    );
    expect(reply?.text).toContain("suggestion was received");
  });

  it("returns request ack for message in request thread", () => {
    const reply = resolveTelegramWebhookReply(
      {
        message: {
          message_id: 10,
          message_thread_id: 444,
          text: "please add more content for this model",
          chat: { id: -100123 },
          from: { first_name: "Mai" },
        },
      },
      { requestThreadId: 444 },
    );

    expect(reply).toEqual(
      expect.objectContaining({
        chatId: "-100123",
        threadId: 444,
        replyToMessageId: 10,
      }),
    );
    expect(reply?.text).toContain("request was received");
  });

  it("ignores bot-authored messages", () => {
    const reply = resolveTelegramWebhookReply(
      {
        message: {
          message_id: 11,
          message_thread_id: 333,
          text: "loop?",
          chat: { id: -100123 },
          from: { is_bot: true, first_name: "MMMRED Bot" },
        },
      },
      { suggestionsThreadId: 333 },
    );
    expect(reply).toBeNull();
  });
});
