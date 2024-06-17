import {readFileSync} from "fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {doc, setDoc, getDoc} from "firebase/firestore";
import {ref, deleteObject, uploadBytes, getDownloadURL} from "firebase/storage";
import "mocha";

let testEnv: RulesTestEnvironment;
before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "io-crossword-dev",
    firestore: {
      host: "localhost",
      port: 8080,
      rules: readFileSync("../firestore.rules", "utf8"),
    },
    storage: {
      host: "localhost",
      port: 9199,
      rules: readFileSync("../storage.rules", "utf8"),
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe("boardChunks", () => {
  it("should allow read if auth != null", async () => {
    const authDb = testEnv.authenticatedContext("user_id").firestore();
    const noAuthDb = testEnv.unauthenticatedContext().firestore();

    // Can read boardChunks since auth != null
    await assertSucceeds(getDoc(doc(authDb, "boardChunks/1")));

    // Cannot read boardChunks since auth == null
    await assertFails(getDoc(doc(noAuthDb, "boardChunks/1")));

    // Cannot write to boardChunks
    await assertFails(
      setDoc(doc(authDb, "boardChunks/1"), {
        size: 10,
      })
    );
  });
});

describe("boardInfo", () => {
  it("should allow read if auth != null", async () => {
    const authDb = testEnv.authenticatedContext("user_id").firestore();
    const noAuthDb = testEnv.unauthenticatedContext().firestore();

    // Can read boardInfo since auth != null
    await assertSucceeds(getDoc(doc(authDb, "boardInfo/solvedWordsCount")));

    // Cannot read boardInfo since auth == null
    await assertFails(getDoc(doc(noAuthDb, "boardInfo/solvedWordsCount")));

    // Cannot write to boardInfo
    await assertFails(
      setDoc(doc(authDb, "boardInfo/solvedWordsCount"), {
        value: 2,
      })
    );
  });
});

describe("initialsBlacklist", () => {
  it("should allow read if auth != null", async () => {
    const authDb = testEnv.authenticatedContext("user_id").firestore();
    const noAuthDb = testEnv.unauthenticatedContext().firestore();

    // Can read initialsBlacklist since auth != null
    await assertSucceeds(getDoc(doc(authDb, "initialsBlacklist/1")));

    // Cannot read initialsBlacklist since auth == null
    await assertFails(getDoc(doc(noAuthDb, "initialsBlacklist/1")));

    // Cannot write to initialsBlacklist
    await assertFails(
      setDoc(doc(authDb, "initialsBlacklist/1"), {
        blacklist: ["C", "D"],
      })
    );
  });
});

describe("players", () => {
  it("should allow read if auth != null", async () => {
    const authDb = testEnv.authenticatedContext("user_id").firestore();
    const noAuthDb = testEnv.unauthenticatedContext().firestore();

    // Can read players since auth != null
    await assertSucceeds(getDoc(doc(authDb, "players/1")));

    // Cannot read players since auth == null
    await assertFails(getDoc(doc(noAuthDb, "players/1")));

    // Cannot write to players
    await assertFails(
      setDoc(doc(authDb, "players/1"), {
        initials: ["ASD"],
      })
    );
  });
});

describe("answers", () => {
  it("should not allow read if auth != null", async () => {
    const authDb = testEnv.authenticatedContext("user_id").firestore();
    const noAuthDb = testEnv.unauthenticatedContext().firestore();

    // Cannot read answers even if auth != null
    await assertFails(getDoc(doc(authDb, "answers/1")));

    // Cannot read answers since auth == null
    await assertFails(getDoc(doc(noAuthDb, "answers/1")));

    // Cannot write to answers
    await assertFails(
      setDoc(doc(authDb, "answers/1"), {
        answer: "hello",
      })
    );
  });
});

describe("storage", () => {
  it("should only allow read, not write, if path is 'share'", async () => {
    const noAuthStorage = testEnv.unauthenticatedContext().storage();
    const blob = new Blob(["Hello, world!"], {type: "text/plain"});
    const path = "share/example.txt";

    const shareRef = ref(noAuthStorage, path);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storage = context.storage();
      await uploadBytes(ref(storage, path), blob);
    });

    // can read object if path is 'share'
    await assertSucceeds(getDownloadURL(shareRef));

    // cannot write objects
    await assertFails(uploadBytes(shareRef, blob));
    await assertFails(deleteObject(shareRef));
  });
});
