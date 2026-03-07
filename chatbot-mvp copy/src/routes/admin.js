const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const { db } = require("../db");
const { requireAdminApiKey } = require("../auth");

const router = express.Router();
router.use(requireAdminApiKey);

const createBusinessSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  allowedDomain: z.string().url(),
  handoffEmail: z.union([z.string().email(), z.literal("")]).optional(),
  tone: z.string().min(5).max(300).optional(),
  brandPrimaryColor: z.string().optional(),
  brandTextColor: z.string().optional()
});

router.get("/businesses", (req, res) => {
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.slug, b.widget_id, b.allowed_domain, b.tone, b.brand_primary_color, b.brand_text_color, b.created_at,
              b.handoff_email,
              s.plan AS subscription_plan, s.status AS subscription_status, s.current_period_end
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business_id = b.id
       ORDER BY b.id DESC`
    )
    .all();

  res.json({ businesses: rows });
});

router.post("/businesses", (req, res) => {
  const parsed = createBusinessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const widgetId = `wid_${crypto.randomBytes(8).toString("hex")}`;

  try {
    const result = db
      .prepare(
        `INSERT INTO businesses (name, slug, widget_id, allowed_domain, handoff_email, tone, brand_primary_color, brand_text_color)
         VALUES (@name, @slug, @widget_id, @allowed_domain, @handoff_email, @tone, @brand_primary_color, @brand_text_color)`
      )
      .run({
        name: parsed.data.name,
        slug: parsed.data.slug,
        widget_id: widgetId,
        allowed_domain: parsed.data.allowedDomain,
        handoff_email: parsed.data.handoffEmail ? parsed.data.handoffEmail.trim() : null,
        tone: parsed.data.tone || "friendly and concise",
        brand_primary_color: parsed.data.brandPrimaryColor || "#111111",
        brand_text_color: parsed.data.brandTextColor || "#ffffff"
      });

    db.prepare(
      `INSERT INTO subscriptions (business_id, plan, status)
       VALUES (?, 'starter', 'trialing')`
    ).run(result.lastInsertRowid);

    return res.status(201).json({
      id: result.lastInsertRowid,
      widgetId
    });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Slug already exists" });
    }
    return res.status(500).json({ error: "Failed to create business" });
  }
});

const updateBusinessSchema = z.object({
  allowedDomain: z.string().url().optional(),
  handoffEmail: z.union([z.string().email(), z.literal("")]).optional(),
  tone: z.string().min(5).max(300).optional(),
  brandPrimaryColor: z.string().optional(),
  brandTextColor: z.string().optional()
});

router.patch("/businesses/:businessId", (req, res) => {
  const businessId = Number(req.params.businessId);
  if (!Number.isInteger(businessId)) {
    return res.status(400).json({ error: "Invalid businessId" });
  }

  const parsed = updateBusinessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const current = db.prepare("SELECT id FROM businesses WHERE id = ?").get(businessId);
  if (!current) return res.status(404).json({ error: "Business not found" });

  const next = parsed.data;
  const handoffEmailProvided = Object.prototype.hasOwnProperty.call(next, "handoffEmail");
  db.prepare(
    `UPDATE businesses
     SET allowed_domain = COALESCE(@allowed_domain, allowed_domain),
         handoff_email = CASE
           WHEN @handoff_email_provided = 1 THEN @handoff_email
           ELSE handoff_email
         END,
         tone = COALESCE(@tone, tone),
         brand_primary_color = COALESCE(@brand_primary_color, brand_primary_color),
         brand_text_color = COALESCE(@brand_text_color, brand_text_color)
     WHERE id = @id`
  ).run({
    id: businessId,
    allowed_domain: next.allowedDomain,
    handoff_email_provided: handoffEmailProvided ? 1 : 0,
    handoff_email: handoffEmailProvided && next.handoffEmail ? next.handoffEmail.trim() : null,
    tone: next.tone,
    brand_primary_color: next.brandPrimaryColor,
    brand_text_color: next.brandTextColor
  });

  return res.json({ ok: true });
});

router.delete("/businesses/:businessId", (req, res) => {
  const businessId = Number(req.params.businessId);
  if (!Number.isInteger(businessId)) {
    return res.status(400).json({ error: "Invalid businessId" });
  }

  const found = db.prepare("SELECT id FROM businesses WHERE id = ?").get(businessId);
  if (!found) return res.status(404).json({ error: "Business not found" });

  db.prepare("DELETE FROM businesses WHERE id = ?").run(businessId);
  return res.json({ ok: true });
});

router.get("/businesses/:businessId/kb", (req, res) => {
  const businessId = Number(req.params.businessId);
  if (!Number.isInteger(businessId)) {
    return res.status(400).json({ error: "Invalid businessId" });
  }

  const rows = db
    .prepare(
      `SELECT id, category, title, content, created_at
       FROM business_kb_entries
       WHERE business_id = ?
       ORDER BY id DESC`
    )
    .all(businessId);

  res.json({ entries: rows });
});

const createKbSchema = z.object({
  category: z.enum(["faqs", "hours", "services", "policies", "pricing", "contact", "other"]),
  title: z.string().min(2),
  content: z.string().min(2)
});

router.post("/businesses/:businessId/kb", (req, res) => {
  const businessId = Number(req.params.businessId);
  if (!Number.isInteger(businessId)) {
    return res.status(400).json({ error: "Invalid businessId" });
  }

  const business = db.prepare("SELECT id FROM businesses WHERE id = ?").get(businessId);
  if (!business) return res.status(404).json({ error: "Business not found" });

  const parsed = createKbSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = db
    .prepare(
      `INSERT INTO business_kb_entries (business_id, category, title, content)
       VALUES (@business_id, @category, @title, @content)`
    )
    .run({
      business_id: businessId,
      category: parsed.data.category,
      title: parsed.data.title,
      content: parsed.data.content
    });

  res.status(201).json({ id: result.lastInsertRowid });
});

const updateKbSchema = z.object({
  category: z.enum(["faqs", "hours", "services", "policies", "pricing", "contact", "other"]).optional(),
  title: z.string().min(2).optional(),
  content: z.string().min(2).optional()
});

router.patch("/businesses/:businessId/kb/:entryId", (req, res) => {
  const businessId = Number(req.params.businessId);
  const entryId = Number(req.params.entryId);

  if (!Number.isInteger(businessId) || !Number.isInteger(entryId)) {
    return res.status(400).json({ error: "Invalid businessId or entryId" });
  }

  const parsed = updateKbSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const entry = db
    .prepare("SELECT id FROM business_kb_entries WHERE id = ? AND business_id = ?")
    .get(entryId, businessId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  db.prepare(
    `UPDATE business_kb_entries
     SET category = COALESCE(@category, category),
         title = COALESCE(@title, title),
         content = COALESCE(@content, content)
     WHERE id = @id AND business_id = @business_id`
  ).run({
    id: entryId,
    business_id: businessId,
    category: parsed.data.category,
    title: parsed.data.title,
    content: parsed.data.content
  });

  return res.json({ ok: true });
});

router.delete("/businesses/:businessId/kb/:entryId", (req, res) => {
  const businessId = Number(req.params.businessId);
  const entryId = Number(req.params.entryId);

  if (!Number.isInteger(businessId) || !Number.isInteger(entryId)) {
    return res.status(400).json({ error: "Invalid businessId or entryId" });
  }

  const entry = db
    .prepare("SELECT id FROM business_kb_entries WHERE id = ? AND business_id = ?")
    .get(entryId, businessId);
  if (!entry) return res.status(404).json({ error: "KB entry not found" });

  db.prepare("DELETE FROM business_kb_entries WHERE id = ? AND business_id = ?").run(entryId, businessId);
  return res.json({ ok: true });
});

module.exports = router;
