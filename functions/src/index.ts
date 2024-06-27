import {configureGenkit} from "@genkit-ai/core";
import {firebase} from "@genkit-ai/firebase";
import {googleAI} from "@genkit-ai/googleai";
import {firebaseAuth} from "@genkit-ai/firebase/auth";
import {onFlow} from "@genkit-ai/firebase/functions";
import * as z from "zod";
import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {dotprompt, prompt} from "@genkit-ai/dotprompt";

configureGenkit({
  plugins: [firebase(), googleAI({apiVersion: "v1beta"}), dotprompt()],
  logLevel: "debug",
  enableTracingAndMetrics: true,
});
initializeApp();

const getHintSchema = z.object({
  word: z.string(),
  question: z.string(),
  context: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    })
  ),
});

export const getHintKit = onFlow(
  {
    name: "getHintKit",
    httpsOptions: {cors: "*", minInstances: 1},
    inputSchema: getHintSchema,
    outputSchema: z.object({
      answer: z.string(),
    }),
    authPolicy: firebaseAuth((user) => {
      if (user.firebase?.sign_in_provider !== "anonymous") {
        throw new Error("We expect Firebase Anonymous Authentication");
      }
    }),
  },
  async (input) => {
    const cluePrompt = await prompt<z.infer<typeof getHintSchema>>("clue");
    const result = await cluePrompt.generate({input});
    return result.output() as any;
  }
);

export const resetGame = onDocumentCreated(
  "solvedWords/{docId}",
  async (event) => {
    try {
      const db = getFirestore();

      const solvedWordsCollection = db.collection("solvedWords");
      const solvedWordsSnapshot = await solvedWordsCollection.get();
      const solvedWordsCount = solvedWordsSnapshot.size;

      const collectionRef = db.collection("boardInfo");

      const totalWordsCountDocument = collectionRef.doc("totalWordsCount");
      const totalWordsCountSnapshot = await totalWordsCountDocument.get();

      const totalWordsCount = totalWordsCountSnapshot.data()?.value;

      if (solvedWordsCount >= totalWordsCount) {
        const gameStatusDocument = collectionRef.doc("gameStatus");
        await gameStatusDocument.update({
          value: "reset_in_progress",
        });
        await resetWords();

        const gamesCompletedCountDocument = collectionRef.doc(
          "gamesCompletedCount"
        );

        await gamesCompletedCountDocument.update({
          value: FieldValue.increment(1),
        });

        await gameStatusDocument.update({
          value: "in_progress",
        });

        const snapshot = await collectionRef.get();
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        return batch.commit();
      }

      return null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
);


const resetWords = async () => {
  const db = getFirestore();
  const collectionRef = db.collection("boardChunks");
  const snapshot = await collectionRef.get();
  const promises: Promise<FirebaseFirestore.WriteResult>[] = [];

  snapshot.forEach((doc) => {
    const words = doc.data()?.words;
    const updatedWords = words.map((word: any) => {
      const answer: string = word.answer;
      const updatedAnswer = " ".repeat(answer.length);

      return {
        ...word,
        answer: updatedAnswer,
        mascot: null,
        solvedTimestamp: null,
      };
    });

    const update = collectionRef.doc(doc.id).update({words: updatedWords});
    promises.push(update);
  });

  return await Promise.all(promises);
};
