import express from "express";
import bodyParser from "body-parser";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";


dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const app = express();
const port = 3000;

const Base_URL = "https://api.api-ninjas.com/v1/quotes";

const a = "limit your responses to as short as you can be.";
const personaPrompt = fs.readFileSync(path.join("config", "sdrc-persona.txt"), "utf-8");
// Global chat session — memory lives here
const chat = ai.chats.create({
  model: "gemini-2.5-flash",
  history: [
    {
      role: "user",
      parts: [
        {
          text: personaPrompt
          
        },
      ],
    },
    {
      role: "model",
      parts: [{ text: "Understood. SDRC AI ready." }],
    },
  ],
  config: {
    temperature: 0.0,
  }
});

// Middleware
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");

// Routes

app.get("/", async (req, res) => {
    try {
      const response = await axios.get("https://api.api-ninjas.com/v1/quotes", {
        headers: {
          "X-Api-Key": process.env.QUOTE_API_KEY,
        },
      });
  
      const quote = response.data[0]; // It's an array with one object
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

// app.get("/", async (req, res) => {
//   res.render("index.ejs");
// });


app.post("/submit", async (req, res) => {
  const message = req.body.message;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid input. 'message' must be a non-empty string." });
  }

  try {
    const response = await chat.sendMessage({ message });
    return res.json({ reply: response.text });
  } catch (error) {
    console.error("Gemini API error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Something went wrong with Gemini." });
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
