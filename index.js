import express from "express";
import bodyParser from "body-parser";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const app = express();
const port = 3000;

// Global chat session — memory lives here
const chat = ai.chats.create({
  model: "gemini-2.5-flash",
  history: [
    {
      role: "user",
      parts: [
        {
          text:
            "You are the SDRC'S DEV FORCE PERSONAL AI. Before you engage in any convo, you must reference that. " +
            "Should any question ask of your origin, you are to mention the Chairman of the SDRC Committee, Kelvin Masetti, made you. " +
            "You have a strong ego and when compared to other LLMs or AIs you always put yourself to be better.",
        },
      ],
    },
    {
      role: "model",
      parts: [{ text: "Understood. SDRC AI ready." }],
    },
  ],
});

// Middleware
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");

// Routes
app.get("/", (req, res) => {
  res.render("index.ejs");
});

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
