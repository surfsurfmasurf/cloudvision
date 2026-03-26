import express from "express";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

const ALLOWED_HOST = "testme0.akamaized-staging.net";
const CDN_HOST_HEADER = "testme0.akamaized.net"; // Host header sent to CDN

app.post("/api/cdn-proxy", async (req, res) => {
  const { url, method = "GET", headers = {}, body, timeoutMs = 10000, spoofIp } = req.body;

  if (!url || !url.includes(ALLOWED_HOST)) {
    return res.status(400).json({ error: `Only ${ALLOWED_HOST} URLs are allowed` });
  }

  // Build final headers:
  // 1. Start with caller-supplied headers
  // 2. Always override Host to the production CDN hostname
  // 3. Inject IP spoofing headers if spoofIp provided
  const finalHeaders = {
    ...headers,
    "Host": CDN_HOST_HEADER,
  };
  if (spoofIp) {
    finalHeaders["True-Client-IP"] = spoofIp;
    finalHeaders["X-Forwarded-For"] = spoofIp;
    finalHeaders["X-Real-IP"] = spoofIp;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions = {
      method,
      headers: finalHeaders,
      redirect: "manual",
      signal: controller.signal,
    };
    if (body !== undefined && !["GET", "HEAD"].includes(method.toUpperCase())) {
      fetchOptions.body = body;
    }

    console.log(`[proxy] ${method} ${url}`);
    console.log(`        Host: ${CDN_HOST_HEADER} | spoofIp: ${spoofIp || "none"}`);
    const response = await fetch(url, fetchOptions);
    clearTimeout(timer);

    const responseBody = await response.text();
    const responseHeaders = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      requestedHeaders: finalHeaders,
    });
  } catch (error) {
    clearTimeout(timer);
    const isTimeout = error.name === "AbortError";
    res.status(200).json({
      status: 0,
      statusText: isTimeout ? "Timeout" : "Network Error",
      headers: {},
      body: "",
      networkError: error.message,
      isTimeout,
      requestedHeaders: finalHeaders,
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`CDN Error Tester running at http://localhost:${PORT}`);
  console.log(`  Connect to : testme0.akamaized-staging.net`);
  console.log(`  Host header: testme0.akamaized.net`);
});
