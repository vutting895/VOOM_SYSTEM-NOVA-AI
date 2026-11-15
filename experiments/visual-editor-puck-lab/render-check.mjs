import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";

const config = {
  components: {
    HeadingBlock: {
      render: ({ title }) => React.createElement("h1", null, title),
    },
  },
  root: {
    render: ({ children }) => React.createElement("main", null, children),
  },
};
const data = {
  content: [
    { type: "HeadingBlock", props: { id: "heading-check", title: "NOVA Puck SSR Render Check" } },
  ],
  root: { props: {} },
};
const html = renderToStaticMarkup(React.createElement(Render, { config, data }));
if (!html.includes("NOVA Puck SSR Render Check")) {
  throw new Error("Puck Render did not produce the expected content.");
}
console.log("PUCK_RENDER_CHECK=PASS");
console.log(html);