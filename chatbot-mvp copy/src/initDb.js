require("dotenv").config();
const crypto = require("crypto");
const { db, createSchema } = require("./db");

createSchema();

const count = db.prepare("SELECT COUNT(*) AS count FROM businesses").get().count;
if (count === 0) {
  const widgetId = `wid_${crypto.randomBytes(8).toString("hex")}`;
  const insertBusiness = db.prepare(`
    INSERT INTO businesses (name, slug, widget_id, allowed_domain, tone)
    VALUES (@name, @slug, @widget_id, @allowed_domain, @tone)
  `);

  const business = insertBusiness.run({
    name: "Acme Dental",
    slug: "acme-dental",
    widget_id: widgetId,
    allowed_domain: "https://example.com",
    tone: "warm, professional, and helpful"
  });

  const businessId = business.lastInsertRowid;

  const insertKb = db.prepare(`
    INSERT INTO business_kb_entries (business_id, category, title, content)
    VALUES (@business_id, @category, @title, @content)
  `);

  const entries = [
    ["hours", "Office Hours", "Mon-Fri 9AM-5PM, Sat 10AM-2PM, closed Sunday."],
    ["contact", "Contact", "Phone: (555) 010-2345, Email: hello@acmedental.com"],
    ["services", "Services", "Cleanings, fillings, whitening, emergency visits."],
    ["policies", "Cancellation Policy", "Please provide 24-hour notice for cancellation."]
  ];

  for (const [category, title, content] of entries) {
    insertKb.run({ business_id: businessId, category, title, content });
  }

  db.prepare(`
    INSERT INTO subscriptions (business_id, plan, status)
    VALUES (?, 'starter', 'trialing')
  `).run(businessId);

  console.log("Seeded sample business.");
  console.log(`widget_id: ${widgetId}`);
} else {
  console.log("Database already initialized.");
}
