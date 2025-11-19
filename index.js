// index.js
// Simple BigCommerce shipping provider app with dummy MyRover rates

const express = require("express");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
app.use(express.json());

// Environment variables
const CLIENT_ID = process.env.BC_CLIENT_ID;
const CLIENT_SECRET = process.env.BC_CLIENT_SECRET;
const APP_URL = process.env.APP_URL; // e.g. https://myrover-gta.onrender.com
const PORT = process.env.PORT || 3000;

// Very simple in-memory token store (OK for one store in testing)
const storeTokens = new Map();

/* -------------------------------------------------------------------------- */
/*  STEP 1: OAuth installation flow                                           */
/* -------------------------------------------------------------------------- */

// BigCommerce calls this when the merchant installs the app
app.get("/api/install", (req, res) => {
  const { context, scope } = req.query;

  if (!CLIENT_ID || !APP_URL) {
    console.error("Missing CLIENT_ID or APP_URL in env vars");
    return res
      .status(500)
      .send("Server not configured correctly (CLIENT_ID / APP_URL missing).");
  }

  if (!context || !scope) {
    return res.status(400).send("Missing context or scope from BigCommerce.");
  }

  const redirectUri = `${APP_URL}/api/auth/callback`;

  const authUrl = `https://login.bigcommerce.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=${encodeURIComponent(
    scope
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&context=${encodeURIComponent(context)}`;

  console.log("Redirecting to BigCommerce OAuth:", authUrl);
  res.redirect(authUrl);
});

// OAuth callback – exchange code for access token
app.get("/api/auth/callback", async (req, res) => {
  try {
    const { code, context, scope } = req.query;

    if (!code || !context) {
      throw new Error("Missing code or context in OAuth callback.");
    }

    const storeHash = context.replace("stores/", "");
    const redirectUri = `${APP_URL}/api/auth/callback`;

    const tokenRes = await fetch("https://login.bigcommerce.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code,
        scope,
        context,
      }),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("OAuth token exchange failed:", data);
      throw new Error(data.error || "Token exchange failed");
    }

    const accessToken = data.access_token;
    storeTokens.set(storeHash, accessToken);
    console.log(`✅ Access token stored for store: ${storeHash}`);

    // Register shipping endpoints metadata
    await registerMetadata(storeHash, accessToken);

    res.send(`
      <h2>✅ MyRover GTA Carrier installed successfully</h2>
      <p>You can close this window and return to your BigCommerce admin.</p>
    `);
  } catch (err) {
    console.error("❌ OAuth callback error:", err.message);
    res
      .status(400)
      .send("OAuth callback failed. Check server logs for more details.");
  }
});

/* -------------------------------------------------------------------------- */
/*  STEP 2: shipping connection endpoint (BigCommerce "test connection")      */
/* -------------------------------------------------------------------------- */

app.all("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT", {
    method: req.method,
    headers: req.headers,
  });

  // Respond in the format BigCommerce expects
  return res.status(200).json({
    data: {
      status: "OK",
      message: "MyRover GTA Carrier connection verified",
    },
  });
});

/* -------------------------------------------------------------------------- */
/*  STEP 3: shipping rates endpoint (dummy MyRover rates for now)            */
/* -------------------------------------------------------------------------- */

app.post("/v1/shipping/rates", (req, res) => {
  const body = req.body || {};
  console.log("📦 /v1/shipping/rates request:", JSON.stringify(body, null, 2));

  // For now we ignore the cart details and return static example rates.
  // Later you can replace this with real MyRover API calls.
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
          code: "myrover_next_day_gta",
          display_name: "MyRover Next-Day Courier (GTA)",
          cost: 14.95,
        },
      },
    ],
  };

  console.log("📦 Returning rates:", response);
  return res.status(200).json(response);
});

/* -------------------------------------------------------------------------- */
/*  STEP 4: Register app metadata so BigCommerce knows our shipping URLs      */
/* -------------------------------------------------------------------------- */

async function registerMetadata(storeHash, accessToken) {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`;
  const payload = {
    data: [
      { key: "shipping_connection", value: "/v1/shipping/connection" },
      { key: "shipping_rates", value: "/v1/shipping/rates" },
    ],
  };

  console.log("📨 Registering metadata at:", url, payload);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Token": accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    console.warn("⚠️ Could not parse metadata response JSON");
  }

  if (!res.ok) {
    console.error("❌ Metadata registration failed:", res.status, data);
    return;
  }

  console.log("✅ Metadata registered successfully:", data);
}

/* -------------------------------------------------------------------------- */
/*  STEP 5: App "load" endpoint (shows inside BC admin when opening the app)  */
/* -------------------------------------------------------------------------- */

app.get("/api/load", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; text-align:center; margin-top:40px;">
        <h1>🚚 MyRover GTA Carrier</h1>
        <p>Your shipping provider app is installed and running.</p>
        <p>Dummy rates are currently returned for testing.</p>
        <p>You can now connect this app inside Shipping Zones in BigCommerce.</p>
      </body>
    </html>
  `);
});

/* -------------------------------------------------------------------------- */
/*  STEP 6: Uninstall endpoint                                                */
/* -------------------------------------------------------------------------- */

app.post("/api/uninstall", (req, res) => {
  const storeHash = req.body?.store_hash;
  if (storeHash) {
    storeTokens.delete(storeHash);
    console.log(`🗑️ Uninstalled from store ${storeHash}`);
  }
  res.status(200).json({ success: true });
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
