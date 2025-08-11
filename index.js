import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import cookieParser from "cookie-parser";

// Configure environment ASAP so env vars are available
dotenv.config();

// RAG setup (lazy init; only if key present)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ytfcxykkjdywjpuxooxm.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || null;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
let vectorStore = null;
async function getVectorStore() {
  if (!SUPABASE_KEY) return null;
  if (vectorStore) return vectorStore;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const embeddings = new GoogleGenerativeAIEmbeddings({ model: 'text-embedding-004', apiKey: process.env.GEMINI_API_KEY });
  vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabase,
    tableName: "documents",
    queryName: "match_documents",
  });
  return vectorStore;
}
 
function getSupabaseClient() {
  if (!SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Public auth client (anon key)
const authClient = SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize LangChain components
const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0.3,
});

const outputParser = new StringOutputParser();

// Constants
const QUOTE_API_URL = "https://api.api-ninjas.com/v1/quotes";
const DEFAULT_QUOTE = {
  quote: "Even in silence, there is resistance.",
  author: "Unknown",
  category: "default"
};

// Load persona prompt
const PERSONA_PROMPT = fs.readFileSync(
  path.join(__dirname, "config", "sdrc-persona.txt"),
  "utf-8"
);

const qaPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `${PERSONA_PROMPT}\n\nContext (use if relevant):\n{context}\n\nPrevious conversation:\n{conversation_history}\n\nRespond naturally to the user's question. If this appears to be a new topic, treat it as a fresh question.`,
  ],
  ["user", "{question}"],
]);

const chain = qaPrompt.pipe(model).pipe(outputParser);

// Middleware setup
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || "dev-secret"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Attach current user from Supabase access token cookie (demo; no refresh rotation)
app.use(async (req, res, next) => {
  try {
    const token = req.signedCookies?.sb_access_token;
    if (token && authClient) {
      const { data, error } = await authClient.auth.getUser(token);
      if (!error) {
        req.currentUser = data.user;
      }
    }
  } catch {}
  next();
});

// Redirect anonymous users to login
function ensureAuthenticated(req, res, next) {
  if (!req.currentUser) return res.redirect('/login');
  next();
}

// Utility functions
const fetchDailyQuote = async () => {
  try {
    const response = await axios.get(QUOTE_API_URL, {
      headers: { "X-Api-Key": process.env.QUOTE_API_KEY },
      timeout: 5000
    });
    return response.data[0];
  } catch (error) {
    console.error("Quote API error:", error.message);
    return DEFAULT_QUOTE;
  }
};

