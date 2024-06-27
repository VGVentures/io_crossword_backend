import firebaseFunctionsTest from "firebase-functions-test";
import * as admin from "firebase-admin";
import {FeaturesList} from "firebase-functions-test/lib/features";
import {resetGame} from "../src/index";

import {expect} from "chai";
import "mocha";

let test: FeaturesList;
const previousWordsCount = {
  type: "solved_words_count",
  value: 0,
};
const updatedWordsCount = {
  type: "solved_words_count",
  value: 0,
};

describe("resetGame", () => {
  before(async () => {
    if (admin.apps.length == 0) admin.initializeApp();
    test = firebaseFunctionsTest(
      {projectId: "io-crossword-dev"},
      "./io-crossword-dev-53aa46e05f7f.json"
    );
  });

  after(async () => {
    test.cleanup();
  });

  it("should not do anything if numberOfWordsSolved < totalWordsCount", async () => {
    const wrapped = test.wrap(resetGame);

    const solvedWordsCountSnapshot = admin
      .firestore()
      .collection("solvedWords")
      .get();
    let solvedWordsCountDocument = await solvedWordsCountSnapshot;
    const solvedWordsCountStart = solvedWordsCountDocument.size;
    previousWordsCount.value = solvedWordsCountStart;
    updatedWordsCount.value = solvedWordsCountStart + 1;

    const gamesCompletedCountDocument = admin
      .firestore()
      .doc("boardInfo/gamesCompletedCount");
    const gamesCompletedCountStart = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;

    const beforeSnap = test.firestore.makeDocumentSnapshot(
      previousWordsCount,
      "boardInfo/solvedWordsCount"
    );
    const afterSnap = test.firestore.makeDocumentSnapshot(
      updatedWordsCount,
      "boardInfo/solvedWordsCount"
    );
    const change = test.makeChange(beforeSnap, afterSnap);

    await wrapped({data: change});

    // since the number of solved words is less than the total words count, the function should not have reset the solved words count to 0
    solvedWordsCountDocument = await solvedWordsCountSnapshot;
    const solvedWordsCountEnd = solvedWordsCountDocument.size;
    console.log("solvedWordsCountEnd", solvedWordsCountEnd);
    expect(solvedWordsCountEnd).to.equal(solvedWordsCountStart);

    // the gamesCompletedCount should not have been incremented
    const gamesCompletedCountEnd = admin
      .firestore()
      .collection("solvedWords");
    expect(gamesCompletedCountEnd).to.equal(gamesCompletedCountStart);
  }).timeout(10000);

  it("should reset solvedWordsCount to 0 and increase gamesCompletedCount if numberOfWordsSolved >= totalWordsCount", async () => {
    const wrapped = test.wrap(resetGame);

    const totalWordsCountRef = admin
      .firestore()
      .doc("boardInfo/totalWordsCount");
    const totalWordsCount = await totalWordsCountRef.get();
    previousWordsCount.value = totalWordsCount.data()?.value - 1;
    updatedWordsCount.value = totalWordsCount.data()?.value;

    const gamesCompletedCountDocument = admin
      .firestore()
      .doc("boardInfo/gamesCompletedCount");
    const gamesCompletedCountStart = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;

    const beforeSnap = test.firestore.makeDocumentSnapshot(
      previousWordsCount,
      "boardInfo/solvedWordsCount"
    );
    const afterSnap = test.firestore.makeDocumentSnapshot(
      updatedWordsCount,
      "boardInfo/solvedWordsCount"
    );
    const change = test.makeChange(beforeSnap, afterSnap);

    await wrapped({data: change});

    // since the number of solved words is equal or greater than the total words count, the function should have reset the solved words count to 0
    const solvedWordsCountSnapshot = await admin
      .firestore()
      .collection("solvedWords")
      .get();
    const solvedWordsCount = solvedWordsCountSnapshot.size;
    expect(solvedWordsCount).to.equal(0);

    // the gamesCompletedCount should have been incremented by 1
    const gamesCompletedCountEnd = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;
    expect(gamesCompletedCountEnd).to.equal(gamesCompletedCountStart + 1);
  }).timeout(10000);
});
