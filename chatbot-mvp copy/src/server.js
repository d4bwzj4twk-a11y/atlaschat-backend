require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { createSchema } = require("./db");

const adminRoutes = require("./routes/admin");
const publicRoutes = require("./routes/public");

createSchema();

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.redirect("/admin");
});

app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/admin", express.static(path.resolve(process.cwd(), "admin")));
app.use("/test-site", express.static(path.resolve(process.cwd(), "test-site")));

app.get("/widget.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(path.resolve(process.cwd(), "widget/widget.js"));
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
