const express = require("express");
const OpenAI = require("openai");
const { z } = require("zod");
const { db } = require("../db");
const { buildSystemPrompt } = require("../prompt");
const { getOrigin, isAllowedOrigin } = require("../auth");
const { sendHandoffEmail } = require("../email");

const router = express.Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const HUMAN_REQUEST_PATTERNS = [
  /\b(real|actual)\s+(person|human)\b/i,
  /\bhuman\s+(agent|support|representative)\b/i,
  /\blive\s+(agent|person|support)\b/i,
  /\bspeak\s+to\s+someone\b/i,
  /\bspeak\s+to\s+somebody\b/i,
  /\btalk\s+to\s+someone\b/i,
  /\btalk\s+to\s+somebody\b/i,
  /\bconnect\s+me\s+to\s+support\b/i,
  /\btransfer\s+me\s+to\s+(support|a\s+person|a\s+human|an\s+agent)\b/i,
  /\btalk\s+to\s+(a\s+)?(person|human|agent|representative)\b/i,
  /\bspeak\s+to\s+(a\s+)?(person|human|agent|representative)\b/i,
  /\bconnect\s+me\s+to\s+(a\s+)?(person|human|agent|representative)\b/i
];

const CONTACT_REQUEST_PROMPT =
  "I couldn't fully solve that here. Please share the best phone number or email, and I'll have a real person follow up.";
const CONTACT_INVALID_PROMPT =
  "Please send a valid phone number or email so our team can contact you.";
const ISSUE_REQUEST_PROMPT =
  "I can help with that. Before I connect you to a real person, please tell me what you need help with so I can try to solve it now.";
const UNSOLVED_PATTERNS = [
  /not sure/i,
  /do not have enough information/i,
  /don't have enough information/i,
  /cannot answer/i,
  /can't answer/i,
  /not in (the )?context/i,
  /i do not know/i,
  /i don't know/i,
  /unable to/i
];

function userRequestedHuman(message) {
  if (HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }

  const normalized = String(message || "").toLowerCase();
  const hasHumanTarget = /\b(human|person|agent|representative|support|someone|somebody)\b/.test(normalized);
  const hasEscalationIntent =
    /\b(talk|speak|connect|transfer|escalat(e|ion)|real|live|reach|contact)\b/.test(normalized);
  return hasHumanTarget && hasEscalationIntent;
}

function extractContactDetails(message) {
  const text = String(message || "");
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    return { type: "email", value: emailMatch[0] };
  }

  // Accept common NA/international phone formats.
  const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      return { type: "phone", value: phoneMatch[0].trim() };
    }
  }

  return null;
}

function isAwaitingContact(previousTurns) {
  if (!previousTurns.length) return false;
  const lastAssistant = previousTurns[previousTurns.length - 1]?.assistant_message || "";
  return lastAssistant === CONTACT_REQUEST_PROMPT || lastAssistant === CONTACT_INVALID_PROMPT;
}

function isAwaitingIssue(previousTurns) {
  if (!previousTurns.length) return false;
  const lastAssistant = previousTurns[previousTurns.length - 1]?.assistant_message || "";
  return lastAssistant === ISSUE_REQUEST_PROMPT;
}

function findLatestHumanRequest(previousTurns) {
  for (let i = previousTurns.length - 1; i >= 0; i -= 1) {
    const candidate = previousTurns[i]?.user_message || "";
    if (userRequestedHuman(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findLatestEscalationIssue(previousTurns) {
  for (let i = previousTurns.length - 1; i >= 0; i -= 1) {
    if (previousTurns[i]?.assistant_message === CONTACT_REQUEST_PROMPT) {
      return previousTurns[i]?.user_message || null;
    }
  }
  return findLatestHumanRequest(previousTurns);
}

function answerNeedsHandoff(answer) {
  const text = String(answer || "");
  return UNSOLVED_PATTERNS.some((pattern) => pattern.test(text));
}

async function generateAssistantAnswer({
  businessName,
  tone,
  kbEntries,
  previousTurns,
  userMessage
}) {
  const systemPrompt = buildSystemPrompt({
    businessName,
    tone,
    kbEntries,
    hasHistory: previousTurns.length > 0
  });

  const historyMessages = previousTurns.flatMap((turn) => [
    { role: "user", content: turn.user_message },
    { role: "assistant", content: turn.assistant_message }
  ]);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userMessage }
    ]
  });

  return response.choices?.[0]?.message?.content?.trim() || "I do not have enough information to answer that.";
}

async function summarizeInquiry({ businessName, userMessage, previousTurns }) {
  const transcript = previousTurns
    .map(
      (turn) =>
        `User: ${turn.user_message}\nAssistant: ${turn.assistant_message}`
    )
    .join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Summarize customer support inquiries for a human team. Keep it short, clear, and actionable."
        },
        {
          role: "user",
          content: [
            `Business: ${businessName}`,
            transcript ? `Conversation so far:\n${transcript}` : "Conversation so far: none",
            `Latest user message: ${userMessage}`,
            "",
            "Return plain text with these headings:",
            "Issue:",
            "What customer asked for:",
            "Key context:",
            "Urgency:"
          ].join("\n")
        }
      ]
    });

    return (
      response.choices?.[0]?.message?.content?.trim() ||
      `Issue: Customer requested a real person.\nWhat customer asked for: ${userMessage}\nKey context: No additional context.\nUrgency: Unknown.`
    );
  } catch (error) {
    return `Issue: Customer requested a real person.\nWhat customer asked for: ${userMessage}\nKey context: Summary generation failed (${error.message}).\nUrgency: Unknown.`;
  }
}

