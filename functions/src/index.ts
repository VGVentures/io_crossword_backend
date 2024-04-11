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
  console.log(`Sleeping for ${seconds} seconds`);
  const startTime = Date.now();
  let elapsedTime = 0;

  while (elapsedTime < seconds * 1000) {
    elapsedTime = Date.now() - startTime;
  }
};

export const generateClues = onFlow(
  {
    name: "generateClues",
    inputSchema: z.number(),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (input) => {
    const numberOfClues = 3;
    const basePrompt = `You are a helpful model that generates interesting clues for a technology focused crossword. For the following word, generate ${numberOfClues} clues. Clues should not include double quotation marks. Format your response as a valid json object with the word as the key and the value as an array of three clues. It is very important that the JSON object is valid since it's going to be parsed, so it shouldn't have any unexpected characters, just include the JSON object without anything else. The word is: `;

    const limit = input || 50;
    let iterationCount = 0;
    const db = getFirestore();
    let errors = 0;
    let successes = 0;
    for (const {word} of words) {
      if (iterationCount >= limit) {
        break;
      }
      const docRef = db.collection("words").doc(word);
      console.log(word, "=>", iterationCount);
      const prompt = basePrompt + word;
      try {
        const llmResponse = await generate({
          model: geminiPro,
          prompt: prompt,
        });
        console.log(word, "=>", llmResponse.text());
        await docRef.set(JSON.parse(JSON.stringify(llmResponse.text())));
        successes++;
      } catch (error) {
        if (error instanceof SyntaxError) {
          console.log("Error parsing JSON: ", error.message);
          await docRef.update({error: "Error parsing JSON"});
        } else {
          console.log("Error generating clues: ", error);
          await docRef.update({error: "Error generating clues"});
        }
        errors++;
      }
      iterationCount++;
    }
    return `Successes: ${successes}, Errors: ${errors}`;
  }
);

export const generateCluesParallel = onFlow(
  {
    name: "generateCluesParallel",
    inputSchema: z.object({
      prompt: z.string(),
      limit: z.number().optional(),
      sleepSeconds: z.number().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const limit = inputs.limit || 50;
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
      if (iterationCount % 10 === 0 || iterationCount === limit) {
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
          sleep(inputs.sleepSeconds);
          console.log(
            `Sleeping for ${inputs.sleepSeconds} seconds after 10 iterations: `,
            iterationCount
          );
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
      sleepSeconds: z.number().optional(),
    }),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (inputs) => {
    const limit = inputs.limit || 50;
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
      const llmPromise: Promise<GenerateContentResult> =
        model.generateContent(prompt);
      llmPromises.push(llmPromise);
      if (iterationCount % 10 === 0 || iterationCount === limit) {
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
          sleep(inputs.sleepSeconds);
          console.log(
            `Sleeping for ${inputs.sleepSeconds} seconds after 10 iterations: `,
            iterationCount
          );
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
    inputSchema: z.number(),
    outputSchema: z.string(),
    authPolicy: noAuth(),
  },
  async (input) => {
    const numberOfClues = 3;
    const basePrompt = `You are an expert crossword puzzle editor who is reviewing a long list of crossword words that have ${numberOfClues} options of clues that you are evaluating to ensure the following: the clues are accurate for the given word, the clues are of high quality, the clues are appropriate for the general population, the clues are not offensive. Take your time, be thoughtful, thorough in choosing the right option when you can. If there is no good clue, think of a better one and replace it. The output should be only the clue, no other text. Do not put periods at the end of clues. Clues should not include double quotation marks. Format your response as a json object with the word 'selectedClue' as the key and the value as the clue. For example: {"selectedClue": "A fruit that grows on trees"}. The words to use is: `;

    const limit = input || 50;
    let iterationCount = 0;
    const db = getFirestore();
    let errors = 0;
    let successes = 0;
    for (const {word} of words) {
      if (iterationCount >= limit) {
        break;
      }
      console.log(word, "=>", iterationCount);
      let prompt = basePrompt + word;
      const docRef = db.collection("words").doc(word);
      const doc = await docRef.get();
      const clues = doc.data()?.clues || [];
      if (clues.length > 0) {
        prompt += ` The clues are: ${clues.join(", ")}`;
      }
      try {
        const llmResponse = await generate({
          model: geminiPro,
          prompt: prompt,
        });
        await docRef.set({clues, ...JSON.parse(llmResponse.text())});
        successes++;
      } catch (error) {
        if (error instanceof SyntaxError) {
          console.log("Error parsing JSON: ", error.message);
          await docRef.update({error: "Error parsing JSON"});
        } else {
          console.log("Error generating clues: ", error);
          await docRef.update({error: "Error generating clues"});
        }
        errors++;
      }
      iterationCount++;
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