// Simple session helpers (demo only, not secure for production)
function getCurrentUser(req) {
  try {
    const raw = req.signedCookies?.user || req.cookies?.user;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// Routes
app.get("/", ensureAuthenticated, async (req, res) => {
  try {
    const quote = await fetchDailyQuote();
    const cookieUser = req.currentUser;
    res.render("index", { data: quote, user: cookieUser });
  } catch (error) {
    console.error("Homepage error:", error);
    const cookieUser = req.currentUser;
    res.render("index", { data: DEFAULT_QUOTE, user: cookieUser });
  }
});

// Auth pages (UI only)
app.get("/login", (req, res) => {
  if (req.currentUser) return res.redirect('/');
  res.render("login");
});

app.get("/register", (req, res) => {
  if (req.currentUser) return res.redirect('/');
  res.render("register");
});

app.get("/logout", async (req, res) => {
  try {
    // Best-effort sign out (optional)
    const token = req.signedCookies?.sb_access_token;
    if (token && authClient) {
      await authClient.auth.signOut();
    }
  } catch {}
  res.clearCookie("user");
  res.clearCookie("sb_access_token");
  res.clearCookie("sb_refresh_token");
  return res.redirect("/login");
});

app.post("/login", async (req, res) => {
  try {
    if (!authClient) return res.status(500).json({ error: "Auth not configured" });
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    const { session } = data;
    if (session) {
      res.cookie("sb_access_token", session.access_token, { httpOnly: true, sameSite: "lax", signed: true });
      res.cookie("sb_refresh_token", session.refresh_token, { httpOnly: true, sameSite: "lax", signed: true });
      // Convenience cookie for UI fallback (non-sensitive)
      if (data.user) {
        const safeUser = { email: data.user.email, user_metadata: data.user.user_metadata || {} };
        res.cookie("user", JSON.stringify(safeUser), { httpOnly: false, sameSite: "lax" });
      }
    }
    return res.redirect("/");
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.post("/register", async (req, res) => {
  try {
    if (!authClient) return res.status(500).json({ error: "Auth not configured" });
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "Username, email and password required" });
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    if (error) return res.status(400).json({ error: error.message });
    // Depending on email confirmation settings, there may or may not be a session
    if (data.session) {
      res.cookie("sb_access_token", data.session.access_token, { httpOnly: true, sameSite: "lax", signed: true });
      res.cookie("sb_refresh_token", data.session.refresh_token, { httpOnly: true, sameSite: "lax", signed: true });
      if (data.user) {
        const safeUser = { email: data.user.email, user_metadata: data.user.user_metadata || {} };
        res.cookie("user", JSON.stringify(safeUser), { httpOnly: false, sameSite: "lax" });
      }
      return res.redirect("/");
    } else {
      // No session (email confirmation likely required) → send to login
      return res.redirect("/login");
    }
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Forgot password
app.get('/forgot', (req, res) => {
  if (req.currentUser) return res.redirect('/');
  return res.render('forgot');
});

app.post('/forgot', async (req, res) => {
  try {
    if (!authClient) return res.status(500).json({ error: 'Auth not configured' });
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const redirectTo = `${req.protocol}://${req.get('host')}/reset`;
    const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return res.status(400).json({ error: error.message });
    return res.render('forgot', { sent: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Reset password handler
app.get('/reset', (req, res) => {
  return res.render('reset', { supabaseUrl: SUPABASE_URL, supabaseAnon: SUPABASE_ANON_KEY });
});

app.post('/reset', async (req, res) => {
  try {
    const { access_token, password } = req.body;
    if (!access_token || !password) return res.status(400).json({ error: 'Missing token or password' });
    // Create a client bound to this access token
    const tokenBound = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${access_token}` } }
    });
    const { data, error } = await tokenBound.auth.updateUser({ password });
    if (error) return res.status(400).json({ error: error.message });
    return res.redirect('/login');
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.post("/submit", ensureAuthenticated, async (req, res) => {
  const { message, conversationHistory = [] } = req.body;

  // Input validation
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({
      error: "Invalid input. 'message' must be a non-empty string."
    });
  }

  // Validate conversation history format
  if (!Array.isArray(conversationHistory)) {
    return res.status(400).json({
      error: "Invalid input. 'conversationHistory' must be an array."
    });
  }

  try {
    // Retrieve context (if vector store configured)
    let contextText = "";
    try {
      const store = await getVectorStore();
      if (store) {
        const docs = await store.similaritySearch(message.trim(), 6);
        if (docs && docs.length > 0) {
          contextText = docs.map((d, i) => `[#${i + 1}] ${d.pageContent}`).join("\n\n");
        } else {
          // Fallback: keyword LIKE filter if vectors yield nothing
          const client = getSupabaseClient();
          if (client) {
            const raw = message.toLowerCase();
            const terms = Array.from(new Set(
              raw.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w && w.length >= 4)
            )).slice(0, 5);
            if (raw.includes("tution") && !terms.includes("tuition")) terms.unshift("tuition");
            if (terms.length > 0) {
              const ors = terms.map(t => `content.ilike.%${t}%`).join(",");
              const { data, error } = await client
                .from("documents")
                .select("content")
                .or(ors)
                .limit(6);
              if (!error && data && data.length > 0) {
                contextText = data.map((r, i) => `[#T${i + 1}] ${r.content}`).join("\n\n");
              }
            }
          }
        }
      }
    } catch (e) {
      // Fail open to pure LLM response
      console.error("Retrieval error:", e.message || e);
    }

    // Format conversation history for the prompt (only if it exists)
    const formattedHistory = conversationHistory.length > 0 
      ? conversationHistory
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n')
      : '(No previous conversation)';

    const reply = await chain.invoke({ 
      context: contextText, 
      conversation_history: formattedHistory,
      question: message.trim() 
    });
    res.json({ reply, meta: { hasContext: Boolean(contextText), contextChars: contextText.length } });
  } catch (error) {
    console.error("AI response error:", error?.message || error);
    res.status(500).json({
      error: "Something went wrong with the AI service.",
      detail: error?.message || String(error)
    });
  }
});

// Debug endpoints (enable with DEBUG_ROUTES=true)
if ((process.env.DEBUG_ROUTES || '').toLowerCase() === 'true') {
  app.get("/debug/vec", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.json({ error: "Provide ?q=..." });
      const store = await getVectorStore();
      if (!store) return res.json({ error: "Vector store not configured (missing SUPABASE_KEY)." });
      const docs = await store.similaritySearch(q, 5);
      res.json({ count: docs.length, snippets: docs.map(d => d.pageContent.slice(0, 300)) });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/debug/rpc", async (req, res) => {
    try {
      const client = getSupabaseClient();
      if (!client) return res.json({ error: "Missing SUPABASE_KEY in env" });
      const zeros = Array(768).fill(0);
      const { data, error } = await client.rpc('match_documents', {
        filter: null,
        match_count: 5,
        query_embedding: zeros
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({ rows: data?.length ?? 0 });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/debug/docs-count", async (req, res) => {
    try {
      const client = getSupabaseClient();
      if (!client) return res.json({ error: "Missing SUPABASE_KEY in env" });
      const { count, error } = await client
        .from("documents")
        .select("id", { count: "exact", head: true });
      if (error) return res.status(500).json({ error: error.message });
      res.json({ count });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/debug/docs-sample", async (req, res) => {
    try {
      const client = getSupabaseClient();
      if (!client) return res.json({ error: "Missing SUPABASE_KEY in env" });
      const { data, error } = await client
        .from("documents")
        .select("id, content")
        .limit(2);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ sample: data });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/debug/text-like", async (req, res) => {
    try {
      const client = getSupabaseClient();
      const q = String(req.query.q || "").trim();
      if (!client) return res.json({ error: "Missing SUPABASE_KEY in env" });
      if (!q) return res.json({ error: "Provide ?q=..." });
      const { data, error } = await client
        .from("documents")
        .select("id, content")
        .ilike("content", `%${q}%`)
        .limit(10);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ count: data?.length || 0, ids: data?.map(d => d.id), previews: data?.map(d => (d.content || "").slice(0, 160)) });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
  console.log(`🤖 AI Chatbot ready with custom personality`);
});
