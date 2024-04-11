import {generate, GenerateResponse} from "@genkit-ai/ai";
import {initializeGenkit} from "@genkit-ai/core";
// import {firebaseAuth} from "@genkit-ai/firebase/auth";
import {onFlow, noAuth} from "@genkit-ai/firebase/functions";
import {geminiPro} from "@genkit-ai/googleai";
import * as z from "zod";
import config from "./genkit.config.js";
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import words from "./words";
import {GenerateContentResult, GoogleGenerativeAI} from "@google/generative-ai";

initializeGenkit(config);
initializeApp({projectId: "io-crossword-dev"});

const sleep = (seconds: number) => {
  const startTime = Date.now();
  let elapsedTime = 0;

  while (elapsedTime < seconds * 1000) {
    elapsedTime = Date.now() - startTime;
  }
};

export const generateClues = onFlow(
  {
    name: "generateClues",
    inputSchema: z.object({
      prompt: z.string(),
      limit: z.number().optional(),
      batches: z.number().optional(),
      sleepSeconds: z.number().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const limit = inputs.limit || 50;
    const batches = inputs.batches || 10;
    let iterationCount = 0;
    let errors = 0;
    let successes = 0;
    let llmPromises: Promise<GenerateResponse<any>>[] = [];
    const db = getFirestore();
    for (const {word} of words) {
      iterationCount++;
      if (iterationCount > limit) {
        break;
      }
      const prompt = inputs.prompt + word;
      const llmPromise = generate({
        model: geminiPro,
        prompt: prompt,
      });
      llmPromises.push(llmPromise);
      if (iterationCount % batches === 0 || iterationCount === limit) {
        const llmResponses = await Promise.allSettled(llmPromises);
        for (const response of llmResponses) {
          if (response.status === "rejected") {
            console.log("Error generating clues: ", response.reason);
            errors++;
          } else {
            try {
              const llmResponse = response.value.text();
              const result = JSON.parse(JSON.stringify(llmResponse));
              const word = Object.keys(result)[0];
              const docRef = db.collection("words").doc(word);
              await docRef.set({clues: result[word]});
              successes++;
            } catch (error) {
              console.log("Error: ", error);
              errors++;
            }
          }
        }
        console.log(`Successes: ${successes}, Errors: ${errors}`);
        if (inputs.sleepSeconds) {
          console.log(
            `Sleeping for ${inputs.sleepSeconds} seconds after ${batches} iterations: `,
            iterationCount
          );
          sleep(inputs.sleepSeconds);
        }
        llmPromises = [];
      }
    }
    console.log(`Successes: ${successes}, Errors: ${errors}`);
    return `Successes: ${successes}, Errors: ${errors}`;
  }
);

export const generateCluesWithoutGenkit = onFlow(
  {
    name: "generateCluesWithoutGenkit",
    inputSchema: z.object({
      prompt: z.string(),
      limit: z.number().optional(),
      batches: z.number().optional(),
      sleepSeconds: z.number().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const limit = inputs.limit || 50;
    const batches = inputs.batches || 10;
    let iterationCount = 0;
    let errors = 0;
    let successes = 0;
    let llmPromises: Promise<GenerateContentResult>[] = [];
    const db = getFirestore();
    const key = process.env.GOOGLE_API_KEY as string;
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({model: "gemini-pro"});
    for (const {word} of words) {
      iterationCount++;
      if (iterationCount > limit) {
        break;
      }
      const prompt = inputs.prompt + word;
      const llmPromise = model.generateContent(prompt);
      llmPromises.push(llmPromise);
      if (iterationCount % batches === 0 || iterationCount === limit) {
        const llmResponses = await Promise.allSettled(llmPromises);
        for (const response of llmResponses) {
          if (response.status === "rejected") {
            console.log("Error generating clues: ", response.reason);
            errors++;
          } else {
            try {
              const llmResponse = response.value.response.text();
              const result = JSON.parse(JSON.stringify(llmResponse));
              const word = Object.keys(result)[0];
              const docRef = db.collection("words").doc(word);
              await docRef.set({clues: result[word]});
              successes++;
            } catch (error) {
              console.log("Error: ", error);
              errors++;
            }
          }
        }
        console.log(`Successes: ${successes}, Errors: ${errors}`);
        if (inputs.sleepSeconds) {
          console.log(
            `Sleeping for ${inputs.sleepSeconds} seconds after ${batches} iterations: `,
            iterationCount
          );
          sleep(inputs.sleepSeconds);
        }
        llmPromises = [];
      }
    }
    console.log(`Successes: ${successes}, Errors: ${errors}`);
    return `Successes: ${successes}, Errors: ${errors}`;
  }
);

export const selectClue = onFlow(
  {
    name: "selectClue",
    inputSchema: z.object({
      prompt: z.string(),
      limit: z.number().optional(),
      batches: z.number().optional(),
      sleepSeconds: z.number().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const limit = inputs.limit || 50;
    const batches = inputs.batches || 10;
    let iterationCount = 0;
    let errors = 0;
    let successes = 0;
    let llmPromises: Promise<GenerateResponse<any>>[] = [];
    const db = getFirestore();
    for (const {word} of words) {
      iterationCount++;
      if (iterationCount > limit) {
        break;
      }
      console.log(word, "=>", iterationCount);
      let prompt = inputs.prompt + word;
      const docRef = db.collection("words").doc(word);
      const doc = await docRef.get();
      const clues = doc.data()?.clues || [];
      if (clues.length > 0) {
        prompt += ` The clues are: ${clues.join(", ")}`;
      }
      const llmPromise = generate({
        model: geminiPro,
        prompt: prompt,
      });
      llmPromises.push(llmPromise);
      if (iterationCount % batches === 0 || iterationCount === limit) {
        const llmResponses = await Promise.allSettled(llmPromises);
        for (const response of llmResponses) {
          if (response.status === "rejected") {
            console.log("Error selecting clue: ", response.reason);
            errors++;
          } else {
            try {
              const llmResponse = response.value.text();
              console.log("Response: ", llmResponse);
              const result = JSON.parse(JSON.stringify(llmResponse));
              const word = Object.keys(result)[0];
              const docRef = db.collection("words").doc(word);
              await docRef.update({clue: result[word]});
              successes++;
            } catch (error) {
              console.log("Error: ", error);
              errors++;
            }
          }
        }
        console.log(`Successes: ${successes}, Errors: ${errors}`);
        if (inputs.sleepSeconds) {
          console.log(
            `Sleeping for ${inputs.sleepSeconds} seconds after ${batches} iterations: `,
            iterationCount
          );
          sleep(inputs.sleepSeconds);
        }
        llmPromises = [];
      }
    }
    return `Successes: ${successes}, Errors: ${errors}`;
  }
);

export const seedDatabase = onRequest(async (req, res) => {
  try {
    const db = getFirestore();
    for (const {word} of words) {
      await db.collection("words").doc(word).set({clues: []});
    }
    res.status(200).send("Words added to Firestore!");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error seeding database");
  }
});
