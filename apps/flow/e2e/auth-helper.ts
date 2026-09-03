import path from "path";
import dotenv from "dotenv";
import { expect, type Browser, type Cookie } from "@playwright/test";
import { SHELL_PORT } from "../playwright.config";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SHELL_ORIGIN = `http://localhost:${SHELL_PORT}`;

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

/** API sign-in avoids flaky UI login when React has not hydrated yet. */
export async function signInAndGetCookies(browser: Browser): Promise<Cookie[]> {
  const authContext = await browser.newContext();
  const csrfRes = await authContext.request.get(`${SHELL_ORIGIN}/api/auth/csrf`);
  expect(csrfRes.ok(), await csrfRes.text()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const loginRes = await authContext.request.post(`${SHELL_ORIGIN}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      redirect: "false",
      json: "true",
    },
  });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();

  const cookies = await authContext.cookies();
  await authContext.close();
  return cookies;
}
