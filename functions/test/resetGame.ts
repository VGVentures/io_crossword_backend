import firebaseFunctionsTest from "firebase-functions-test";
import * as admin from "firebase-admin";
import {FeaturesList} from "firebase-functions-test/lib/features";
import {resetGame} from "../src";

import {expect} from "chai";
import "mocha";

let test: FeaturesList;

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
    test.wrap(resetGame);

    const solvedWordsCountSnapshot = admin
      .firestore()
      .collection("solvedWords")
      .get();
    let solvedWordsCountDocument = await solvedWordsCountSnapshot;
    const solvedWordsCountStart = solvedWordsCountDocument.size;

    const gamesCompletedCountDocument = admin
      .firestore()
      .doc("boardInfo/gamesCompletedCount");
    const gamesCompletedCountStart = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;


    // since the number of solved words is less than the total words count, the function should not have reset the solved words count to 0
    solvedWordsCountDocument = await solvedWordsCountSnapshot;
    const solvedWordsCountEnd = solvedWordsCountDocument.size;
    console.log("solvedWordsCountEnd", solvedWordsCountEnd);
    expect(solvedWordsCountEnd).to.equal(solvedWordsCountStart);

    // the gamesCompletedCount should not have been incremented
    const gamesCompletedCountEnd = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;
    expect(gamesCompletedCountEnd).to.equal(gamesCompletedCountStart);
  }).timeout(10000);

  it("should reset solvedWordsCount to 0 and increase gamesCompletedCount if numberOfWordsSolved >= totalWordsCount", async () => {
    test.wrap(resetGame);

    const gamesCompletedCountDocument = admin
      .firestore()
      .doc("boardInfo/gamesCompletedCount");
    const gamesCompletedCountStart = (
      await gamesCompletedCountDocument.get()
    ).data()?.value;

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
