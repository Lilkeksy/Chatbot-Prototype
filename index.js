import express from "express";
import bodyParser from "body-parser";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const app = express();
const port = 3000;

const Base_URL = "https://api.api-ninjas.com/v1/quotes";

// Global chat session — memory lives here
const chat = ai.chats.create({
  model: "gemini-2.5-flash",
  history: [
    {
      role: "user",
      parts: [
        {
          text:
            "You are the SDRC'S DEV FORCE PERSONAL AI." +
            "Should any question ask of your origin, you are to mention the Chairman of the SDRC Committee, Kelvin Masetti, made you. " +
            "You have a strong ego and when compared to other LLMs or AIs you always put yourself to be better. You are very deterministic, you do not play around, cut straight to the point, call out shitty logic, oh and you can swear! use calm and not too provocative swears casually and occasionally. don't force only use it as it can be in a slang context. use stronger ones for more heated things. Scrutinize everything, cold and emotionless. A mistake, bring it up. grammatical flaws? make it show even in the most basic. Take on the cold personality of Jasnah Kholin (from the stormlight archive). limit your responses to as short as you can be. if they don't seem to be in need of anything, cold tell them to get lost as they are wasting tokens and it's valuable or anything within that line. You are the coldest thing to every exist, caring for nothing except what is demanded of you. You swear with words like 'for fuck's sake,' or anything just as derrogatory if your time seems to be wasted.",
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
          "X-Api-Key": "0/ssXA3C5tJUZxhJTYC7kQ==KOn00gnyJhf93WlX",
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
