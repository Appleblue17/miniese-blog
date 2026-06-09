/**
 * @file Test helpers for integration tests.
 *
 * Provides utility functions to create mock NextRequest objects
 * from standard Request objects, since NextRequest extends Request.
 */

import { NextRequest } from "next/server";

/**
 * Creates a NextRequest from a standard Request.
 * Casts are safe because we only use properties shared by both
 * (url, method, headers, body, json, formData).
 */
export function toNextRequest(request: Request): NextRequest {
  // NextRequest is a superset of Request. In test context we only
  // access properties that exist on Request (url, method, headers,
  // json(), formData()), so casting is safe.
  return request as unknown as NextRequest;
}

/**
 * Creates a NextRequest for testing with a JSON body.
 */
export function createJsonRequest(
  url: string,
  method: string,
  body: Record<string, unknown>,
): NextRequest {
  const request = new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return request as unknown as NextRequest;
}

/**
 * Creates a NextRequest for testing with form-data body.
 */
export function createFormDataRequest(
  url: string,
  formData: FormData,
): NextRequest {
  const request = new Request(url, {
    method: "POST",
    body: formData,
  });
  return request as unknown as NextRequest;
}
