import { createFixtures } from "./fixtures";

export default async function globalSetup() {
  await createFixtures();
}
