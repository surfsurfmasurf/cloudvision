import express from "express";
import https from "https";
import dns from "dns/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

const STAGING_HOST = "testme0.akamaized-staging.net";
const CDN_HOST     = "testme0.akamaized.net";

// Cache edge IP (works across warm invocations; re-resolved per cold start)
let edgeIp = null;
async function getEdgeIp() {
  if (edgeIp) return edgeIp;
  const result = await dns.lookup(STAGING_HOST);
  edgeIp = result.address;
  console.log(`[dns] ${STAGING_HOST} → ${edgeIp}`);
  return edgeIp;
}

app.get("/api/edge-ip", async (req, res) => {
  try {
    edgeIp = null; // force re-resolve on each UI call
    const ip = await getEdgeIp();
    res.json({ ip, stagingHost: STAGING_HOST, cdnHost: CDN_HOST });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function makeRequest({ ip, path, method, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://${CDN_HOST}${path}`);
    const options = {
      hostname: ip,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: { ...headers, "Host": CDN_HOST },
      servername: CDN_HOST,
      rejectUnauthorized: true,
      timeout: timeoutMs,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => resolve({
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: res.headers,
        body: data,
        requestedHeaders: options.headers,
        connectedIp: ip,
      }));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(Object.assign(new Error("Timeout"), { isTimeout: true }));
    });
    req.on("error", reject);

    if (body && !["GET", "HEAD"].includes(method.toUpperCase())) req.write(body);
    req.end();
  });
}

app.post("/api/cdn-proxy", async (req, res) => {
  const { path = "/rsa", method = "GET", headers = {}, body, timeoutMs = 10000, spoofIp } = req.body;

  const finalHeaders = { ...headers };
  if (spoofIp) {
    finalHeaders["True-Client-IP"] = spoofIp;
    finalHeaders["X-Forwarded-For"] = spoofIp;
    finalHeaders["X-Real-IP"]       = spoofIp;
  }

  try {
    const ip = await getEdgeIp();
    console.log(`[proxy] ${method} https://${CDN_HOST}${path} → ${ip}`);
    const result = await makeRequest({ ip, path, method, headers: finalHeaders, body, timeoutMs });
    res.json(result);
  } catch (error) {
    res.json({
      status: 0,
      statusText: error.isTimeout ? "Timeout" : "Network Error",
      headers: {},
      body: "",
      networkError: error.message,
      isTimeout: !!error.isTimeout,
      requestedHeaders: finalHeaders,
    });
  }
});

// Local dev only — Vercel handles listening in production
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, async () => {
    console.log(`CDN Error Tester running at http://localhost:${PORT}`);
    try {
      const ip = await getEdgeIp();
      console.log(`  Edge IP : ${ip} (via ${STAGING_HOST})`);
      console.log(`  CDN Host: ${CDN_HOST}`);
    } catch (e) {
      console.warn(`  DNS resolve failed: ${e.message}`);
    }
  });
}

export default app;
