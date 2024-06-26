import {configureGenkit} from "@genkit-ai/core";
import {firebase} from "@genkit-ai/firebase";
import {googleAI} from "@genkit-ai/googleai";
import {firebaseAuth} from "@genkit-ai/firebase/auth";
import {onFlow} from "@genkit-ai/firebase/functions";
import * as z from "zod";
import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {onDocumentUpdated, onDocumentCreated} from "firebase-functions/v2/firestore";
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
      const solvedWordsCountSnapshot = await solvedWordsCollection.count().get();
      const solvedWordsCount = solvedWordsCountSnapshot.data().count;

      const boardInfoCollection = db.collection("boardInfo");
      const totalWordsCountDocument = boardInfoCollection.doc("totalWordsCount");
      const totalWordsCountSnapshot = await totalWordsCountDocument.get();

      const totalWordsCount = totalWordsCountSnapshot.data()?.value;

      if (solvedWordsCount >= totalWordsCount) {
        return await resetBoard();
      } else {
        const solvedWordsCountDocument = boardInfoCollection.doc("solvedWordsCount");
        await solvedWordsCountDocument.update({
          value: FieldValue.increment(1),
        });
      }

      return null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
);


export const adminResetGame = onDocumentUpdated(
  "boardInfo/adminResetGame",
  async (event) => {
    try {
      const value = event.data?.after.data()?.value;
      const previousValue = event.data?.before.data()?.value;

      if (value == previousValue) {
        return null;
      }

      if (value === true) {
        await resetBoard();
        return event.data?.after.ref.set(
          {value: false},
        );
      }

      return null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
);


const resetBoard = async () => {
  const db = getFirestore();
  const boardInfoCollection = db.collection("boardInfo");

  const gameStatusDocument = boardInfoCollection.doc("gameStatus");
  await gameStatusDocument.update({
    value: "reset_in_progress",
  });
  await resetWords();

  const gamesCompletedCountDocument = boardInfoCollection.doc(
    "gamesCompletedCount"
  );

  await gamesCompletedCountDocument.update({
    value: FieldValue.increment(1),
  });

  await gameStatusDocument.update({
    value: "in_progress",
  });

  const solvedWordsCollection = db.collection("solvedWords");
  const snapshot = await solvedWordsCollection.get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  const solvedWordsCountDocument = boardInfoCollection.doc("solvedWordsCount");
  return solvedWordsCountDocument.update({
    value: 0,
  });
};

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
        userId: null,
      };
    });

    const update = collectionRef.doc(doc.id).update({words: updatedWords});
    promises.push(update);
  });

  return await Promise.all(promises);
};
