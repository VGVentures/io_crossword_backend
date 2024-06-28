import firebaseFunctionsTest from "firebase-functions-test";
import * as admin from "firebase-admin";
import {FeaturesList} from "firebase-functions-test/lib/features";
import {adminResetGame, resetGame} from "../src/index";

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
      .doc("boardInfo/solvedWordsCount")
      .get();
    let solvedWordsCountDocument = await solvedWordsCountSnapshot;
    const solvedWordsCountStart = solvedWordsCountDocument.data()?.value;
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
    const solvedWordsCountEnd = solvedWordsCountDocument.data()?.value;
    console.log("solvedWordsCountEnd", solvedWordsCountEnd);
    expect(solvedWordsCountEnd).to.equal(solvedWordsCountStart);

    // the gamesCompletedCount should not have been incremented
    const gamesCompletedCountEnd = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;
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
    const solvedWordsCount = await admin
      .firestore()
      .doc("boardInfo/solvedWordsCount")
      .get();
    expect(solvedWordsCount.data()?.value).to.equal(0);

    // the gamesCompletedCount should have been incremented by 1
    const gamesCompletedCountEnd = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;
    expect(gamesCompletedCountEnd).to.equal(gamesCompletedCountStart + 1);
  }).timeout(10000);
});


const previousAdminResetGame = {
  value: false,
};
const updatedAdminResetGame = {
  value: false,
};

describe("adminResetGame", () => {
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

  it("should not do anything if new value is false", async () => {
    const wrapped = test.wrap(adminResetGame);

    previousAdminResetGame.value = true;
    updatedAdminResetGame.value = false;

    const solvedWordsCountDocument = admin
      .firestore()
      .doc("boardInfo/solvedWordsCount");
    const solvedWordsCountStart = (
      await solvedWordsCountDocument.get()
    ).data()?.value;

    const gamesCompletedCountDocument = admin
      .firestore()
      .doc("boardInfo/gamesCompletedCount");
    const gamesCompletedCountStart = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;

    const beforeSnap = test.firestore.makeDocumentSnapshot(
      previousAdminResetGame,
      "boardInfo/adminResetGame"
    );
    const afterSnap = test.firestore.makeDocumentSnapshot(
      updatedAdminResetGame,
      "boardInfo/adminResetGame"
    );
    const change = test.makeChange(beforeSnap, afterSnap);

    await wrapped({data: change});

    // since the number of solved words is less than the total words count, the function should not have reset the solved words count to 0
    const solvedWordsCountEnd = (
      await solvedWordsCountDocument.get()
    ).data()?.value;
    expect(solvedWordsCountEnd).to.equal(solvedWordsCountStart);

    // the gamesCompletedCount should not have been incremented
    const gamesCompletedCountEnd = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;
    expect(gamesCompletedCountEnd).to.equal(gamesCompletedCountStart);
  }).timeout(10000);

  it("should reset solvedWordsCount to 0 and increase gamesCompletedCount if new value is true", async () => {
    const wrapped = test.wrap(adminResetGame);

    previousAdminResetGame.value = false;
    updatedAdminResetGame.value = true;

    const gamesCompletedCountDocument = admin
      .firestore()
      .doc("boardInfo/gamesCompletedCount");
    const gamesCompletedCountStart = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;

    const beforeSnap = test.firestore.makeDocumentSnapshot(
      previousAdminResetGame,
      "boardInfo/adminResetGame"
    );
    const afterSnap = test.firestore.makeDocumentSnapshot(
      updatedAdminResetGame,
      "boardInfo/adminResetGame"
    );
    const change = test.makeChange(beforeSnap, afterSnap);

    await wrapped({data: change});

    // since the number of solved words is equal or greater than the total words count, the function should have reset the solved words count to 0
    const solvedWordsCount = await admin
      .firestore()
      .doc("boardInfo/solvedWordsCount")
      .get();
    expect(solvedWordsCount.data()?.value).to.equal(0);

    // the gamesCompletedCount should have been incremented by 1
    const gamesCompletedCountEnd = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;
    expect(gamesCompletedCountEnd).to.equal(gamesCompletedCountStart + 1);
  }).timeout(10000);
});
