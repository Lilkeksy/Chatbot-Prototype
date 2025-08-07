import express from "express";
import bodyParser from "body-parser";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
const port = 3000;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = ai.models;

const Base_URL = "https://api.api-ninjas.com/v1/quotes";

// Load persona prompt from file,
const personaPrompt = fs.readFileSync(path.join("config", "sdrc-persona.txt"), "utf-8");

// Middleware
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");

// Homepage (quote)
app.get("/", async (req, res) => {
  try {
    const response = await axios.get(Base_URL, {
      headers: {
        "X-Api-Key": process.env.QUOTE_API_KEY,
      },
    });

    const quote = response.data[0];
    res.render("index.ejs", { data: quote });
  } catch (err) {
    console.error("Quote API error:", err.message);
    res.render("index.ejs", {
      data: {
        quote: "Even in silence, there is resistance.",
        author: "Unknown",
        category: "default",
      },
    });
  }
});

// Message route (stateless streaming)
app.post("/submit", async (req, res) => {
  const message = req.body.message;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid input. 'message' must be a non-empty string." });
  }

  try {
    const response = await model.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: `${personaPrompt}\n\nUser: ${message}` }],
        },
      ],
      config: {
        temperature: 0.3,
      },
    });

    let reply = "";
    for await (const chunk of response) {
      if (chunk.text) {
        reply += chunk.text;
      }
    }

    res.json({ reply });
  } catch (error) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: "Something went wrong with Gemini." });
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
