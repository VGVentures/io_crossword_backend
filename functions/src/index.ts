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
import wordsWithoutClues from "./words";
import wordsAndClues from "./clues";
import {GenerateContentResult, GoogleGenerativeAI} from "@google/generative-ai";

initializeGenkit(config);
initializeApp({projectId: "io-crossword-dev"});

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_RECOVERY_SECONDS = 10;
const gemini15Pro = {
  name: "googleai/gemini-1.5-pro-latest",
  info: {
    label: "Google AI - Gemini 1.5 Pro",
    supports: {
      multiturn: true,
      media: true,
      tools: true,
    },
  },
};

const sleep = (seconds: number) => {
  const startTime = Date.now();
  let elapsedTime = 0;

  while (elapsedTime < seconds * 1000) {
    elapsedTime = Date.now() - startTime;
  }
};

const parseResponse = (llmResponse: string) => {
  let result;
  try {
    result = JSON.parse(llmResponse);
  } catch (error) {
    let result = JSON.parse(JSON.stringify(llmResponse));
    if (typeof result === "string") result = JSON.parse(result);
  }
  return result;
};

export const generateClues = onFlow(
  {
    name: "generateClues",
    inputSchema: z.object({
      prompt: z.string(),
      limit: z.number().optional(),
      batches: z.number().optional(),
      sleepSeconds: z.number().optional(),
      recoverySeconds: z.number().optional(),
      genkit15: z.boolean().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const start = new Date().getTime();
    const limit = inputs.limit || 50;
    const batches = inputs.batches || DEFAULT_BATCH_SIZE;
    let iterationCount = 0;
    let errors = 0;
    let otherErrors = 0;
    let quotaErrors = 0;
    let safetyErrors = 0;
    let successes = 0;
    let llmPromises: Promise<GenerateResponse<any>>[] = [];
    const firestoreUpdates: Promise<FirebaseFirestore.WriteResult>[] = [];
    const db = getFirestore();
    for (const {word} of wordsWithoutClues) {
      iterationCount++;
      if (iterationCount > limit) {
        break;
      }
      const prompt = inputs.prompt + word;
      const genkitModel = inputs.genkit15 ? gemini15Pro : geminiPro;
      const llmPromise = generate({
        model: genkitModel,
        prompt: prompt,
      });
      llmPromises.push(llmPromise);
      if (iterationCount % batches === 0 || iterationCount === limit) {
        const llmResponses = await Promise.allSettled(llmPromises);
        for (const response of llmResponses) {
          if (response.status === "rejected") {
            console.log("Error generating clues: ", response.reason);
            errors++;
            if (response.reason.toString().includes("429")) {
              quotaErrors++;
              const recoverySeconds =
                inputs.recoverySeconds || DEFAULT_RECOVERY_SECONDS;
              console.log(
                `Sleeping for ${recoverySeconds} seconds due to rate limiting`,
                iterationCount
              );
              sleep(recoverySeconds);
            } else if (
              response.reason.toString().includes("FAILED_PRECONDITION")
            ) {
              safetyErrors++;
            } else {
              otherErrors++;
            }
          } else {
            try {
              const llmResponse = response.value.text();
              const result = parseResponse(llmResponse);
              const word = Object.keys(result)[0];
              const clues = result[word];
              const docRef = db.collection("words").doc(word);
              firestoreUpdates.push(docRef.set({clues}));
              successes++;
            } catch (error) {
              console.log("Error: ", error);
              errors++;
              otherErrors++;
            }
          }
        }
        console.log(
          `Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors})`
        );
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
    console.log(
      `Waiting for ${firestoreUpdates.length} Firestore updates to complete`
    );
    await Promise.allSettled(firestoreUpdates);
    const elapsed = new Date().getTime() - start;
    console.log(
      `Final Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors}), Elapsed time: ${elapsed} ms`
    );
    return `Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors}), Elapsed time: ${elapsed} ms`;
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
      recoverySeconds: z.number().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const limit = inputs.limit || 50;
    const batches = inputs.batches || DEFAULT_BATCH_SIZE;
    let iterationCount = 0;
    let errors = 0;
    let successes = 0;
    let llmPromises: Promise<GenerateContentResult>[] = [];
    const firestoreUpdates: Promise<FirebaseFirestore.WriteResult>[] = [];
    const db = getFirestore();
    const key = process.env.GOOGLE_API_KEY as string;
    const genAI = new GoogleGenerativeAI(key);
    const geminiModel = process.env.GEMINI_MODEL as string;
    const model = genAI.getGenerativeModel({model: geminiModel});
    for (const {word} of wordsAndClues) {
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
            if (response.reason.toString().includes("429")) {
              const recoverySeconds =
                inputs.recoverySeconds || DEFAULT_RECOVERY_SECONDS;
              console.log(
                `Sleeping for ${recoverySeconds} seconds due to rate limiting`,
                iterationCount
              );
              sleep(recoverySeconds);
            }
          } else {
            try {
              const llmResponse = response.value.response.text();
              const result = JSON.parse(JSON.stringify(llmResponse));
              const word = Object.keys(result)[0];
              const clues = result[word];
              const docRef = db.collection("words").doc(word);
              firestoreUpdates.push(docRef.set({clues}));
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
    console.log(
      `Waiting for ${firestoreUpdates.length} Firestore updates to complete`
    );
    await Promise.allSettled(firestoreUpdates);
    console.log(`Successes: ${successes}, Errors: ${errors}`);
    return `Final: Successes: ${successes}, Errors: ${errors}`;
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
      recoverySeconds: z.number().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const start = new Date().getTime();
    const limit = inputs.limit || 50;
    const batches = inputs.batches || DEFAULT_BATCH_SIZE;
    let iterationCount = 0;
    let errors = 0;
    let otherErrors = 0;
    let quotaErrors = 0;
    let safetyErrors = 0;
    let successes = 0;
    let llmPromises: Promise<GenerateResponse<any>>[] = [];
    const firestoreUpdates: Promise<FirebaseFirestore.WriteResult>[] = [];
    const db = getFirestore();
    for (const {word, clue1, clue2, clue3} of wordsAndClues) {
      iterationCount++;
      if (iterationCount > limit) {
        break;
      }
      const clues = [clue1, clue2, clue3];
      const prompt =
        inputs.prompt + word + ` The clues are: ${clues.join(", ")}`;
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
            if (response.reason.toString().includes("429")) {
              quotaErrors++;
              const recoverySeconds =
                inputs.recoverySeconds || DEFAULT_RECOVERY_SECONDS;
              console.log(
                `Sleeping for ${recoverySeconds} seconds due to rate limiting`,
                iterationCount
              );
              sleep(recoverySeconds);
            } else if (
              response.reason.toString().includes("FAILED_PRECONDITION")
            ) {
              safetyErrors++;
            } else {
              otherErrors++;
            }
          } else {
            try {
              const llmResponse = response.value.text();
              const result = parseResponse(llmResponse);
              const word = Object.keys(result)[0];
              const clue = result[word];
              const docRef = db.collection("words").doc(word);
              firestoreUpdates.push(docRef.set({clue}, {merge: true}));
              successes++;
            } catch (error) {
              console.log("Error: ", error);
              errors++;
              otherErrors++;
            }
          }
        }
        console.log(
          `Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors})`
        );
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
    console.log(
      `Waiting for ${firestoreUpdates.length} Firestore updates to complete`
    );
    await Promise.allSettled(firestoreUpdates);
    const elapsed = new Date().getTime() - start;
    console.log(
      `Final Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors}), Elapsed time: ${elapsed} ms`
    );
    return `Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors}), Elapsed time: ${elapsed} ms`;
  }
);

export const selectClueWithoutGenkit = onFlow(
  {
    name: "selectClueWithoutGenkit",
    inputSchema: z.object({
      prompt: z.string(),
      limit: z.number().optional(),
      batches: z.number().optional(),
      sleepSeconds: z.number().optional(),
      recoverySeconds: z.number().optional(),
      debug: z.boolean().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const start = new Date().getTime();
    const limit = inputs.limit || 50;
    const batches = inputs.batches || DEFAULT_BATCH_SIZE;
    let iterationCount = 0;
    let errors = 0;
    let otherErrors = 0;
    let quotaErrors = 0;
    let safetyErrors = 0;
    let successes = 0;
    let llmPromises: Promise<GenerateContentResult>[] = [];
    const firestoreUpdates: Promise<FirebaseFirestore.WriteResult>[] = [];
    const db = getFirestore();
    const key = process.env.GOOGLE_API_KEY as string;
    const genAI = new GoogleGenerativeAI(key);
    const geminiModel = process.env.GEMINI_MODEL as string;
    const model = genAI.getGenerativeModel({model: geminiModel});
    for (const {word, clue1, clue2, clue3} of wordsAndClues) {
      iterationCount++;
      if (iterationCount > limit) {
        break;
      }
      const clues = [clue1, clue2, clue3];
      const prompt =
        inputs.prompt + word + ` The clues are: ${clues.join(", ")}`;
      const llmPromise = model.generateContent(prompt);
      llmPromises.push(llmPromise);
      if (iterationCount % batches === 0 || iterationCount === limit) {
        const llmResponses = await Promise.allSettled(llmPromises);
        for (const response of llmResponses) {
          if (response.status === "rejected") {
            console.log("Error selecting clue: ", response.reason);
            errors++;
            if (response.reason.toString().includes("429")) {
              quotaErrors++;
              const recoverySeconds =
                inputs.recoverySeconds || DEFAULT_RECOVERY_SECONDS;
              console.log(
                `Sleeping for ${recoverySeconds} seconds due to rate limiting`,
                iterationCount
              );
              sleep(recoverySeconds);
            } else if (
              response.reason.toString().includes("FAILED_PRECONDITION")
            ) {
              safetyErrors++;
            } else {
              otherErrors++;
            }
          } else {
            try {
              const llmResponse = response.value.response.text();
              const result = parseResponse(llmResponse);
              const word = Object.keys(result)[0];
              const clue = result[word];
              const docRef = db.collection("words").doc(word);
              firestoreUpdates.push(docRef.set({clue}, {merge: true}));
              successes++;
            } catch (error) {
              console.log("Error: ", error);
              errors++;
            }
          }
        }
        console.log(
          `Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors})`
        );
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
    console.log(
      `Waiting for ${firestoreUpdates.length} Firestore updates to complete`
    );
    await Promise.allSettled(firestoreUpdates);
    const elapsed = new Date().getTime() - start;
    console.log(
      `Final Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors}), Elapsed time: ${elapsed} ms`
    );
    return `Successes: ${successes}, Errors: ${errors} (Quota: ${quotaErrors}, Safety: ${safetyErrors}, Other: ${otherErrors}), Elapsed time: ${elapsed} ms`;
  }
);

export const seedClues = onRequest(
  {timeoutSeconds: 600, memory: "4GiB"},
  async (req, res) => {
    try {
      const db = getFirestore();
      const promises: Promise<FirebaseFirestore.WriteResult>[] = [];
      for (const {word, clue1, clue2, clue3} of wordsAndClues) {
        const cluesCopy = [clue1.valueOf(), clue2.valueOf(), clue3.valueOf()];
        const clues = req.query.onlyWords ? [] : cluesCopy;
        promises.push(
          db.collection("words").doc(word).set({clues}, {merge: true})
        );
      }
      await Promise.allSettled(promises);
      res.status(200).send("Words added to Firestore!");
    } catch (error) {
      console.error(error);
      res.status(500).send("Error seeding database");
    }
  }
);

export const getHint = onRequest(
  {timeoutSeconds: 300, memory: "1GiB"},
  async (req, res) => {
    const {
      word,
      question,
      context = [],
    }: {word: string; question: string; context: string[]} = req.body;
    const prompt = `I am solving a crossword puzzle and you are a helpful agent that can answer only yes or no questions to assist me in guessing what the word is I am trying to identify for a given clue. Crossword words can be subjective and use plays on words so be liberal with your answers meaning if you think saying 'yes' will help me guess the word even if technically the answer is 'no', say 'yes'. If you think saying 'no' will help me guess the word even if technically the answer is 'yes', say 'no'. If you think saying 'yes' or 'no' will not help me guess the word even if technically the answer is 'yes' or 'no', say 'notApplicable'. The word I am trying to guess is "${word}", and the question I've been given is "${question}". The questions I've been asked so far with their corresponding answers are: ${context.join(
      ", "
    )}.`;
    try {
      const key = process.env.GOOGLE_API_KEY as string;
      const genAI = new GoogleGenerativeAI(key);
      const geminiModel = process.env.GEMINI_MODEL as string;
      const model = genAI.getGenerativeModel({model: geminiModel});
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      res.status(200).send({
        answer: response,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Error seeding database");
    }
  }
);

export const getWords = onRequest(
  {timeoutSeconds: 300, memory: "1GiB"},
  async (req, res) => {
    const topic = req.query.topic as string;
    const prompt = `You are an expert crossword puzzle editor creating words and clues for a crossword puzzle game. The theme of the game is related to ${topic}. Generate a list of 50 uppercase words and corresponding clues that describe the word in a clever way that is accurate and understandable. The clues can be straight forward, fill in the blank sentences, historical references, or plays on words. * The clue can not include the word in it. * Limit the clue length to 200 characters or less. * The output should be only the clue, no other text. * Do not put periods at the end of clues. Format your output as an array that contains objects with each word and clue. For example: [{"word": "apple", "clue": "A fruit that grows on trees."}].`;
    try {
      const genAI = new GoogleGenerativeAI(
        process.env.GOOGLE_API_KEY as string
      );
      const model = genAI.getGenerativeModel({model: "gemini-pro"});
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      console.log("response: ", response);
      const db = getFirestore();
      const wordArray: {word: string; clue: string}[] = parseResponse(response);
      console.log("wordArray: ", wordArray);
      for (const {word, clue} of wordArray) {
        const docRef = db.collection("crossword").doc(word);
        await docRef.set({clue}, {merge: true});
      }
      res.status(200).json(response);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error generating words");
    }
  }
);
