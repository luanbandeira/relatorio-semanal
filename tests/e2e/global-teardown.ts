import { removeFixtures } from "./fixtures";

export default async function globalTeardown() {
  await removeFixtures();
}
