const { spawn } = require("child_process");
const https = require("https");

function sanitizeHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function buildEmail({ from, to, subject, text }) {
  const safeFrom = sanitizeHeader(from);
  const safeTo = sanitizeHeader(to);
  const safeSubject = sanitizeHeader(subject);

  return [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text || "",
    ""
  ].join("\n");
}

function sendMailViaSendmail({ from, to, subject, text }) {
  return new Promise((resolve, reject) => {
    const sendmailPath = process.env.SENDMAIL_PATH || "/usr/sbin/sendmail";
    const child = spawn(sendmailPath, ["-t", "-oi"]);

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `sendmail exited with code ${code}`));
      }
    });

    child.stdin.end(buildEmail({ from, to, subject, text }));
  });
}

function sendMailViaResend({ from, to, subject, text }) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      reject(new Error("RESEND_API_KEY is missing"));
      return;
    }

    const payload = JSON.stringify({
      from,
      to: [to],
      subject,
      text
    });

    const req = https.request(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }
          reject(new Error(`Resend failed (${res.statusCode}): ${body}`));
        });
      }
    );

    req.on("error", (error) => reject(error));
    req.end(payload);
  });
}

async function sendHandoffEmail({ from, to, subject, text }) {
  const provider = (process.env.EMAIL_PROVIDER || "sendmail").toLowerCase();
  if (provider === "resend") {
    return sendMailViaResend({ from, to, subject, text });
  }
  return sendMailViaSendmail({ from, to, subject, text });
}

module.exports = { sendHandoffEmail, sendMailViaSendmail };
