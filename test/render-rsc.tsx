import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/** Await an async Server Component and render it to static HTML for assertions. */
export async function renderRSC(node: Promise<ReactElement> | ReactElement): Promise<string> {
  const el = await node;
  return renderToStaticMarkup(el);
}
