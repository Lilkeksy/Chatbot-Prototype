import express from "express";
import bodyParser from "body-parser";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Configure environment
dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Google AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = ai.models;

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

// Middleware setup
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

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

const generateAIResponse = async (message) => {
  const response = await model.generateContentStream({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [{ text: `${PERSONA_PROMPT}\n\nUser: ${message}` }]
    }],
    config: { temperature: 0.3 }
  });

  let reply = "";
  for await (const chunk of response) {
    if (chunk.text) {
      reply += chunk.text;
    }
  }
  return reply;
};

// Routes
app.get("/", async (req, res) => {
  try {
    const quote = await fetchDailyQuote();
    res.render("index", { data: quote });
  } catch (error) {
    console.error("Homepage error:", error);
    res.render("index", { data: DEFAULT_QUOTE });
  }
});

app.post("/submit", async (req, res) => {
  const { message } = req.body;

  // Input validation
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ 
      error: "Invalid input. 'message' must be a non-empty string." 
    });
  }

  try {
    const reply = await generateAIResponse(message.trim());
    res.json({ reply });
  } catch (error) {
    console.error("AI response error:", error);
    res.status(500).json({ 
      error: "Something went wrong with the AI service." 
    });
  }
});

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
