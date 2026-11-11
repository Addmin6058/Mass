const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = "demo-no-project";
const ALICE_UID = "alice_123";
const BOB_UID = "bob_456";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

// --- UNATHENTICATED TESTS ---
test("Unauthenticated user: cannot read members", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).collection("members").get());
});

test("Unauthenticated user: cannot write expenses", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(
    unauthDb.collection("users").doc(ALICE_UID).collection("expenses").doc("exp_1").set({
      userId: ALICE_UID,
      title: "Market Bazar",
      amount: 500,
      category: "Bazar",
      date: "2026-11-10",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

// --- CROSS-USER ISOLATION TESTS ---
test("Authenticated user: cannot read another user's members", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("users").doc(ALICE_UID).collection("members").doc("mem_1").set({
      userId: ALICE_UID,
      name: "Alice Member",
      deposit: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  await assertFails(bobDb.collection("users").doc(ALICE_UID).collection("members").doc("mem_1").get());
  await assertFails(bobDb.collection("users").doc(ALICE_UID).collection("members").get());
});

test("Authenticated user: cannot write into another user's data", async () => {
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("expenses").doc("exp_bob").set({
      userId: BOB_UID,
      title: "Hacked Expense",
      amount: 500,
      category: "Bazar",
      date: "2026-11-10",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

// --- AUTHENTICATED USER TESTS ---
test("Authenticated user: can create and read their own members", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const memRef = aliceDb.collection("users").doc(ALICE_UID).collection("members").doc("mem_1");

  await assertSucceeds(
    memRef.set({
      userId: ALICE_UID,
      name: "Rahim",
      deposit: 2000,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  await assertSucceeds(memRef.get());
  await assertSucceeds(aliceDb.collection("users").doc(ALICE_UID).collection("members").get());
});

test("Authenticated user: can create and read their own expenses", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const expRef = aliceDb.collection("users").doc(ALICE_UID).collection("expenses").doc("exp_1");

  await assertSucceeds(
    expRef.set({
      userId: ALICE_UID,
      title: "Morning Fish",
      amount: 450,
      category: "Meat & Fish",
      date: "2026-11-10",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  await assertSucceeds(expRef.get());
  await assertSucceeds(aliceDb.collection("users").doc(ALICE_UID).collection("expenses").get());
});

test("Authenticated user: can create and read their own meals", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const mealRef = aliceDb.collection("users").doc(ALICE_UID).collection("meals").doc("meal_1");

  await assertSucceeds(
    mealRef.set({
      userId: ALICE_UID,
      memberId: "mem_1",
      memberName: "Rahim",
      date: "2026-11-10",
      breakfast: 1,
      lunch: 1,
      dinner: 1,
      totalMeals: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  await assertSucceeds(mealRef.get());
  await assertSucceeds(aliceDb.collection("users").doc(ALICE_UID).collection("meals").get());
});
