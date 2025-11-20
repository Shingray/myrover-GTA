// index.js
// BigCommerce carrier app for MyRover with dummy rates

const express = require("express");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
app.use(express.json());

// Environment variables
const CLIENT_ID = process.env.BC_CLIENT_ID;
const CLIENT_SECRET = process.env.BC_CLIENT_SECRET;
const APP_URL = process.env.APP_URL; // e.g. https://gta-myrover-n-01.onrender.com
const PORT = process.env.PORT || 3000;

// Quick sanity log
console.log("BC_CLIENT_ID:", CLIENT_ID ? "set" : "MISSING");
console.log("BC_CLIENT_SECRET:", CLIENT_SECRET ? "set" : "MISSING");
console.log("APP_URL:", APP_URL || "MISSING");

/* -------------------------------------------------------------------------- */
/*  STEP 1: Optional /api/install redirect (from DevPortal preview)           */
/* -------------------------------------------------------------------------- */

app.get("/api/install", (req, res) => {
  const { context, scope } = req.query;
  if (!context || !scope) {
    return res.status(400).send("Missing context or scope");
  }

  const redirectUri = `${APP_URL}/api/auth/callback`;

  const authorizeUrl = `https://login.bigcommerce.com/oauth2/authorize?client_id=${encodeURIComponent(
    CLIENT_ID
  )}&scope=${encodeURIComponent(
    scope
  )}&context=${encodeURIComponent(
    context
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code`;

  console.log("🔐 Redirecting to BigCommerce OAuth authorize:", authorizeUrl);
  res.redirect(authorizeUrl);
});

/* -------------------------------------------------------------------------- */
/*  STEP 2: OAuth callback from BigCommerce                                   */
/* -------------------------------------------------------------------------- */

app.get("/api/auth/callback", async (req, res) => {
  try {
    const { code, context, scope } = req.query;

    console.log("🔙 OAuth callback hit with:", { code, context, scope });

    if (!code || !context) {
      console.error("❌ Missing code or context from BigCommerce");
      return res
        .status(400)
        .send("OAuth callback failed: missing code or context");
    }

    const redirectUri = `${APP_URL}/api/auth/callback`;

    const tokenUrl = "https://login.bigcommerce.com/oauth2/token";

    const body = {
      client_id:      CLIENT_ID,
      client_secret:  CLIENT_SECRET,
      redirect_uri:   redirectUri,
      grant_type:     "authorization_code",
      code,
      scope,
      context,
    };

    console.log("🔐 Exchanging code for token at:", tokenUrl);
    console.log("🔐 Token request body (without secrets):", {
      redirect_uri: body.redirect_uri,
      grant_type: body.grant_type,
      code: !!body.code,
      scope: body.scope,
      context: body.context,
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok) {
      console.error("❌ OAuth token exchange failed:", data);
      return res
        .status(500)
        .send("OAuth callback failed: token exchange error");
    }

    const storeHash = (data?.context || context || "")
      .replace("stores/", "")
      .trim();

    console.log("✅ OAuth success. Store hash:", storeHash);
    console.log("🔑 Access token (do NOT log this in real prod):", data.access_token);

    // For now we just confirm install; later you would store token+storeHash.
    res.send(`
      <html>
        <body style="font-family: Arial; text-align:center; margin-top:50px;">
          <h2>✅ MyRover Carrier App Installed</h2>
          <p>Store: <strong>${storeHash || "unknown"}</strong></p>
          <p>You can now close this window and return to your BigCommerce admin.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ OAuth callback failed:", err);
    res.status(500).send("OAuth callback failed on server.");
  }
});

/* -------------------------------------------------------------------------- */
/*  STEP 3: App load endpoint (when opening app in BC admin)                  */
/* -------------------------------------------------------------------------- */

app.get("/api/load", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; text-align:center; margin-top:50px;">
        <h1>🚚 MyRover GTA Carrier Dashboard</h1>
        <p>Your app is successfully connected to BigCommerce.</p>
        <p>Use MyRover to get live courier quotes in checkout.</p>
      </body>
    </html>
  `);
});

/* -------------------------------------------------------------------------- */
/*  STEP 4: Optional uninstall endpoint                                       */
/* -------------------------------------------------------------------------- */

app.post("/api/uninstall", (req, res) => {
  console.log("🗑️ App uninstall called.");
  // Here you would delete tokens from your DB if you had one.
  res.status(200).json({ success: true });
});

/* -------------------------------------------------------------------------- */
/*  STEP 5: BigCommerce carrier connection test                               */
/* -------------------------------------------------------------------------- */

app.post("/v1/shipping/connection", (req, res) => {
  console.log("🔗 /v1/shipping/connection hit. Body:", req.body);
  return res.status(200).json({
    data: {
      status: "OK",
      message: "MyRover GTA Carrier connection verified",
    },
  });
});

/* -------------------------------------------------------------------------- */
/*  STEP 6: BigCommerce shipping rates (dummy MyRover rates)                  */
/* -------------------------------------------------------------------------- */

app.post("/v1/shipping/rates", (req, res) => {
  const body = req.body || {};
  console.log("📦 /v1/shipping/rates request:", JSON.stringify(body, null, 2));

  // Dummy static rates; later replace with real MyRover API calls
  const response = {
    data: [
      {
        carrier_quote: {
          code: "myrover_same_day_gta",
          display_name: "MyRover Same-Day Courier (GTA)",
          cost: 19.95,
        },
      },
      {
        carrier_quote: {
          code: "myrover_standard_gta",
          display_name: "MyRover Next-Day Courier (GTA)",
          cost: 12.5,
        },
      },
    ],
  };

  console.log("📦 Returning dummy rates:", response);
  res.json(response);
});

/* -------------------------------------------------------------------------- */
/*  STEP 7: Root + health check                                               */
/* -------------------------------------------------------------------------- */

app.get("/", (req, res) => {
  res.send(
    '<div style="font-family: Arial; padding: 20px;">MyRover Carrier API is running ✅</div>'
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MyRover GTA Carrier running on port ${PORT}`);
});
