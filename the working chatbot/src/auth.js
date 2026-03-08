function requireAdminApiKey(req, res, next) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const providedKey = req.header("x-admin-api-key");

  if (!adminApiKey || providedKey !== adminApiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

function getOrigin(req) {
  return req.header("origin") || req.header("referer") || "";
}

function isAllowedOrigin(origin, allowedDomain) {
  if (!origin || !allowedDomain) return false;
  try {
    const requestOrigin = new URL(origin).origin;
    const allowedOrigin = new URL(allowedDomain).origin;
    return requestOrigin === allowedOrigin;
  } catch (err) {
    return origin.startsWith(allowedDomain);
  }
}

module.exports = { requireAdminApiKey, getOrigin, isAllowedOrigin };
