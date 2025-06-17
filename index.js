import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";


dotenv.config();
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const port = 3000;
// const BASE_URL = "";

//Middleware
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // required for parsing JSON POST requests

//set vew engine
app.set("view engine", "ejs");


//Home route
app.get("/", (req, res) => {
    res.render("index.ejs", {

    });
});

//Chatbot endpoint
app.post("/submit", async (req, res) => {
    const message = req.body.message;
    console.log("Incoming message:", message);
    console.log("Incoming message:", req.body.message);

    if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Invalid input. 'message' must be a non-empty string." });
      }

    try {
        const result = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: message
          });

          const reply = result.text || result.response.candidates[0].content.parts[0].text;
          return res.json({ reply });

    } catch (error) {
        console.error("Gemini API error (full):", error);
    
        if (!res.headersSent) {
          return res.status(500).json({ error: "Something went wrong with Gemini." });
        }
      }
    });


// app.post("/submit", (req, res) => {
//     const input = req.body.fName;
//     res.render("index.ejs", { fullName: fullName });
//   });

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
  