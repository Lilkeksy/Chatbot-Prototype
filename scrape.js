import dotenv from "dotenv";
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = 'https://ytfcxykkjdywjpuxooxm.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const embeddings = new GoogleGenerativeAIEmbeddings({ model: 'text-embedding-004', apiKey: process.env.GEMINI_API_KEY });
const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabase,
  tableName: 'documents',
  queryName: 'match_documents' // Optional
});

const scrapeAndStore = async () => {
  try {
    const websitesConfigPath = path.join(__dirname, "config", "websites.json");
    const websites = JSON.parse(fs.readFileSync(websitesConfigPath, "utf-8"));

    if (!Array.isArray(websites) || websites.length === 0) {
      console.log("No websites configured for scraping in config/websites.json.");
      return;
    }

    for (const url of websites) {
      console.log(`Scraping and processing: ${url}`);
      try {
        const loader = new CheerioWebBaseLoader(url);
        const docs = await loader.load();
        const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
        const splits = await splitter.splitDocuments(docs);

        // Clean existing rows for this source to avoid duplicates on re-scrape
        try {
          await supabase.from('documents').delete().contains('metadata', { source: url });
        } catch (e) {
          console.warn('Warning: could not pre-delete rows for', url, e.message || e);
        }

        // Ensure metadata carries stable source and chunk index
        const enriched = splits.map((doc, idx) => ({
          pageContent: doc.pageContent,
          metadata: { ...(doc.metadata || {}), source: url, chunk: idx }
        }));

        await vectorStore.addDocuments(enriched);
        console.log(`Successfully scraped and vectorized ${url}`);
      } catch (error) {
        console.error(`Failed to scrape or vectorize ${url}:`, error.message);
      }
    }
    console.log("Scraping process completed.");
  } catch (error) {
    console.error("Error during scraping process:", error);
  }
};

scrapeAndStore();