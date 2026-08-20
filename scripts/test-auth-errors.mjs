import test from "node:test";
import assert from "node:assert/strict";
import { friendlyAuthError } from "../src/lib/auth/auth-error.ts";

test("wrong password → clear user-facing message", () => {
  assert.equal(
    friendlyAuthError({ code: "invalid_credentials" }),
    "Incorrect email or password. Please try again."
  );
});

test("supabase 'Invalid login credentials' message is caught", () => {
  assert.equal(
    friendlyAuthError({ message: "Invalid login credentials" }),
    "Incorrect email or password. Please try again."
  );
});

test("raw 'An API error occurred' message is caught (was leaking to users)", () => {
  assert.equal(
    friendlyAuthError({ message: "An API error occurred while processing your request." }),
    "Incorrect email or password. Please try again."
  );
});

test("user not found by code", () => {
  assert.equal(
    friendlyAuthError({ code: "user_not_found" }),
    "No account found with that email address."
  );
});

test("user not found by message", () => {
  assert.equal(
    friendlyAuthError({ message: "User not found" }),
    "No account found with that email address."
  );
});

test("rate limit by code", () => {
  assert.equal(
    friendlyAuthError({ code: "over_request_rate_limit" }),
    "Too many attempts. Please wait a moment and try again."
  );
});

test("rate limit by message", () => {
  assert.equal(
    friendlyAuthError({ message: "Too many requests" }),
    "Too many attempts. Please wait a moment and try again."
  );
});

test("network error by message", () => {
  assert.equal(
    friendlyAuthError({ message: "Failed to fetch" }),
    "Network error. Please check your connection and try again."
  );
});

test("unknown error falls back to generic message", () => {
  assert.equal(
    friendlyAuthError({ code: "some_unknown_code", message: "Something unexpected" }),
    "Sign in failed. Please check your details and try again."
  );
});

test("empty error object falls back to generic message", () => {
  assert.equal(
    friendlyAuthError({}),
    "Sign in failed. Please check your details and try again."
  );
});