router.get("/widget/:widgetId/config", (req, res) => {
  const { widgetId } = req.params;
  const business = db
    .prepare(
      `SELECT widget_id, name, brand_primary_color, brand_text_color
       FROM businesses
       WHERE widget_id = ?`
    )
    .get(widgetId);

  if (!business) return res.status(404).json({ error: "Widget not found" });

  res.json({
    widgetId: business.widget_id,
    businessName: business.name,
    theme: {
      primaryColor: business.brand_primary_color,
      textColor: business.brand_text_color
    }
  });
});

const chatSchema = z.object({
  widgetId: z.string().min(4),
  message: z.string().min(1).max(2000),
  sessionId: z.string().min(4).max(100)
});

router.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { widgetId, message, sessionId } = parsed.data;

  const business = db
    .prepare(
      `SELECT id, name, allowed_domain, tone, handoff_email
       FROM businesses
       WHERE widget_id = ?`
    )
    .get(widgetId);

  if (!business) {
    return res.status(404).json({ error: "Business not found" });
  }

  const origin = getOrigin(req);
  if (!isAllowedOrigin(origin, business.allowed_domain)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  const kbEntries = db
    .prepare(
      `SELECT category, title, content
       FROM business_kb_entries
       WHERE business_id = ?
       ORDER BY id DESC
       LIMIT 60`
    )
    .all(business.id);

  const previousTurns = db
    .prepare(
      `SELECT user_message, assistant_message
       FROM chat_logs
       WHERE business_id = ? AND session_id = ?
       ORDER BY id DESC
       LIMIT 8`
    )
    .all(business.id, sessionId)
    .reverse();

  if (isAwaitingContact(previousTurns)) {
    const contact = extractContactDetails(message);
    if (!contact) {
      db.prepare(
        `INSERT INTO chat_logs (business_id, session_id, user_message, assistant_message)
         VALUES (?, ?, ?, ?)`
      ).run(business.id, sessionId, message, CONTACT_INVALID_PROMPT);
      return res.json({ answer: CONTACT_INVALID_PROMPT });
    }

    let answer = business.handoff_email
      ? "Thanks. I sent your details to our support team, and a real person will follow up soon."
      : "Thanks. Live human handoff is not configured for this business yet.";

    if (business.handoff_email) {
      const inquiryMessage = findLatestEscalationIssue(previousTurns) || "Customer requested a real person.";
      const inquirySummary = await summarizeInquiry({
        businessName: business.name,
        userMessage: inquiryMessage,
        previousTurns
      });
      const nowIso = new Date().toISOString();
      const emailBody = [
        `Business: ${business.name}`,
        `Widget ID: ${widgetId}`,
        `Session ID: ${sessionId}`,
        `Requested at: ${nowIso}`,
        `Customer contact (${contact.type}): ${contact.value}`,
        "",
        inquirySummary,
        "",
        "Recent transcript:",
        ...previousTurns.flatMap((turn) => [
          `User: ${turn.user_message}`,
          `Assistant: ${turn.assistant_message}`
        ]),
        `User: ${message}`
      ].join("\n");

      try {
        await sendHandoffEmail({
          from: process.env.HANDOFF_FROM_EMAIL || "no-reply@atlaschat.local",
          to: business.handoff_email,
          subject: `[${business.name}] Human handoff request (${sessionId})`,
          text: emailBody
        });
      } catch (error) {
        console.error("Handoff email failed:", error.message);
        answer = "I couldn't reach the support inbox right now. Please try again in a moment.";
      }
    }

    db.prepare(
      `INSERT INTO chat_logs (business_id, session_id, user_message, assistant_message)
       VALUES (?, ?, ?, ?)`
    ).run(business.id, sessionId, message, answer);

    return res.json({ answer });
  }

  if (isAwaitingIssue(previousTurns)) {
    let attempt = "I do not have enough information to answer that.";
    try {
      attempt = await generateAssistantAnswer({
        businessName: business.name,
        tone: business.tone,
        kbEntries,
        previousTurns,
        userMessage: message
      });
    } catch (error) {
      console.error("Issue-attempt generation failed:", error.message);
    }

    const answer = answerNeedsHandoff(attempt) ? CONTACT_REQUEST_PROMPT : attempt;
    db.prepare(
      `INSERT INTO chat_logs (business_id, session_id, user_message, assistant_message)
       VALUES (?, ?, ?, ?)`
    ).run(business.id, sessionId, message, answer);

    return res.json({ answer });
  }

  if (userRequestedHuman(message)) {
    db.prepare(
      `INSERT INTO chat_logs (business_id, session_id, user_message, assistant_message)
       VALUES (?, ?, ?, ?)`
    ).run(business.id, sessionId, message, ISSUE_REQUEST_PROMPT);

    return res.json({ answer: ISSUE_REQUEST_PROMPT });
  }

  try {
    const answer = await generateAssistantAnswer({
      businessName: business.name,
      tone: business.tone,
      kbEntries,
      previousTurns,
      userMessage: message
    });

    db.prepare(
      `INSERT INTO chat_logs (business_id, session_id, user_message, assistant_message)
       VALUES (?, ?, ?, ?)`
    ).run(business.id, sessionId, message, answer);

    return res.json({ answer });
  } catch (error) {
    return res.status(500).json({
      error: "Chat generation failed",
      details: error.message
    });
  }
});

module.exports = router;
